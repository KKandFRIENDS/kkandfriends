function sanitizeProviderError(provider, response, payload) {
  const requestId = response.headers?.get?.('request-id') ?? response.headers?.get?.('x-request-id') ?? null;
  const errorType = payload?.error?.type ?? payload?.type ?? 'unknown_error';
  const error = new Error(`${provider} request failed: HTTP ${response.status} ${errorType}`);
  error.name = 'ModelProviderError';
  error.status = response.status;
  error.requestId = requestId;
  error.providerErrorType = errorType;
  return error;
}

function stageMaxTokens(stage, overrides = {}) {
  return overrides[stage] ?? { discovery: 8_000, research: 6_000, writer: 8_000 }[stage] ?? 4_000;
}

const VERCEL_AI_GATEWAY_ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';

function assertVercelAiGatewayEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new TypeError('Vercel AI Gateway endpoint must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'ai-gateway.vercel.sh') {
    throw new TypeError('OIDC credentials may only be sent to Vercel AI Gateway');
  }
}

export function resolveVercelOidcToken({ request = null, env = process.env } = {}) {
  const requestToken = request?.headers?.get?.('x-vercel-oidc-token');
  const token = requestToken || env?.VERCEL_OIDC_TOKEN;
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('Vercel OIDC token is unavailable');
  }
  return token.trim();
}

export function createVercelAiGatewayInvoker({
  request = null,
  env = process.env,
  tokenProvider = null,
  fetchImpl = fetch,
  endpoint = VERCEL_AI_GATEWAY_ENDPOINT,
  timeoutMs = 120_000,
  maxTokensByStage = {},
} = {}) {
  assertVercelAiGatewayEndpoint(endpoint);
  const getToken = tokenProvider ?? (() => resolveVercelOidcToken({ request, env }));

  return async ({ model, prompt, stage }) => {
    const token = await getToken();
    if (typeof token !== 'string' || token.trim() === '') {
      throw new Error('Vercel OIDC token is unavailable');
    }
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.trim()}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: stageMaxTokens(stage, maxTokensByStage),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw sanitizeProviderError('vercel-ai-gateway', response, payload);
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('Vercel AI Gateway response contained no text');
    }
    return text;
  };
}

export function createAnthropicInvoker({
  apiKey,
  fetchImpl = fetch,
  endpoint = 'https://api.anthropic.com/v1/messages',
  apiVersion = '2023-06-01',
  timeoutMs = 120_000,
  maxTokensByStage = {},
}) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new TypeError('Anthropic API key is required');

  return async ({ model, prompt, stage }) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': apiVersion,
      },
      body: JSON.stringify({
        model,
        max_tokens: stageMaxTokens(stage, maxTokensByStage),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw sanitizeProviderError('anthropic', response, payload);
    const text = (payload?.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n');
    if (!text) throw new Error('Anthropic response contained no text');
    return text;
  };
}

export function createOpenAiCompatibleInvoker({
  apiKey,
  endpoint,
  fetchImpl = fetch,
  timeoutMs = 120_000,
  maxTokensByStage = {},
  extraHeaders = {},
  reasoning = undefined,
  reasoningByStage = {},
}) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new TypeError('Gateway API key is required');
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    throw new TypeError('Gateway endpoint must be an HTTPS URL');
  }

  return async ({ model, prompt, stage, responseFormat }) => {
    const stageReasoning = reasoningByStage[stage] ?? reasoning;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        ...(stageReasoning ? { reasoning: stageReasoning } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
        max_tokens: stageMaxTokens(stage, maxTokensByStage),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw sanitizeProviderError('gateway', response, payload);
    const text = payload?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error(`Gateway response contained no text (stage=${stage}, finish=${payload?.choices?.[0]?.finish_reason ?? 'unknown'}, completion=${Number(payload?.usage?.completion_tokens ?? 0)}, reasoning=${Number(payload?.usage?.completion_tokens_details?.reasoning_tokens ?? 0)})`);
    }
    return text;
  };
}
