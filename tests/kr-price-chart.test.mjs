import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChartSvg, chainWage, renderPng, spreadLabels, SERIES, WAGE_BREAK_YEARS, W, H } from '../scripts/kr-price-chart.mjs';

const months = (n, f) => Array.from({ length: n }, (_, i) => {
  const t = 2000 * 12 + i;
  return [`${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, '0')}`, f(i)];
});
const wage = Array.from({ length: 27 }, (_, i) => [1999 + i, 1000 * 1.05 ** i, 'T']);
const data = {
  monthly: Object.fromEntries(SERIES.filter(s => s.src !== 'wage').map((s, k) => [s.code, months(321, i => 50 + i * (0.1 + k * 0.02))])),
  wage,
};

test('spreadLabels keeps labels apart and in order of their end values', () => {
  const out = spreadLabels([100, 104, 108, 400], 40, 0, 1000);
  for (let i = 1; i < out.length; i += 1) assert.ok(out[i] - out[i - 1] >= 40);
  assert.ok(out.every(y => y >= 0 && y <= 1000));
});

test('chainWage starts at 0 and replaces the break years with the neighbours\' average growth', () => {
  const rows = [[1999, 100], [2000, 100]];
  for (let y = 2001; y <= 2026; y += 1) rows.push([y, rows.at(-1)[1] * (WAGE_BREAK_YEARS.includes(y) ? 0.9 : 1.1)]);
  const pts = chainWage(rows);
  assert.equal(pts[0][1], 0);
  assert.equal(pts.at(-1)[0], 2025 * 12 + 6);
  assert.ok(Math.abs(pts.at(-1)[1] - (1.1 ** 25 - 1) * 100) < 1e-6, 'break-year drops are not carried into the line');
});

test('chart svg draws every series and renders to a PNG', async () => {
  const { svg } = buildChartSvg(data);
  assert.equal((svg.match(/stroke-linejoin="round"/g) || []).length, SERIES.length);
  assert.ok(svg.includes(`width="${W}" height="${H}"`));
  assert.equal((await renderPng(svg)).subarray(1, 4).toString(), 'PNG');
});
