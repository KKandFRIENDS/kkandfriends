// Site Steward phone check (2026-11-07): Pixel 7 width, horizontal scroll, small tap targets, console errors, load time.
// Usage: node scripts/site-steward-mobile.cjs  (read-only; saves nothing except home-phone.png in the current folder)
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const pages = ['/', '/thoughts', '/community', '/membership', '/join', '/week', '/thoughts?series=Daily%20Markets', '/markets/2026-11-06-close', '/original/20261105-open-the-books-on-precedents', '/posts/20260925_everything_will_be_a_token', '/voices', '/privacy'];
  for (const p of pages) {
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message.slice(0,80)));
    pg.on('console', m => { if (m.type()==='error') errs.push(m.text().slice(0,80)); });
    const t0 = Date.now();
    await pg.goto('https://www.kkandfriends.com' + p, { waitUntil: 'load', timeout: 45000 });
    const load = Date.now() - t0;
    await pg.waitForTimeout(1500);
    const r = await pg.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')].filter(e => { const b = e.getBoundingClientRect(); return b.right > w + 2 && b.width > 0 && getComputedStyle(e).position !== 'fixed'; }).slice(0,3).map(e => e.tagName + '.' + (e.className||'').toString().slice(0,30));
      const small = [...document.querySelectorAll('a,button')].filter(e => { const b = e.getBoundingClientRect(); return b.width>0 && b.height>0 && b.height < 24 && getComputedStyle(e).display!=='inline'; }).length;
      return { scrollW: document.documentElement.scrollWidth, w, wide, small };
    });
    console.log(p, `load ${load}ms`, r.scrollW > r.w ? `HSCROLL ${r.scrollW}>${r.w} ${r.wide}` : 'no-hscroll', `smallTaps ${r.small}`, errs.length ? 'ERR ' + [...new Set(errs)].slice(0,2).join(' | ') : '');
    if (p === '/') await pg.screenshot({ path: 'home-phone.png', fullPage: false });
    await pg.close();
  }
  await b.close();
})();
