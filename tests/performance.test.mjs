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
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
});

test.after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function openStibeeScenario(mode) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  await page.evaluateOnNewDocument(() => {
    const observers = [];
    window.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.targets = [];
        this.disconnected = false;
        observers.push(this);
      }
      observe(target) { this.targets.push(target); }
      unobserve(target) { this.targets = this.targets.filter((item) => item !== target); }
      disconnect() { this.disconnected = true; }
    };
    window.__triggerIntersection = (targetId) => {
      observers.forEach((observer) => {
        if (observer.disconnected) return;
        const targets = observer.targets.filter((target) => target.id === targetId);
        if (targets.length) observer.callback(targets.map((target) => ({ isIntersecting: true, target })));
      });
    };
  });

  let requests = 0;
  let resolveStarted;
  let releaseFailure;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  const failureReleased = new Promise((resolve) => { releaseFailure = resolve; });

  page.on('request', async (request) => {
    const url = request.url();
    if (url === 'https://resource.stibee.com/subscribe/stb_subscribe_form_style.css') {
      await request.respond({
        contentType: 'text/css',
        body: '.stb_form_result { display: none; }',
      });
    } else if (url === 'https://resource.stibee.com/subscribe/stb_subscribe_form.js') {
      requests += 1;
      resolveStarted();
      if (mode === 'fail') {
        await failureReleased;
        await request.abort('failed');
      } else {
        await request.respond({
          contentType: 'text/javascript',
          body: `
            window.__stibeeMockExecutions = (window.__stibeeMockExecutions || 0) + 1;
            document.getElementById('stb_subscribe_form').addEventListener('submit', function (event) {
              window.__stibeeValidationCalls = (window.__stibeeValidationCalls || 0) + 1;
              window.__stibeeSawPrevented = event.defaultPrevented;
              event.preventDefault();
              document.getElementById('stb_form_result').textContent = 'Stibee validation handled submission';
            });
          `,
        });
      }
    } else if (url.startsWith(baseUrl)) {
      await request.continue();
    } else {
      await request.abort('blockedbyclient');
    }
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  return {
    page,
    started: Promise.race([
      started,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Stibee script request did not start')), 5_000);
        timer.unref();
      }),
    ]),
    releaseFailure,
    requestCount: () => requests,
  };
}

async function submitState(page) {
  return page.evaluate(() => {
    const form = document.getElementById('stb_subscribe_form');
    const button = document.getElementById('stb_form_submit_button');
    const status = document.getElementById('stb_form_result');
    const allowed = form.dispatchEvent(new SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter: button,
    }));
    return {
      allowed,
      state: form.dataset.stibeeState,
      disabled: button.disabled,
      status: status.textContent.trim(),
      visible: getComputedStyle(status).display !== 'none',
      role: status.getAttribute('role'),
      live: status.getAttribute('aria-live'),
    };
  });
}

test('homepage defers non-critical third-party assets', async () => {
  const home = await source('index.html');

  assert.doesNotMatch(home, /<link[^>]+href="https:\/\/fonts\.googleapis\.com/);
  assert.match(home, /@font-face\s*\{[^}]+\/fonts\/playfair-display-latin\.woff2/s);
  assert.match(home, /function loadSecondaryFonts\(\)/);
  assert.match(home, /setTimeout\(loadSecondaryFonts, 4000\)/);
  assert.doesNotMatch(home, /<link rel="stylesheet" href="https:\/\/resource\.stibee\.com/);
  assert.match(home, /function loadStibeeAssets\(\)/);
  assert.match(home, /IntersectionObserver/);

  assert.doesNotMatch(home, /<script[^>]+src="https:\/\/s3\.tradingview\.com/);
  assert.match(home, /function loadTradingView\(\)/);
  assert.match(home, /setTimeout\(loadTradingView, 4000\)/);

  assert.doesNotMatch(home, /import \{ currentUser, fetchMyProfile, unreadNotifications \} from "\/js\/auth\.js"/);
  assert.match(home, /await import\("\/js\/auth\.js"\)/);
  assert.match(home, /setTimeout\(enhanceMemberCtas, 4000\)/);
});

test('deferred Stibee loading guards submission through loading, error, and ready states', async () => {
  const failed = await openStibeeScenario('fail');

  const immediate = await submitState(failed.page);
  assert.equal(immediate.allowed, false, JSON.stringify(immediate));
  assert.equal(immediate.state, 'loading', JSON.stringify(immediate));
  assert.equal(immediate.disabled, true, JSON.stringify(immediate));
  assert.match(immediate.status, /loading|preparing|준비/i);
  assert.equal(immediate.visible, true, JSON.stringify(immediate));
  assert.equal(immediate.role, 'status');
  assert.equal(immediate.live, 'polite');

  await failed.page.evaluate(() => window.__triggerIntersection('stb_subscribe'));
  await failed.started;
  const slow = await submitState(failed.page);
  assert.equal(slow.allowed, false, JSON.stringify(slow));
  assert.equal(slow.state, 'loading', JSON.stringify(slow));
  assert.match(slow.status, /loading|preparing|준비/i);
  assert.equal(slow.visible, true, JSON.stringify(slow));

  failed.releaseFailure();
  await failed.page.waitForFunction(() => document.getElementById('stb_subscribe_form').dataset.stibeeState === 'error');
  const errored = await submitState(failed.page);
  assert.equal(errored.allowed, false, JSON.stringify(errored));
  assert.equal(errored.state, 'error', JSON.stringify(errored));
  assert.equal(errored.disabled, true, JSON.stringify(errored));
  assert.match(errored.status, /unavailable|failed|refresh|다시|불러오/i);
  assert.equal(errored.visible, true, JSON.stringify(errored));
  assert.equal(failed.requestCount(), 1);
  await failed.page.close();

  const successful = await openStibeeScenario('success');
  await successful.page.evaluate(() => {
    window.__triggerIntersection('stb_subscribe');
    window.__triggerIntersection('stb_subscribe');
  });
  await successful.started;
  await successful.page.waitForFunction(() => document.getElementById('stb_subscribe_form').dataset.stibeeState === 'ready');

  const ready = await submitState(successful.page);
  const ownership = await successful.page.evaluate(() => ({
    executions: window.__stibeeMockExecutions,
    validations: window.__stibeeValidationCalls,
    sawPrevented: window.__stibeeSawPrevented,
    scriptCount: document.querySelectorAll('script[src="https://resource.stibee.com/subscribe/stb_subscribe_form.js"]').length,
  }));
  assert.equal(ready.allowed, false, JSON.stringify(ready));
  assert.equal(ready.state, 'ready', JSON.stringify(ready));
  assert.equal(ready.disabled, false, JSON.stringify(ready));
  assert.deepEqual(ownership, { executions: 1, validations: 1, sawPrevented: false, scriptCount: 1 });
  assert.equal(successful.requestCount(), 1);

  await new Promise((resolve) => setTimeout(resolve, 1900));
  await successful.page.waitForFunction(() => [...document.querySelectorAll('.fade-in')].every((element) => element.classList.contains('visible')), { timeout: 4000 });
  const mobileAfterDelay = await successful.page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    hiddenFadeIns: [...document.querySelectorAll('.fade-in:not(.visible)')].length,
  }));
  assert.deepEqual(mobileAfterDelay, { viewportWidth: 390, documentWidth: 390, hiddenFadeIns: 0 });
  await successful.page.close();
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
