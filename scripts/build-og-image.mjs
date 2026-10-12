// Rebuilds og-image.png, the 1200x630 card every page declares as og:image
// (and the LinkedIn Zap's fixed thumbnail).
//
//   node scripts/build-og-image.mjs
//
// The previous file had no source and was drawn without a Korean font, so its
// Korean line came out as boxes. It also carried a "200+ Founding Members"
// stat column that no longer matched the community; KK asked for it to go
// (2026-10-10). Same fonts as the Instagram cards (lib/ig-card.js).

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { CARD_FONTS } from '../lib/ig-card.js';

const W = 1200;
const H = 630;
const X = 72;

const grid = [];
for (let x = 60; x < W; x += 60) grid.push(`<rect x="${x}" y="0" width="1" height="${H}" fill="#FFFFFF" fill-opacity="0.025"/>`);
for (let y = 60; y < H; y += 60) grid.push(`<rect x="0" y="${y}" width="${W}" height="1" fill="#FFFFFF" fill-opacity="0.025"/>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="0.08" cy="0.55" r="0.75">
      <stop offset="0" stop-color="#0E1D35"/>
      <stop offset="1" stop-color="#05080F"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${grid.join('\n  ')}
  <rect width="6" height="${H}" fill="#4A90D9"/>
  <rect width="${W}" height="3" fill="#4A90D9"/>
  <g font-family="Pretendard">
    <text x="${X}" y="96" font-size="18" font-weight="700" letter-spacing="3" fill="#4A90D9">KK &amp; FRIENDS</text>
    <text x="${X}" y="122" font-size="16" letter-spacing="2" fill="#8FA3BF">FINANCIAL INTELLIGENCE COMMUNITY</text>
    <rect x="${X}" y="140" width="190" height="1.5" fill="#4A90D9"/>
    <text x="${X}" y="250" font-size="86" font-weight="700" letter-spacing="1" fill="#FFFFFF">WHERE FINANCE</text>
    <text x="${X}" y="346" font-size="86" font-weight="700" letter-spacing="1" fill="#4A90D9">MEETS WISDOM</text>
    <text x="${X}" y="418" font-size="26" font-weight="700" fill="#C3CEDF">An exclusive intelligence network for elite finance professionals.</text>
    <text x="${X}" y="466" font-size="24" fill="#AEBBD0">경험 많은 금융 전문가의 동료 토론과 공개정보 기반 시장 관점.</text>
    <text x="${X}" y="568" font-size="20" font-weight="700" fill="#4A90D9">www.kkandfriends.com</text>
  </g>
</svg>`;

const png = new Resvg(svg, {
  font: { fontFiles: CARD_FONTS, loadSystemFonts: false, defaultFontFamily: 'Pretendard' },
}).render().asPng();

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'og-image.png');
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
