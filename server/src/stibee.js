// Stibee address-book sync for the member newsletter opt-in (/me checkbox).
//
// The list is the same one the public subscribe forms post to, so a member and
// a public reader end up in one address book. Only the email is sent: members
// often post under a pseudonym and Stibee does not need a name to deliver.
//
// Endpoints (Stibee API v1, AccessToken header):
//   subscribe   POST   /v1/lists/{listId}/subscribers   { eventOccurredBy, confirmEmailYN, subscribers: [{ email }] }
//   unsubscribe DELETE /v1/lists/{listId}/subscribers   [email]
// The subscribe shape is from Stibee's help centre; the DELETE shape could not
// be checked against their docs from the build environment. If Stibee rejects
// it, only removeSubscriber below needs to change.

const BASE = 'https://api.stibee.com/v1';
const TIMEOUT_MS = 8000;

export function stibeeConfigured(config) {
  return Boolean(config?.stibeeApiKey && config?.stibeeListId);
}

async function call(config, method, body) {
  const fetchImpl = config.fetch || fetch;
  const response = await fetchImpl(`${BASE}/lists/${encodeURIComponent(config.stibeeListId)}/subscribers`, {
    method,
    headers: { AccessToken: config.stibeeApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let data = null;
  try { data = await response.json(); } catch { /* non-JSON error page */ }
  if (!response.ok || data?.Ok === false) {
    const detail = data?.Error?.message || data?.Error?.code || `HTTP ${response.status}`;
    throw new Error(`Stibee ${method} failed: ${detail}`);
  }
  return data;
}

// Stibee answers 200 + Ok:true even when an address is refused, and reports the
// refusal by listing the email under a fail* key (failWrongEmail, failDeny, ...).
// An address that is already on the list is a success for our purposes.
function refusedIn(value, email) {
  if (!value || typeof value !== 'object') return null;
  const target = email.toLowerCase();
  for (const [key, list] of Object.entries(value)) {
    if (!key.startsWith('fail') || key === 'failExistEmail' || key === 'failDuplicatedEmail') continue;
    if (!Array.isArray(list)) continue;
    if (list.some(item => String(item?.email ?? item).toLowerCase() === target)) return key;
  }
  return null;
}

export async function addSubscriber(config, email) {
  const data = await call(config, 'POST', {
    eventOccurredBy: 'SUBSCRIBER',
    confirmEmailYN: 'N',
    subscribers: [{ email }],
  });
  const refused = refusedIn(data?.Value, email);
  if (refused) throw new Error(`Stibee refused the address (${refused})`);
}

export async function removeSubscriber(config, email) {
  await call(config, 'DELETE', [email]);
}

export async function setNewsletterSubscription(config, email, subscribed) {
  return subscribed ? addSubscriber(config, email) : removeSubscriber(config, email);
}
