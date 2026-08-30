import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ANALYTICS_PAGES = [
  'index.html', 'join.html', 'me.html', 'privacy.html', 'terms.html', 'voices.html',
  'posts/20260419_blockchain_fragmentation.html',
  'posts/20260419_kurzweil_energy_currency.html',
  'posts/20260419_stablecoin_new_rail.html',
  'posts/20260420_strategy_strc_frequency.html',
  'posts/20260421_fiat_future.html',
  'posts/20260422_ai_infra_korea.html',
  'posts/20260425_shin_governor_inaugural.html',
  'posts/20260517_samsung_white_collar_pricing.html',
  'posts/20260525_yield_bearing_stablecoin.html',
  'posts/20260607_valor_spv.html',
  'posts/20260614_ai_capex_risk.html',
  'posts/20260620_hyperscaler-capex.html',
  'posts/20260621_broken_money_review.html',
  'posts/20260621_korea_compound_growth.html',
  'posts/20260628_starlink_distance.html',
  'posts/20260629_bittensor_tao.html',
  'posts/20260630_youth_ai.html',
  'posts/20260704_kospi_concentration.html',
  'posts/20260705_kurzweil_singularity_nearer.html',
  'posts/20260706_ledger_eraser.html',
  'posts/20260714_bnk_jb_merger.html',
  'posts/20260714_sec_clarity_dual_track.html',
  'posts/20260719_korea_policy_portfolio.html',
  'posts/20260723_after_the_close.html',
  'posts/20260726_korea_73_credit_score.html',
  'posts/20260802_cheap_tokens_expensive_silicon.html',
  'posts/20260819_nonlinear_fiscal_physics.html',
  'posts/20260820_below_the_waterline.html',
  'posts/20260820_franchising_the_ai_stack.html',
  'posts/20260820_miners_last_surrender.html',
  'posts/20260821_seniority_has_a_name.html',
  'posts/20260824_from_317_to_19.html',
];

const source = file => readFile(path.join(ROOT, file), 'utf8');

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(value => Number.parseInt(value, 16) / 255);
  const linear = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(ROOT, requested);
      const relative = path.relative(ROOT, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('outside root');
      const body = await readFile(file);
      const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

test('tracked pages use the shared consent loader instead of loading GA directly', async () => {
  assert.equal(ANALYTICS_PAGES.length, 38);
  for (const file of ANALYTICS_PAGES) {
    const html = await source(file);
    assert.match(html, /<script[^>]+src=["']\/js\/analytics-consent\.js["'][^>]*defer[^>]*><\/script>/i, `${file} lacks consent loader`);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag|gtag\(['"]config['"]/, `${file} loads GA directly`);
  }
});

test('analytics stays off before consent, rejection persists, and acceptance loads GA once', async t => {
  const { server, origin } = await startServer();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  t.after(async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  let gaRequests = 0;
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('googletagmanager.com/gtag/js')) {
      gaRequests += 1;
      request.respond({ status: 200, contentType: 'text/javascript', body: 'window.__mockGaLoaded=(window.__mockGaLoaded||0)+1;' });
    } else if (request.url().startsWith(origin)) {
      request.continue();
    } else {
      request.abort('blockedbyclient');
    }
  });

  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(gaRequests, 0, 'GA requested before a choice');
  assert.deepEqual(await page.evaluate(() => ({ gtag: typeof window.gtag, dataLayer: typeof window.dataLayer })),
    { gtag: 'undefined', dataLayer: 'undefined' });
  assert.deepEqual(await page.$eval('#analytics-consent', el => ({ visible: getComputedStyle(el).display !== 'none', role: el.getAttribute('role'), label: el.getAttribute('aria-labelledby') })),
    { visible: true, role: 'region', label: 'analytics-consent-title' });

  await page.click('[data-analytics-choice="denied"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kk_analytics_consent')), 'denied');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(gaRequests, 0, 'GA requested after rejection');
  assert.equal(await page.$('#analytics-consent'), null, 'banner returned after persisted rejection');

  await page.evaluate(() => localStorage.removeItem('kk_analytics_consent'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('[data-analytics-choice="granted"]');
  await page.waitForFunction(() => window.__mockGaLoaded === 1);
  assert.equal(gaRequests, 1);
  assert.deepEqual(await page.evaluate(() => ({ choice: localStorage.getItem('kk_analytics_consent'), scripts: document.querySelectorAll('#kk-ga-script').length, configs: (window.dataLayer || []).filter(item => item[0] === 'config').length })),
    { choice: 'granted', scripts: 1, configs: 1 });

  await page.evaluate(() => window.KKAnalyticsConsent.open());
  await page.click('[data-analytics-choice="denied"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('kk_analytics_consent')), 'denied');

  await page.evaluate(() => window.KKAnalyticsConsent.open());
  await page.click('[data-analytics-choice="granted"]');
  assert.deepEqual(await page.evaluate(() => ({
    choice: localStorage.getItem('kk_analytics_consent'),
    scripts: document.querySelectorAll('#kk-ga-script').length,
    configs: (window.dataLayer || []).filter(item => item[0] === 'config').length,
    consentUpdates: (window.dataLayer || [])
      .filter(item => item[0] === 'consent' && item[1] === 'update')
      .map(item => item[2]?.analytics_storage)
  })), {
    choice: 'granted', scripts: 1, configs: 1, consentUpdates: ['denied', 'granted']
  });
});

test('CTA colors meet normal-text contrast and homepage footer does not skip heading levels', async () => {
  const [apply, memberCss, home] = await Promise.all([source('apply.html'), source('member.css'), source('index.html')]);
  assert.match(apply, /\.submit\s*\{[^}]*background:\s*var\(--gold\)[^}]*color:\s*#061018/is);
  assert.match(memberCss, /\.btn\s*\{[^}]*background:\s*var\(--gold\)[^}]*color:\s*#061018/is);
  assert.doesNotMatch(home, /background(?:-color)?:\s*var\(--gold\)[^}]*color:\s*(?:#fff|#ffffff|white)/is);
  assert.ok(contrast('#061018', '#4A90D9') >= 4.5);
  const footer = home.match(/<footer[\s\S]*?<\/footer>/i)?.[0] || '';
  assert.doesNotMatch(footer, /<h[4-6]\b/i);
  assert.match(footer, /class="footer-heading"/);
});

test('privacy policy explains optional analytics and provides a settings control', async () => {
  const privacy = await source('privacy.html');
  assert.match(privacy, /선택적 분석 쿠키/);
  assert.match(privacy, /동의하기 전에는 Google Analytics를 불러오지 않습니다/);
  assert.match(privacy, /거부해도 로그인 등 필수 기능에는 영향을 주지 않습니다/);
  assert.match(privacy, /id="analytics-settings"/);
});
