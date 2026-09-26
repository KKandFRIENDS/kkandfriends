import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer-core';
import { publicOriginal, renderOriginalPage } from '../lib/original-render.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const EMBED = /<div id="kk-subscribe"><\/div>\s*<script type="module" src="\/blog\/subscribe\.js"><\/script>/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

async function source(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

async function postFiles() {
  const entries = await readdir(path.join(ROOT, 'posts'), { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.html')).map((e) => `posts/${e.name}`);
}

test('every THOUGHTS post carries the subscribe block exactly once', async () => {
  const files = await postFiles();
  assert.ok(files.length > 0);
  for (const file of files) {
    const html = await source(file);
    assert.match(html, EMBED, file);
    assert.equal((html.match(/id="kk-subscribe"/g) || []).length, 1, file);
    // Stibee binds fixed ids: a post must not also inline its own form.
    assert.doesNotMatch(html, /id="stb_subscribe"/, file);
  }
});

test('THOUGHTS archive and KK ORIGINAL pages carry the subscribe block', async () => {
  assert.match(await source('thoughts.html'), EMBED);
  const html = renderOriginalPage(publicOriginal({
    slug: 'sample', title: 'T', summary: 'S', category: '자유', body: 'body',
    published_at: '2026-09-26T00:00:00Z', status: 'published',
  }, { includeBody: true }));
  assert.match(html, EMBED);
});

test('subscribe module posts to the same Stibee list as the homepage form', async () => {
  const [home, mod] = await Promise.all([source('index.html'), source('blog/subscribe.js')]);
  const listUrl = (text) => text.match(/https:\/\/stibee\.com\/api\/v1\.0\/lists\/[^"/]+\/public\/subscribers/)?.[0];
  assert.ok(listUrl(home));
  assert.equal(listUrl(mod), listUrl(home));
});

let browser;
let server;
let baseUrl;

test.before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let relative = pathname.slice(1);
      if (!path.extname(relative)) relative += '.html';
      const file = path.resolve(ROOT, relative);
      const rel = path.relative(ROOT, file);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('outside root');
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, timeout: 60_000, args: ['--no-sandbox', '--disable-gpu'],
  });
});

test.after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test('post page defers Stibee until the block nears view and guards early submits', async () => {
  const [post] = (await postFiles()).sort().reverse();
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  await page.evaluateOnNewDocument(() => {
    const observers = [];
    window.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
      observe(target) { this.targets.push(target); }
      unobserve(target) { this.targets = this.targets.filter((item) => item !== target); }
      disconnect() { this.disconnected = true; }
    };
    window.__triggerIntersection = (id) => observers.forEach((o) => {
      if (o.disconnected) return;
      const targets = o.targets.filter((t) => t.id === id);
      if (targets.length) o.callback(targets.map((target) => ({ isIntersecting: true, target })));
    });
  });

  let stibeeRequests = 0;
  page.on('request', async (request) => {
    const url = request.url();
    if (url === 'https://resource.stibee.com/subscribe/stb_subscribe_form_style.css') {
      await request.respond({ contentType: 'text/css', body: '' });
    } else if (url === 'https://resource.stibee.com/subscribe/stb_subscribe_form.js') {
      stibeeRequests += 1;
      await request.respond({ contentType: 'text/javascript', body: 'window.__stibeeLoaded = true;' });
    } else if (url.startsWith(baseUrl)) {
      await request.continue();
    } else {
      await request.abort('blockedbyclient');
    }
  });

  await page.goto(`${baseUrl}/${post.replace(/\.html$/, '')}`, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  await page.waitForSelector('#stb_subscribe_form', { timeout: 5_000 });

  const before = await page.evaluate(() => {
    const form = document.getElementById('stb_subscribe_form');
    const allowed = form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    return {
      allowed,
      state: form.dataset.stibeeState,
      disabled: document.getElementById('stb_form_submit_button').disabled,
      forms: document.querySelectorAll('#stb_subscribe_form').length,
    };
  });
  assert.deepEqual(before, { allowed: false, state: 'loading', disabled: true, forms: 1 });
  assert.equal(stibeeRequests, 0, 'Stibee must not load before the block nears view');

  await page.evaluate(() => { window.__triggerIntersection('kk-subscribe'); window.__triggerIntersection('kk-subscribe'); });
  await page.waitForFunction(() => document.getElementById('stb_subscribe_form').dataset.stibeeState === 'ready');
  const after = await page.evaluate(() => ({
    disabled: document.getElementById('stb_form_submit_button').disabled,
    docWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.deepEqual(after, { disabled: false, docWidth: 390, viewport: 390 });
  assert.equal(stibeeRequests, 1);
  await page.close();
});
