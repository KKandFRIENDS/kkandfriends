// One infographic per KK Daily / Weekly draft (2026-10-19 KK request).
//
// The morning routine「KK Daily·Weekly 초안 → 텔레그램」writes a small JSON
// spec, this script turns it into a 1080-wide PNG, and the routine sends the
// PNG to KK on Telegram next to the draft. KK attaches it in /write-desk
// (images go in content.attachments, the body cannot carry URLs).
//
//   node scripts/desk-infographic.mjs spec.json out.png [--body body.txt]
//
// --body refuses the card when it shows a number the draft body does not
// contain: the card may only repeat figures the draft already checked.
//
// Spec:
// {
//   "eyebrow": "KK DAILY · MACRO",
//   "title": "...", "subtitle": "...",
//   "sections": [
//     { "type": "stats", "heading": "...", "items": [{ "value": "4.25%", "label": "...", "note": "..." }] },
//     { "type": "list",  "heading": "...", "badge": "...", "items": [{ "tag": "2026.10", "text": "...", "status": "..." }] },
//     { "type": "bars",  "heading": "...", "unit": "%", "items": [{ "label": "...", "value": 3.1, "display": "3.1%" }] }
//   ],
//   "sources": "출처: ...", "asOf": "2026-10-19", "digitalAsset": false
// }
//
// Same look as the site cards: navy ground, Pretendard from fonts/ (no system
// fonts), blue for labels, the warm color only for a status chip that also
// carries its word.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { wrapText, CARD_FONTS } from '../lib/ig-card.js';

export const WIDTH = 1080;
export const MIN_HEIGHT = 1080;
export const MAX_HEIGHT = 1350;
const P = 72;
const INNER = WIDTH - P * 2;
const C = {
  bg: '#0A0E1A', panel: '#111A2B', line: '#26354B',
  ink: '#F2F5FA', sub: '#B9C6D6', muted: '#8193AB',
  accent: '#7AB8F5', blue: '#4A90D9', warn: '#E8806A', warnBg: '#3A1F1D',
};
export const DISCLAIMER = '정보 제공 목적이며 투자 권유가 아닙니다.';
export const DISCLOSURE = '필자는 디지털 자산 관련 상장사에 재직 중입니다.';

const xml = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (x, y, s, size, fill, { weight = 400, anchor = 'start', spacing = 0 } = {}) =>
  `<text x="${x}" y="${Math.round(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${xml(s)}</text>`;
const lines = (x, y, arr, size, lead, fill, opts) => arr.map((l, i) => text(x, y + i * lead, l, size, fill, opts)).join('');

function stats(sec, y) {
  const items = (sec.items || []).slice(0, 3);
  if (items.length < 2) throw new Error('stats needs 2 or 3 items');
  const gap = 18;
  const w = (INNER - gap * (items.length - 1)) / items.length;
  const notes = items.map(it => wrapText(it.note || '', 18, w - 52, 2));
  const h = 132 + Math.max(...notes.map(n => n.length)) * 24 + 18;
  let o = '';
  items.forEach((it, i) => {
    const x = P + i * (w + gap);
    const vSize = [...String(it.value)].length > 7 ? 38 : 46;
    o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.panel}" stroke="${C.line}"/>`;
    o += text(x + 26, y + 70, it.value, vSize, C.ink, { weight: 700 });
    o += text(x + 26, y + 108, it.label || '', 22, C.accent, { weight: 700 });
    o += lines(x + 26, y + 144, notes[i], 18, 24, C.muted);
  });
  return { svg: o, h };
}

function list(sec, y) {
  const items = (sec.items || []).slice(0, 6);
  if (!items.length) throw new Error('list needs items');
  let o = '';
  let cy = y;
  const rows = items.map(it => {
    const chip = it.status ? 26 + [...it.status].length * 22 : 0;
    const t = wrapText(it.text || '', 23, INNER - 40 - (chip ? chip + 20 : 0), 2);
    return { it, chip, t, h: (it.tag ? 30 : 0) + t.length * 30 + 22 };
  });
  const lastDot = y + rows.slice(0, -1).reduce((s, r) => s + r.h, 0) + 14;
  o += `<line x1="${P + 14}" y1="${y + 14}" x2="${P + 14}" y2="${lastDot}" stroke="${C.line}" stroke-width="2"/>`;
  for (const r of rows) {
    o += `<circle cx="${P + 14}" cy="${cy + 14}" r="8" fill="${C.bg}" stroke="${C.accent}" stroke-width="3"/>`;
    if (r.it.tag) o += text(P + 40, cy + 22, r.it.tag, 20, C.accent, { weight: 700 });
    o += lines(P + 40, cy + (r.it.tag ? 52 : 22), r.t, 23, 30, C.ink);
    if (r.chip) {
      o += `<rect x="${WIDTH - P - r.chip}" y="${cy}" width="${r.chip}" height="38" rx="19" fill="${C.warnBg}" stroke="${C.warn}" stroke-width="1.5"/>`;
      o += text(WIDTH - P - r.chip / 2, cy + 26, r.it.status, 20, C.warn, { weight: 700, anchor: 'middle' });
    }
    cy += r.h;
  }
  return { svg: o, h: cy - y };
}

