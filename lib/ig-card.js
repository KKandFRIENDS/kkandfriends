// Instagram card: one 1080x1350 JPEG per public article.
//
// Instagram is image-first, and its publishing API takes JPEG only. Posting the
// same og-image every time would fill the grid with one picture, so each
// article gets its own card with its title and summary on it (2026-10-09 KK
// decision). /card/<kind>/<slug>.jpg serves it; /instagram.xml points at it.
//
// The card is plain SVG rasterised by resvg with the bundled Pretendard font
// (OFL, fonts/OFL-Pretendard.txt). No browser, no system fonts: a missing
// Korean font is what turned the og-image's Korean line into boxes.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
export const CARD_FONTS = ['Pretendard-Bold.otf', 'Pretendard-Regular.otf'].map(f => path.join(FONT_DIR, f));

const PAD = 96;
const TEXT_WIDTH = CARD_WIDTH - PAD * 2;

const xml = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// resvg cannot measure text for us, so widths are estimated per character in
// em. Pretendard's Hangul is about 0.92em; erring wide only wraps a line early.
function charWidth(ch) {
  if (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch)) return 0.95;
  if (ch === ' ') return 0.27;
  if (/[A-Z0-9]/.test(ch)) return 0.66;
  if (/[a-z]/.test(ch)) return 0.55;
  return 0.4;
}
const textWidth = (s, size) => [...s].reduce((w, ch) => w + charWidth(ch) * size, 0);

/**
 * Greedy word wrap. Korean puts spaces between words, so breaking at spaces
 * keeps words whole; a single word wider than the line is split by character.
 * Past maxLines the last line ends in an ellipsis.
 */
export function wrapText(text, size, maxWidth, maxLines) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let line = '';
  const push = () => { if (line) lines.push(line); line = ''; };
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size) <= maxWidth) { line = candidate; continue; }
    push();
    if (textWidth(word, size) <= maxWidth) { line = word; continue; }
    for (const ch of word) {
      if (textWidth(line + ch, size) > maxWidth) push();
      line += ch;
    }
  }
  push();
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && textWidth(`${last}…`, size) > maxWidth) last = [...last].slice(0, -1).join('');
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

const tspans = (lines, x, y, lineHeight) => lines
  .map((l, i) => `<tspan x="${x}" y="${Math.round(y + i * lineHeight)}">${xml(l)}</tspan>`).join('');

/**
 * @param {{title: string, summary?: string, label?: string, disclosure?: string}} card
 */
export function buildCardSvg({ title, summary = '', label = 'KK ORIGINAL', disclosure = '' }) {
  const titleSize = 76;
  const titleLead = Math.round(titleSize * 1.3);
  const titleLines = wrapText(title, titleSize, TEXT_WIDTH, 5);
  const titleTop = 380;

  const bodySize = 38;
  const bodyLead = Math.round(bodySize * 1.6);
  const bodyTop = titleTop + (titleLines.length - 1) * titleLead + 120;
  const bodyBottom = disclosure ? 1110 : 1150;
  const bodyMax = Math.max(0, Math.floor((bodyBottom - bodyTop) / bodyLead) + 1);
  const bodyLines = bodyMax ? wrapText(summary, bodySize, TEXT_WIDTH, bodyMax) : [];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <radialGradient id="glow" cx="0.12" cy="0.08" r="0.9">
      <stop offset="0" stop-color="#0F1E36"/>
      <stop offset="1" stop-color="#05080F"/>
    </radialGradient>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#glow)"/>
  <rect width="12" height="${CARD_HEIGHT}" fill="#4A90D9"/>
  <rect width="${CARD_WIDTH}" height="4" fill="#4A90D9"/>
  <g font-family="Pretendard">
    <text x="${PAD}" y="150" font-size="30" font-weight="700" letter-spacing="4" fill="#4A90D9">KK &amp; FRIENDS</text>
    <text x="${PAD}" y="198" font-size="26" letter-spacing="2" fill="#8FA3BF">${xml(label)}</text>
    <rect x="${PAD}" y="232" width="200" height="2" fill="#4A90D9"/>
    <text font-size="${titleSize}" font-weight="700" fill="#FFFFFF">${tspans(titleLines, PAD, titleTop, titleLead)}</text>
    <text font-size="${bodySize}" fill="#C3CEDF">${tspans(bodyLines, PAD, bodyTop, bodyLead)}</text>
    ${disclosure ? `<text x="${PAD}" y="1190" font-size="24" fill="#8FA3BF">${xml(disclosure)}</text>` : ''}
    <rect x="${PAD}" y="1222" width="${TEXT_WIDTH}" height="1" fill="#1F3556"/>
    <text x="${PAD}" y="1276" font-size="30" font-weight="700" fill="#4A90D9">www.kkandfriends.com</text>
    <text x="${CARD_WIDTH - PAD}" y="1276" font-size="26" fill="#8FA3BF" text-anchor="end">전문은 프로필 링크에서</text>
  </g>
</svg>`;
}

/** SVG → JPEG. Instagram's API rejects PNG, so this is the format it needs. */
export async function renderCardJpeg(svg, { quality = 90 } = {}) {
  const [{ Resvg }, jpeg] = await Promise.all([import('@resvg/resvg-js'), import('jpeg-js')]);
  const image = new Resvg(svg, {
    font: { fontFiles: CARD_FONTS, loadSystemFonts: false, defaultFontFamily: 'Pretendard' },
    fitTo: { mode: 'original' },
  }).render();
  const { data } = (jpeg.default ?? jpeg).encode(
    { data: image.pixels, width: image.width, height: image.height }, quality,
  );
  return data;
}
