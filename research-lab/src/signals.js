import net from 'node:net';
import { createHash } from 'node:crypto';
import { ContractError } from './errors.js';

function isPrivateIp(hostname) {
  const version = net.isIP(hostname);
  if (version === 4) {
    const parts = hostname.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    );
  }
  if (version === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return false;
}

function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function classifySourceUrl(rawUrl, policy) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ContractError('Invalid source URL', [String(rawUrl)]);
  }
  if (url.protocol !== 'https:') {
    throw new ContractError('Only HTTPS source URLs are allowed', [url.protocol]);
  }
  if (url.username || url.password) {
    throw new ContractError('Source URL credentials are forbidden', [url.hostname]);
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || isPrivateIp(hostname)) {
    throw new ContractError('Private network source URL is forbidden', [hostname]);
  }

  if ((policy.primaryDomains ?? []).some((domain) => matchesDomain(hostname, domain))) {
    return 'primary';
  }
  if ((policy.signalOnlyDomains ?? []).some((domain) => matchesDomain(hostname, domain))) {
    return 'secondary';
  }
  throw new ContractError('Source domain is not allowlisted', [hostname]);
}

export function canonicalizeSourceUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

function signalFingerprint(signal) {
  return createHash('sha256')
    .update(`${signal.source.url}\n${signal.title.trim().toLocaleLowerCase('ko-KR')}`)
    .digest('hex');
}

export function normalizeSignals(rawSignals, policy, { now = new Date() } = {}) {
  if (!Array.isArray(rawSignals)) throw new ContractError('Signals must be an array', ['signals']);
  const errors = [];
  const normalized = [];
  const seen = new Set();
  const maxAgeMs = (policy.maxAgeDays ?? 14) * 24 * 60 * 60 * 1000;

  rawSignals.forEach((raw, index) => {
    try {
      if (typeof raw.id !== 'string' || raw.id.trim() === '') throw new Error('id missing');
      if (typeof raw.title !== 'string' || raw.title.trim() === '') throw new Error('title missing');
      if (typeof raw.summary !== 'string' || raw.summary.trim() === '') throw new Error('summary missing');
      if (!raw.source || typeof raw.source.url !== 'string') throw new Error('source URL missing');
      const publishedAt = new Date(raw.publishedAt);
      if (Number.isNaN(publishedAt.getTime())) throw new Error('publishedAt invalid');
      if (publishedAt.getTime() > now.getTime() + 5 * 60 * 1000) throw new Error('publishedAt is in the future');
      if (now.getTime() - publishedAt.getTime() > maxAgeMs) throw new Error('signal is stale');

      const canonicalUrl = canonicalizeSourceUrl(raw.source.url);
      const type = classifySourceUrl(canonicalUrl, policy);
      const signal = {
        id: raw.id,
        title: raw.title.trim(),
        summary: raw.summary.trim(),
        excerpt: typeof raw.excerpt === 'string' ? raw.excerpt.trim() : null,
        publishedAt: publishedAt.toISOString(),
        source: {
          title: raw.source.title?.trim() || raw.title.trim(),
          url: canonicalUrl,
          type,
        },
      };
      const fingerprint = signalFingerprint(signal);
      if (seen.has(fingerprint)) return;
      seen.add(fingerprint);
      normalized.push(signal);
    } catch (error) {
      errors.push(`signals[${index}]: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return { signals: normalized, errors };
}