function bars(sec, y) {
  const items = (sec.items || []).slice(0, 6);
  if (items.length < 2) throw new Error('bars needs 2 or more items');
  const max = Math.max(...items.map(it => Math.abs(Number(it.value)) || 0));
  if (!(max > 0)) throw new Error('bars needs numeric values');
  const labelW = 300, barX = P + labelW, barW = INNER - labelW - 150, rowH = 52;
  let o = '';
  items.forEach((it, i) => {
    const ry = y + i * rowH;
    const w = Math.max(4, (Math.abs(Number(it.value)) / max) * barW);
    o += text(P, ry + 30, wrapText(it.label, 22, labelW - 20, 1)[0], 22, C.sub);
    o += `<rect x="${barX}" y="${ry + 10}" width="${w}" height="26" rx="4" fill="${C.blue}"/>`;
    o += text(barX + w + 14, ry + 31, it.display ?? `${it.value}${sec.unit || ''}`, 22, C.ink, { weight: 700 });
  });
  return { svg: o, h: items.length * rowH };
}

const SECTIONS = { stats, list, bars };

export function buildInfographicSvg(spec) {
  if (!spec?.title) throw new Error('title is required');
  const secs = (spec.sections || []).slice(0, 3);
  if (!secs.length) throw new Error('at least one section is required');
  let o = '';
  let y = 92;
  o += text(P, y, spec.eyebrow || 'KK & FRIENDS', 22, C.accent, { weight: 700, spacing: 2 });
  const titleLines = wrapText(spec.title, 54, INNER, 2);
  y += 70;
  o += lines(P, y, titleLines, 54, 66, C.ink, { weight: 700 });
  y += (titleLines.length - 1) * 66;
  if (spec.subtitle) {
    const sub = wrapText(spec.subtitle, 26, INNER, 2);
    y += 48;
    o += lines(P, y, sub, 26, 36, C.sub);
    y += (sub.length - 1) * 36;
  }
  for (const sec of secs) {
    const fn = SECTIONS[sec.type];
    if (!fn) throw new Error(`unknown section type: ${sec.type}`);
    y += 68;
    o += text(P, y, sec.heading || '', 30, C.ink, { weight: 700 });
    if (sec.badge) o += text(WIDTH - P, y, sec.badge, 26, C.warn, { weight: 700, anchor: 'end' });
    y += 26;
    const part = fn(sec, y);
    o += part.svg;
    y += part.h;
  }
  const foot = [
    ...wrapText(`${spec.sources || ''}${spec.asOf ? ` 기준일 ${spec.asOf}.` : ''}`, 16, INNER, 3),
    spec.digitalAsset ? `${DISCLAIMER} ${DISCLOSURE}` : DISCLAIMER,
  ];
  y += 44;
  o += `<line x1="${P}" y1="${y}" x2="${WIDTH - P}" y2="${y}" stroke="${C.line}"/>`;
  o += lines(P, y + 32, foot, 16, 24, C.muted);
  y += 32 + (foot.length - 1) * 24 + 44;
  o += text(P, y, 'kkandfriends.com', 22, C.accent, { weight: 700 });
  o += text(WIDTH - P, y, 'By KK · Chief of KKandFriends', 18, C.sub, { anchor: 'end' });
  const height = Math.max(MIN_HEIGHT, Math.ceil(y + 48));
  if (height > MAX_HEIGHT) throw new Error(`too tall (${height}px > ${MAX_HEIGHT}px): cut items or shorten text`);
  return {
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><rect width="100%" height="100%" fill="${C.bg}"/><g font-family="Pretendard">${o}</g></svg>`,
  };
}

/** Every number the card shows as text (bar lengths, sources and date excluded). */
export function specNumbers(spec) {
  const shown = [spec.title, spec.subtitle, ...(spec.sections || []).flatMap(s => [s.heading, s.badge,
    ...(s.items || []).flatMap(it => [s.type === 'bars' ? null : it.value, it.label, it.note, it.tag, it.text, it.status, it.display])])];
  return numberAtoms(shown.filter(v => v != null).join(' '));
}

// "5,603" → "5603", "3.10" → "3.1", a date such as "2025.12.10" → "2025", "12", "10".
function numberAtoms(s) {
  return (String(s).match(/\d[\d,]*(?:\.\d+)*/g) || []).flatMap(tok => {
    const t = tok.replace(/,/g, '');
    const parts = /^(19|20)\d\d\./.test(t) ? t.split('.') : [t];
    return parts.map(n => String(Number(n)));
  });
}

/**
 * Numbers on the card that the body never mentions. Whole numbers up to 31
 * are let through: months, days and small counts ("6개 중 0개") are written
 * differently in the body ("2월", "6월") or derived from it.
 */
export function missingNumbers(spec, body) {
  const inBody = new Set(numberAtoms(body));
  return [...new Set(specNumbers(spec))].filter(n => !(Number.isInteger(Number(n)) && Number(n) <= 31) && !inBody.has(n));
}

export async function renderPng(svg) {
  const { Resvg } = await import('@resvg/resvg-js');
  return new Resvg(svg, {
    font: { fontFiles: CARD_FONTS, loadSystemFonts: false, defaultFontFamily: 'Pretendard' },
  }).render().asPng();
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const [specPath, outPath, flag, bodyPath] = process.argv.slice(2);
  if (!specPath || !outPath) {
    console.error('usage: node scripts/desk-infographic.mjs spec.json out.png [--body body.txt]');
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  if (flag === '--body') {
    const missing = missingNumbers(spec, readFileSync(bodyPath, 'utf8'));
    if (missing.length) {
      console.error(`numbers not in body: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
  const { svg, height } = buildInfographicSvg(spec);
  writeFileSync(outPath, await renderPng(svg));
  console.log(`ok ${WIDTH}x${height} ${outPath}`);
}
