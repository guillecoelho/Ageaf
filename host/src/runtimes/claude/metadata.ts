import { query, type ModelInfo } from '@anthropic-ai/claude-agent-sdk';

import { getClaudeSessionCwd } from './cwd.js';
import { parseEnvironmentVariables, resolveClaudeCliPath, getEnhancedPath } from './cli.js';
import type { ClaudeRuntimeConfig } from './agent.js';

const FALLBACK_MODELS: ModelInfo[] = [
  {
    value: 'sonnet',
    displayName: 'Sonnet',
    description: 'Best for everyday task',
  },
  {
    value: 'opus',
    displayName: 'Opus',
    description: 'Most capable for complex work',
  },
  {
    value: 'fable',
    displayName: 'Fable',
    description: 'For your toughest challenges',
  },
  {
    value: 'haiku',
    displayName: 'Haiku',
    description: 'Fastest for quick answers',
  },
];

function buildRuntimeEnv(runtime?: ClaudeRuntimeConfig) {
  const customEnv = parseEnvironmentVariables(runtime?.envVars ?? '');
  const resolvedCliPath = resolveClaudeCliPath(runtime?.cliPath, customEnv.PATH);
  const combinedEnv = {
    ...process.env,
    ...customEnv,
    PATH: getEnhancedPath(customEnv.PATH, resolvedCliPath ?? runtime?.cliPath),
  };

  const apiKey =
    customEnv.ANTHROPIC_API_KEY ??
    customEnv.ANTHROPIC_AUTH_TOKEN ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_AUTH_TOKEN;

  return {
    combinedEnv,
    resolvedCliPath,
    apiKey,
  };
}

// Keep the family aliases (opus, sonnet, fable, haiku): they always resolve to the
// newest version and the SDK labels them with it ("Opus 5.5"). Pinned ids
// (claude-opus-4-8, ...) and the 'default' entry are dropped to keep the picker short.
// ponytail: add pinned versions behind a setting if someone needs an older model.
export function filterKnownModels(models: ModelInfo[]) {
  const aliases = models.filter(
    (model) => model.value !== 'default' && !model.value.startsWith('claude-')
  );
  return aliases.length > 0 ? aliases : FALLBACK_MODELS;
}

export async function getClaudeSupportedModels(
  runtime?: ClaudeRuntimeConfig
): Promise<ModelInfo[]> {
  if (process.env.AGEAF_CLAUDE_MOCK === 'true') {
    return FALLBACK_MODELS;
  }

  const { combinedEnv, resolvedCliPath, apiKey } = buildRuntimeEnv(runtime);
  if (!resolvedCliPath && !apiKey) {
    return FALLBACK_MODELS;
  }

  try {
    const response = query({
      prompt: 'List available models.',
      options: {
        cwd: getClaudeSessionCwd(runtime),
        permissionMode: 'default',
        pathToClaudeCodeExecutable: resolvedCliPath ?? undefined,
        settingSources: runtime?.loadUserSettings ? ['user', 'project'] : ['project'],
        env: combinedEnv,
      },
    });

    const models = await response.supportedModels();
    if (Array.isArray(models) && models.length > 0) {
      return filterKnownModels(models);
    }
  } catch {
    // fall through to fallback
  }

  return FALLBACK_MODELS;
}
