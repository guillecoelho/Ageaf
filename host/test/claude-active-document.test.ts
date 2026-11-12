import assert from 'node:assert/strict';
import test from 'node:test';

import type { JobEvent } from '../src/types.js';

test('Claude job sends the active document once, then a diff, then full after compaction', async () => {
  const previous = { ...process.env };
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.AGEAF_CLAUDE_MOCK;
  process.env.AGEAF_DISABLE_CLAUDE_CLI_DETECT = 'true';

  const { setClaudeQueryForTests, resetClaudeQueryForTests } = await import('../src/runtimes/claude/agent.js');
  const { runClaudeJob } = await import('../src/runtimes/claude/run.js');

  const prompts: string[] = [];
  let compactNext = false;
  setClaudeQueryForTests(((request: { prompt: unknown }) => {
    prompts.push(String(request.prompt));
    const messages: Record<string, unknown>[] = [];
    if (compactNext) messages.push({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 1 } });
    messages.push({ type: 'result', subtype: 'success', result: 'ok', session_id: 's1' });
    return { async *[Symbol.asyncIterator]() { yield* messages; } } as any;
  }) as any);

  const body = Array.from({ length: 100 }, (_, i) => `Paragraph ${i}.`).join('\n');
  const run = (content: string) =>
    runClaudeJob(
      {
        action: 'chat',
        context: { message: 'hi there, check this', activeDocument: { path: 'main.tex', content } },
        runtime: { claude: { conversationId: 'conv-active-doc' } },
      },
      (_e: JobEvent) => {}
    );

  try {
    await run(body);
    assert.ok(prompts[0].includes('Paragraph 99.'), 'first turn has full document');

    const edited = body.replace('Paragraph 50.', 'Paragraph 50 (edited).');
    compactNext = true; // this turn compacts -> next turn must resend in full
    await run(edited);
    assert.ok(prompts[1].includes('+Paragraph 50 (edited).'), 'second turn has diff');
    assert.ok(!prompts[1].includes('Paragraph 99.'), 'second turn has no full document');

    compactNext = false;
    await run(edited);
    assert.ok(prompts[2].includes('Paragraph 99.'), 'after compaction the full document is resent');
    assert.ok(!prompts[2].includes('\\n\\n'), 'prompt uses real newlines');
  } finally {
    resetClaudeQueryForTests();
    process.env = previous;
  }
});
