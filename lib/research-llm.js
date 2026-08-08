// Model plumbing for the research lab — see RESEARCH_PROMPT.md.
//
// The prompt insists the model chain lives in config, not in code, and that a
// model which is retired or not enabled on the account falls through to the
// next one instead of failing the run silently. This module is that mechanism:
// hand it a chain from research-config.json and it tries each entry in order,
// reporting which one answered and whether it had to fall back.
//
// Chains may mix families. Routing is by model id:
//   gemini-*   → Google Generative Language REST   (GEMINI_API_KEY)
//   anything   → Anthropic Messages API            (ANTHROPIC_API_KEY, or
//   else                                            AI_GATEWAY_API_KEY via the
//                                                   Vercel AI Gateway)
// An entry whose key is absent is skipped with a reason rather than throwing —
// that is what lets `RESEARCH_MODEL=gemini-3.6-flash` switch the whole run to a
// free-tier model without touching the code.
//
// Web search is a server-side tool on both routes (Anthropic runs the search
// and returns final text; Gemini grounds with Google Search), so there is no
// tool-use loop here — one request in, finished text out.

import Anthropic from '@anthropic-ai/sdk';

const GATEWAY_URL = 'https://ai-gateway.vercel.sh';

export class NoUsableModelError extends Error {
  constructor(attempts) {
    const detail = attempts.map((a) => `${a.model}: ${a.reason}`).join(' | ');
    super(`no usable model in chain — ${detail}`);
    this.name = 'NoUsableModelError';
    this.attempts = attempts;
  }
}

const isGemini = (model) => model.startsWith('gemini-');

/**
 * Run a prompt through a model chain.
 *
 * @param {string[]} chain     model ids, highest priority first
 * @param {object}   opts
 * @param {string}   opts.system
 * @param {string}   opts.user
 * @param {boolean} [opts.search]     enable the server-side web-search tool
 * @param {number}  [opts.maxTokens]
 * @param {number}  [opts.timeoutMs]
 * @param {number}  [opts.maxSearches] cap on searches per request
 * @returns {Promise<{text: string, model: string, fellBack: boolean, attempts: object[]}>}
 */
export async function callChain(chain, opts = {}) {
  const {
    system,
    user,
    search = false,
    maxTokens = 8000,
    timeoutMs = 60_000,
    maxSearches = 6,
  } = opts;

  const attempts = [];

  for (const model of chain) {
    const key = keyFor(model);
    if (!key) {
      attempts.push({ model, reason: `${isGemini(model) ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY'} not set` });
      continue;
    }

    try {
      const text = isGemini(model)
        ? await callGemini({ model, key, system, user, search, maxTokens, timeoutMs })
        : await callAnthropic({ model, key, system, user, search, maxTokens, timeoutMs, maxSearches });

      if (!text) throw new Error('empty response');

      return { text, model, fellBack: attempts.length > 0, attempts };
    } catch (err) {
      const reason = String(err?.message || err).slice(0, 200);
      attempts.push({ model, reason });
      console.warn(`research-llm: ${model} failed — ${reason}`);
    }
  }

  throw new NoUsableModelError(attempts);
}

function keyFor(model) {
  if (isGemini(model)) return process.env.GEMINI_API_KEY || null;
  return process.env.ANTHROPIC_API_KEY || process.env.AI_GATEWAY_API_KEY || null;
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

async function callAnthropic({ model, key, system, user, search, maxTokens, timeoutMs, maxSearches }) {
  // The gateway speaks the same Messages API; only the base URL and the
  // provider-prefixed model id differ. Direct key wins when both are present.
  const viaGateway = !process.env.ANTHROPIC_API_KEY && Boolean(process.env.AI_GATEWAY_API_KEY);
  const client = new Anthropic({
    apiKey: key,
    ...(viaGateway ? { baseURL: GATEWAY_URL } : {}),
    timeout: timeoutMs,
    maxRetries: 1,
  });

  const params = {
    model: viaGateway ? `anthropic/${model}` : model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    ...(search
      ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxSearches }] }
      : {}),
  };

  // Thinking is worth having for the scoring step, but it is also the most
  // likely parameter to be rejected by a gateway that hasn't caught up. Ask
  // for it, drop it on a 400 rather than losing the run.
  let msg;
  try {
    msg = await client.messages.create({ ...params, thinking: { type: 'adaptive' } });
  } catch (err) {
    if (err?.status !== 400) throw err;
    console.warn(`research-llm: ${model} rejected thinking, retrying without`);
    msg = await client.messages.create(params);
  }

  if (msg.stop_reason === 'refusal') {
    throw new Error(`model refused (${msg.stop_details?.category || 'unknown'})`);
  }

  return (msg.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

async function callGemini({ model, key, system, user, search, maxTokens, timeoutMs }) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
        ...(search ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  const raw = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 300)}`);

  const json = JSON.parse(raw);
  if (json.promptFeedback?.blockReason) {
    throw new Error(`blocked by safety filter (${json.promptFeedback.blockReason})`);
  }
  const text = (json.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('')
    .trim();
  if (!text) {
    throw new Error(`empty response (finishReason: ${json.candidates?.[0]?.finishReason || 'none'})`);
  }
  return text;
}

// ─── JSON extraction ────────────────────────────────────────────────────────

/**
 * Pull a JSON object out of a model reply. Models wrap JSON in prose or fences
 * often enough that a bare JSON.parse would fail runs for cosmetic reasons —
 * so try the whole string, then any fenced block, then the outermost braces.
 * Throws with a snippet of what it actually saw, which is the only useful thing
 * to have in a log at 08:00.
 */
export function extractJson(text) {
  const candidates = [];
  const trimmed = String(text ?? '').trim();
  if (trimmed) candidates.push(trimmed);

  for (const m of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (m[1].trim()) candidates.push(m[1].trim());
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  throw new Error(`model did not return parseable JSON — got: ${trimmed.slice(0, 300)}`);
}
