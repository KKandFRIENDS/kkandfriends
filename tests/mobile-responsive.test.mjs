import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VIEWPORT_WIDTH = 390;
const PAGES = ['/', '/community', '/membership', '/thoughts', '/join'];

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function resolveRequest(url) {
  const clean = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relative = clean === '/' ? 'index.html' : clean.slice(1);
  const file = path.resolve(ROOT, path.extname(relative) ? relative : `${relative}.html`);
  const rootRelative = path.relative(ROOT, file);
  if (rootRelative === '..' || rootRelative.startsWith(`..${path.sep}`) || path.isAbsolute(rootRelative)) {
    throw new Error('path outside root');
  }
  return file;
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const file = resolveRequest(request.url);
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      response.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      response.end(await readFile(file));
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

test('server rejects encoded path traversal outside the site root', async () => {
  const response = await fetch(`${baseUrl}/%2e%2e%2f%2e%2e%2f%2e%2e%2fWindows%2fwin.ini`);

  assert.equal(response.status, 404);
});

for (const route of PAGES) {
  test(`${route} fits a 390px viewport`, async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: VIEWPORT_WIDTH, height: 844, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle2' });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const layout = await page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const overflowingControls = [...document.querySelectorAll('a, button, input, select, textarea')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 &&
            (rect.left < -0.5 || rect.right > viewportWidth + 0.5);
        })
        .map((element) => ({
          label: (element.innerText || element.getAttribute('aria-label') || element.tagName).trim().slice(0, 80),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        }));

      const keyContent = [...document.querySelectorAll('h1, .hero-actions > *, .hero-right > *, .page-hero > p, .page-hero > div')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 &&
            (rect.left < -0.5 || rect.right > viewportWidth + 0.5 || element.scrollWidth > element.clientWidth + 1);
        })
        .map((element) => ({
          label: (element.innerText || element.className || element.tagName).trim().slice(0, 80),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        }));

      const heading = document.querySelector('h1');
      const hamburger = document.querySelector('.nav-hamburger');
      return {
        viewportWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        overflowingControls,
        keyContent,
        headingOverflow: heading ? heading.scrollWidth - heading.clientWidth : 0,
        hamburgerVisible: hamburger ? getComputedStyle(hamburger).display !== 'none' : null,
        memberNavVisible: document.querySelector('.nav-right')
          ? getComputedStyle(document.querySelector('.nav-right')).display !== 'none'
          : null,
      };
    });

    assert.equal(layout.documentWidth, layout.viewportWidth, JSON.stringify(layout));
    assert.equal(layout.bodyWidth, layout.viewportWidth, JSON.stringify(layout));
    assert.deepEqual(layout.overflowingControls, [], JSON.stringify(layout));
    assert.deepEqual(layout.keyContent, [], JSON.stringify(layout));
    assert.ok(layout.headingOverflow <= 1, JSON.stringify(layout));

    if (route !== '/join') assert.equal(layout.hamburgerVisible, true, JSON.stringify(layout));
    if (route === '/join') assert.equal(layout.memberNavVisible, false, JSON.stringify(layout));

    await page.close();
  });
}
