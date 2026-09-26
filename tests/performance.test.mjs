import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CORE_PAGES = ['index.html', 'community.html', 'membership.html', 'thoughts.html', 'join.html'];

async function source(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(ROOT, relative);
      const rootRelative = path.relative(ROOT, file);
      if (rootRelative === '..' || rootRelative.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelative)) {
        throw new Error('path outside root');
      }
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': path.extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

let browser;
let server;
let baseUrl;

test.before(async () => {
  server = await startServer();
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    timeout: 60_000,
    args: ['--no-sandbox', '--disable-gpu'],
  });
});

test.after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test('homepage defers non-critical third-party assets', async () => {
  const home = await source('index.html');

  assert.doesNotMatch(home, /<link[^>]+href="https:\/\/fonts\.googleapis\.com/);
  assert.match(home, /@font-face\s*\{[^}]+\/fonts\/playfair-display-latin\.woff2/s);
  assert.match(home, /function loadSecondaryFonts\(\)/);
  assert.match(home, /setTimeout\(loadSecondaryFonts, 4000\)/);
  // Stibee was retired on 2026-09-26; the homepage must not collect emails for it.
  assert.doesNotMatch(home, /stibee/i);

  assert.doesNotMatch(home, /<script[^>]+src="https:\/\/s3\.tradingview\.com/);
  assert.match(home, /function loadTradingView\(\)/);
  assert.match(home, /setTimeout\(loadTradingView, 4000\)/);

  assert.doesNotMatch(home, /import \{ currentUser, fetchMyProfile, unreadNotifications \} from "\/js\/auth-vps\.js"/);
  assert.match(home, /await import\("\/js\/auth-vps\.js"\)/);
  assert.match(home, /setTimeout\(enhanceMemberCtas, 4000\)/);
});

test('homepage follow links render within the mobile viewport', async () => {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', (request) => (request.url().startsWith(baseUrl) ? request.continue() : request.abort('blockedbyclient')));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });

  const follow = await page.evaluate(() => [...document.querySelectorAll('.cta-band a')].map((a) => a.getAttribute('href')));
  assert.deepEqual(follow, ['/join', 'https://www.linkedin.com/company/kkandfriends', '/rss.xml']);

  await new Promise((resolve) => setTimeout(resolve, 1900));
  await page.waitForFunction(() => [...document.querySelectorAll('.fade-in')].every((element) => element.classList.contains('visible')), { timeout: 4000 });
  const mobileAfterDelay = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    hiddenFadeIns: [...document.querySelectorAll('.fade-in:not(.visible)')].length,
  }));
  assert.deepEqual(mobileAfterDelay, { viewportWidth: 390, documentWidth: 390, hiddenFadeIns: 0 });
  await page.close();
});

test('core pages use the optimized logo asset', async () => {
  const pages = await Promise.all(CORE_PAGES.map(source));
  for (const [index, html] of pages.entries()) {
    assert.doesNotMatch(html, /src="\/KK_and_FRIENDS\.png"/, CORE_PAGES[index]);
    assert.match(html, /src="\/KK_and_FRIENDS\.webp"/, CORE_PAGES[index]);
  }

  const optimized = await stat(path.join(ROOT, 'KK_and_FRIENDS.webp')).catch(() => null);
  assert.ok(optimized, 'optimized logo asset is missing');
  assert.ok(optimized.size < 20_000, `optimized logo is ${optimized.size} bytes`);
});

test('self-hosted fonts retain their distribution license', async () => {
  const license = await source('fonts/OFL-Playfair-Display.txt').catch(() => '');
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
});

test('homepage reserves ticker and logo space to prevent layout shifts', async () => {
  const home = await source('index.html');
  assert.match(home, /\.tv-ticker-wrap\s*\{[^}]*min-height:\s*74px/s);
  const logos = [...home.matchAll(/<img[^>]+src="\/KK_and_FRIENDS\.webp"[^>]*>/g)].map((match) => match[0]);

  assert.equal(logos.length, 3);
  for (const logo of logos) {
    assert.match(logo, /\bwidth="\d+"/);
    assert.match(logo, /\bheight="\d+"/);
  }
});
