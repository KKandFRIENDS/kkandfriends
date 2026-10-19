// KK ORIGINAL infographic: one 1200px-wide PNG per article (2026-10-19 KK decision).
//
//   node scripts/build-infographic.mjs <spec.json> <out.png>
//
// The PNG is attached by KK in /write-original (image upload, 5MB) and sits
// right under the 1-2 line summary. Numbers on it must match the article.
// Same fonts and colours as the Instagram cards (lib/ig-card.js). Spec example:
// docs/infographic-example.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { CARD_FONTS } from '../lib/ig-card.js';

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) {
  console.error('usage: node scripts/build-infographic.mjs <spec.json> <out.png>');
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

const xml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const W = 1200, X = 80, BAR_W = 1040, GAP = 104;
const steps = spec.steps ?? [];
const y0 = 570;
const ruleY = y0 + (steps.length - 1) * GAP + 96;

const rows = steps.map(([n, head, num, note], i) => {
  const y = y0 + i * GAP;
  const op = (1 - i * 0.09).toFixed(2);
  return `<g opacity="${op}">
    <circle cx="${X + 28}" cy="${y}" r="28" fill="${i < 2 ? '#4A90D9' : '#0F1E36'}" stroke="#4A90D9" stroke-width="2"/>
    <text x="${X + 28}" y="${y + 10}" font-size="28" font-weight="700" text-anchor="middle" fill="#FFFFFF">${xml(n)}</text>
    <text x="${X + 84}" y="${y - 4}" font-size="36" font-weight="700" fill="#FFFFFF">${xml(head)}</text>
    <text x="${X + 84}" y="${y + 34}" font-size="24" fill="#8FA3BF">${xml(num)}  ·  ${xml(note)}</text>
  </g>`;
}).join('\n');

const bar = spec.bar;
const barY = ruleY + 98;
const barBlock = bar ? `
  <rect x="${X}" y="${ruleY}" width="${BAR_W}" height="1" fill="#1F3556"/>
  <text x="${X}" y="${ruleY + 48}" font-size="22" font-weight="700" letter-spacing="3" fill="#8FA3BF">${xml(bar.label)}</text>
  <rect x="${X}" y="${barY}" width="${BAR_W}" height="44" rx="6" fill="#0F1E36" stroke="#1F3556"/>
  <rect x="${X}" y="${barY}" width="${Math.max(2, Math.round(bar.ratio * BAR_W))}" height="44" fill="#4A90D9"/>
  <text x="${X}" y="${barY + 92}" font-size="30" font-weight="700" fill="#FFFFFF">${xml(bar.line1)}</text>
  <text x="${X}" y="${barY + 132}" font-size="24" fill="#8FA3BF">${xml(bar.line2)}</text>` : '';
const footTop = bar ? barY + 182 : ruleY;
const H = footTop + 136;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><radialGradient id="g" cx="0.1" cy="0.05" r="1"><stop offset="0" stop-color="#0F1E36"/><stop offset="1" stop-color="#05080F"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<rect width="8" height="${H}" fill="#4A90D9"/><rect width="${W}" height="4" fill="#4A90D9"/>
<g font-family="Pretendard">
  <text x="${X}" y="110" font-size="26" font-weight="700" letter-spacing="4" fill="#4A90D9">KK &amp; FRIENDS</text>
  <text x="${X}" y="150" font-size="22" letter-spacing="2" fill="#8FA3BF">KK ORIGINAL · ${xml(spec.category)}</text>
  <text x="${X}" y="270" font-size="70" font-weight="700" fill="#FFFFFF">${xml(spec.title1)}</text>
  <text x="${X}" y="355" font-size="70" font-weight="700" fill="#4A90D9">${xml(spec.title2)}</text>
  <text x="${X}" y="420" font-size="28" fill="#C3CEDF">${xml(spec.sub)}</text>
  <rect x="${X}" y="448" width="${BAR_W}" height="1" fill="#1F3556"/>
  <text x="${X}" y="490" font-size="22" font-weight="700" letter-spacing="3" fill="#8FA3BF">${xml(spec.stepsLabel)}</text>
  ${rows}
  ${barBlock}
  <rect x="${X}" y="${footTop - 18}" width="${BAR_W}" height="1" fill="#1F3556"/>
  <text x="${X}" y="${footTop + 30}" font-size="28" font-weight="700" fill="#FFFFFF">${xml(spec.bottomLine)}</text>
  <text x="${X}" y="${footTop + 80}" font-size="24" font-weight="700" fill="#4A90D9">www.kkandfriends.com</text>
</g></svg>`;

const png = new Resvg(svg, {
  font: { fontFiles: CARD_FONTS, loadSystemFonts: false, defaultFontFamily: 'Pretendard' },
}).render().asPng();
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${W}x${H}, ${png.length} bytes)`);
