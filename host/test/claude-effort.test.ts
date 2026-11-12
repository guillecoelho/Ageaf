import assert from 'node:assert/strict';
import test from 'node:test';

import { effortFromThinkingTokens } from '../src/runtimes/claude/agent.js';

test('legacy thinking modes map to effort levels', () => {
  assert.equal(effortFromThinkingTokens(null), undefined);
  assert.equal(effortFromThinkingTokens(1024), 'low');
  assert.equal(effortFromThinkingTokens(4096), 'medium');
  assert.equal(effortFromThinkingTokens(8192), 'high');
  assert.equal(effortFromThinkingTokens(16384), 'xhigh');
});
