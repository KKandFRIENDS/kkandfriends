import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let browser;

// Derived from disk so publishing a column cannot silently invalidate these counts.
const POST_COUNT = (await readdir(path.join(ROOT, 'posts'), { withFileTypes: true }))
  .filter((e) => e.isFile() && e.name.endsWith('.html')).length;

test.before(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
});

test.after(async () => {
  await browser?.close();
});

async function openLocalPage(file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(ROOT, file)).href, { waitUntil: 'networkidle2' });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return page;
}

test('homepage distinguishes three editorial rhythms and shows three latest previews', async () => {
  const page = await openLocalPage('index.html');
  const articles = await page.evaluate(() => ({
    latest: document.querySelectorAll('.insights-hub .ih-latest-card').length,
    series: document.querySelectorAll('.insights-hub .ih-series-card').length,
    duplicatedFeed: document.querySelectorAll('.intel-grid .intel-card').length,
    insightsAnchor: Boolean(document.querySelector('#insights')),
  }));

  assert.equal(articles.latest, 3);
  assert.equal(articles.series, 3);
  assert.equal(articles.duplicatedFeed, 0);
  assert.equal(articles.insightsAnchor, true);

  await page.close();
});

test('THOUGHTS has one unique non-empty article card per published post and eight real initial previews', async () => {
  const page = await openLocalPage('thoughts.html');
  const initial = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.post-card')];
    const visibleCards = cards.filter((card) => !card.classList.contains('hidden'));
    const summarize = (card) => ({
      href: card.getAttribute('href')?.trim() || '',
      title: card.querySelector('h2')?.textContent.trim() || '',
    });

    return {
      cards: cards.map(summarize),
      visibleCards: visibleCards.map(summarize),
      loadMoreVisible: Boolean(document.querySelector('#load-more:not([hidden])')),
      count: document.querySelector('#post-count')?.textContent.trim(),
      countAriaLive: document.querySelector('#post-count')?.getAttribute('aria-live'),
    };
  });

  assert.equal(initial.cards.length, POST_COUNT);
  assert.equal(new Set(initial.cards.map(({ href }) => href)).size, POST_COUNT);
  assert.equal(initial.cards.every(({ href, title }) => href && title), true);
  assert.equal(initial.visibleCards.length, 8);
  assert.equal(initial.visibleCards.every(({ href, title }) => href && title), true);
  assert.equal(initial.loadMoreVisible, true);
  assert.equal(initial.count, `${POST_COUNT} posts`);
  assert.equal(initial.countAriaLive, 'polite');

  await page.close();
});

test('THOUGHTS loads Macro in batches, shows the final partial batch, and resets on All', async () => {
  const page = await openLocalPage('thoughts.html');

  await page.click('.filter-btn[data-filter="Macro"]');
  const firstMacroBatch = await page.evaluate(() => ({
    matching: document.querySelectorAll('.post-card[data-category="Macro"]').length,
    visible: [...document.querySelectorAll('.post-card[data-category="Macro"]')]
      .filter((card) => !card.classList.contains('hidden')).length,
    count: document.querySelector('#post-count')?.textContent.trim(),
    loadMoreHidden: document.querySelector('#load-more').hidden,
    macroPressed: document.querySelector('.filter-btn[data-filter="Macro"]')?.getAttribute('aria-pressed'),
    allPressed: document.querySelector('.filter-btn[data-filter="all"]')?.getAttribute('aria-pressed'),
  }));

  assert.equal(firstMacroBatch.matching, 11);
  assert.equal(firstMacroBatch.visible, 8);
  assert.equal(firstMacroBatch.count, '11 posts');
  assert.equal(firstMacroBatch.loadMoreHidden, false);
  assert.equal(firstMacroBatch.macroPressed, 'true');
  assert.equal(firstMacroBatch.allPressed, 'false');

  await page.click('#load-more');
  const finalMacroBatch = await page.evaluate(() => ({
    visible: [...document.querySelectorAll('.post-card[data-category="Macro"]')]
      .filter((card) => !card.classList.contains('hidden')).length,
    loadMoreHidden: document.querySelector('#load-more').hidden,
  }));

  assert.equal(finalMacroBatch.visible, 11);
  assert.equal(finalMacroBatch.loadMoreHidden, true);

  await page.click('.filter-btn[data-filter="all"]');
  const allAgain = await page.evaluate(() => ({
    visible: [...document.querySelectorAll('.post-card')]
      .filter((card) => !card.classList.contains('hidden')).length,
    total: document.querySelectorAll('.post-card').length,
    count: document.querySelector('#post-count')?.textContent.trim(),
    loadMoreHidden: document.querySelector('#load-more').hidden,
    allPressed: document.querySelector('.filter-btn[data-filter="all"]')?.getAttribute('aria-pressed'),
    macroPressed: document.querySelector('.filter-btn[data-filter="Macro"]')?.getAttribute('aria-pressed'),
  }));

  assert.equal(allAgain.visible, 8);
  assert.equal(allAgain.count, `${POST_COUNT} posts`);
  assert.equal(allAgain.loadMoreHidden, false);
  assert.equal(allAgain.allPressed, 'true');
  assert.equal(allAgain.macroPressed, 'false');

  await page.close();
});
