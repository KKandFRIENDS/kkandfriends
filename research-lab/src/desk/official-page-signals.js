import { createHash } from 'node:crypto';

const FSC_LIST = 'https://www.fsc.go.kr/no010101';

function clean(value = '') {
  return value.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}

export function parseFscList(html) {
  const pattern = /<a\s+href=["'](\/no010101\/\d+[^"']*)["'][^>]*title=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>[\s\S]*?<div\s+class=["']day["']>(\d{4}-\d{2}-\d{2})<\/div>/gi;
  return [...html.matchAll(pattern)].slice(0, 20).map((match) => {
    const url = new URL(match[1].replace(/&amp;/g, '&'), FSC_LIST).toString();
    const title = clean(match[2]);
    return {
      id: `fsc-${createHash('sha256').update(url).digest('hex').slice(0, 20)}`,
      title, summary: title, publishedAt: `${match[3]}T00:00:00+09:00`,
      source: { title: '금융위원회 보도자료', url },
    };
  });
}

export async function collectFscSignals({ fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(FSC_LIST, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'KKandFriends-Editorial/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const signals = parseFscList(await response.text());
    return { signals, status: signals.length ? 'ready' : 'unavailable', report: { retained: signals.length, errors: signals.length ? [] : ['FSC list contained no articles'] } };
  } catch (error) {
    return { signals: [], status: 'unavailable', report: { retained: 0, errors: [String(error?.message || error).slice(0, 120)] } };
  }
}
