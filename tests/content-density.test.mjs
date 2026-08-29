import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

let browser;

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

test('homepage shows only the three latest article previews', async () => {
  const page = await openLocalPage('index.html');
  const articles = await page.evaluate(() => ({
    latest: document.querySelectorAll('.latest-strip .ls-card').length,
    duplicatedFeed: document.querySelectorAll('.intel-grid .intel-card').length,
    thoughtsAnchor: Boolean(document.querySelector('#thoughts')),
  }));

  assert.equal(articles.latest, 3);
  assert.equal(articles.duplicatedFeed, 0);
  assert.equal(articles.thoughtsAnchor, true);

  await page.close();
});

test('THOUGHTS has 33 unique non-empty article cards and eight real initial previews', async () => {
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

  assert.equal(initial.cards.length, 33);
  assert.equal(new Set(initial.cards.map(({ href }) => href)).size, 33);
  assert.equal(initial.cards.every(({ href, title }) => href && title), true);
  assert.equal(initial.visibleCards.length, 8);
  assert.equal(initial.visibleCards.every(({ href, title }) => href && title), true);
  assert.equal(initial.loadMoreVisible, true);
  assert.equal(initial.count, '33 posts');
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
    count: document.querySelector('#post-count')?.textContent.trim(),
    loadMoreHidden: document.querySelector('#load-more').hidden,
    allPressed: document.querySelector('.filter-btn[data-filter="all"]')?.getAttribute('aria-pressed'),
    macroPressed: document.querySelector('.filter-btn[data-filter="Macro"]')?.getAttribute('aria-pressed'),
  }));

  assert.equal(allAgain.visible, 8);
  assert.equal(allAgain.count, '33 posts');
  assert.equal(allAgain.loadMoreHidden, false);
  assert.equal(allAgain.allPressed, 'true');
  assert.equal(allAgain.macroPressed, 'false');

  await page.close();
});
