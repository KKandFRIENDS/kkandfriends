import { ContractError } from './errors.js';

function findBalancedJson(text, startIndex) {
  const opening = text[startIndex];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) depth -= 1;
    if (depth === 0) return text.slice(startIndex, index + 1);
  }
  return null;
}

export function extractJson(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new ContractError('Model returned empty text', ['empty_model_output']);
  }

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to fenced and balanced extraction.
  }

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (const match of fencedMatches) {
    try {
      return JSON.parse(match[1].trim());
    } catch {
      // Try the next fenced block.
    }
  }

  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] !== '{' && trimmed[index] !== '[') continue;
    const slice = findBalancedJson(trimmed, index);
    if (!slice) continue;
    try {
      return JSON.parse(slice);
    } catch {
      // A later JSON value may still be valid.
    }
  }

  throw new ContractError('Could not extract valid JSON', ['invalid_model_json']);
}
