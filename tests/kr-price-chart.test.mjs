import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChartSvg, renderPng, spreadLabels, SERIES, W, H } from '../scripts/kr-price-chart.mjs';

const months = (from, n, f) => Array.from({ length: n }, (_, i) => {
  const t = from * 12 + i;
  return [`${Math.floor(t / 12)}${String((t % 12) + 1).padStart(2, '0')}`, f(i)];
});
const data = {
  asOf: '202609',
  series: SERIES.map((s, k) => ({ code: s.code, name: s.label, rows: months(2000, 321, i => 50 + i * (0.1 + k * 0.02)) })),
};

test('spreadLabels keeps labels apart and in order of their end values', () => {
  const out = spreadLabels([100, 104, 108, 400], 40, 0, 1000);
  for (let i = 1; i < out.length; i += 1) assert.ok(out[i] - out[i - 1] >= 40);
  assert.ok(out.every(y => y >= 0 && y <= 1000));
});

test('chart svg draws every series and renders to a PNG', async () => {
  const { svg } = buildChartSvg(data);
  assert.equal((svg.match(/stroke-linejoin="round"/g) || []).length, SERIES.length);
  assert.ok(svg.includes(`width="${W}" height="${H}"`));
  const png = await renderPng(svg);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
});
