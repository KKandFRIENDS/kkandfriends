import { extractJson } from './json.js';

export class ModelChainError extends Error {
  constructor(message, attempts) {
    super(message);
    this.name = 'ModelChainError';
    this.attempts = attempts;
  }
}

export async function callModelChain({
  models,
  invoke,
  prompt,
  parse = extractJson,
}) {
  if (!Array.isArray(models) || models.length === 0) {
    throw new TypeError('models must contain at least one model');
  }
  if (typeof invoke !== 'function') throw new TypeError('invoke must be a function');

  const attempts = [];
  for (const model of models) {
    try {
      const response = await invoke({ model, prompt });
      const parsed = parse(response);
      return { model, parsed, attempts };
    } catch (error) {
      attempts.push({
        model,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new ModelChainError('All models failed', attempts);
}
