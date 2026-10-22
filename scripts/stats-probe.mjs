// Connectivity and shape probe for the official-statistics APIs. Prints
// status and field NAMES only, never a key and never a full response.
//
//   node scripts/stats-probe.mjs                     # every provider, one line each
//   node scripts/stats-probe.mjs kosis-cpi           # read CPI, show the raw field names
//   node scripts/stats-probe.mjs kosis-search 주민등록인구   # find a 통계표 ID
//   node scripts/stats-probe.mjs dart                # 공시 list shape
//   node scripts/stats-probe.mjs openlaw             # 법령 shape
//
// `kosis-cpi` and `kosis-search` exist to CONFIRM the KOSIS assumptions in
// lib/stats/kosis.js (verified:false). Run them with a real KOSIS_API_KEY, read
// the output, then fix the table ids and labels. Do not flip `verified` by guess.
import { dartConfigured, fetchMajorReports } from '../lib/stats/dart.js';
import { openlawConfigured, fetchLawWatch } from '../lib/stats/openlaw.js';
import { kosisConfigured, fetchKosisSeries, searchKosisTables, INDICATORS } from '../lib/stats/kosis.js';
import { ecosConfigured, fetchEcosKeyStats } from '../lib/ecos.js';

const [cmd = 'all', ...rest] = process.argv.slice(2);
const set = (b) => (b ? 'set' : 'NOT SET');

async function all() {
  console.log(`ECOS_API_KEY   ${set(ecosConfigured())}`);
  console.log(`DART_API_KEY   ${set(dartConfigured())}`);
  console.log(`OPENLAW_OC     ${set(openlawConfigured())}`);
  console.log(`KOSIS_API_KEY  ${set(kosisConfigured())}`);
  if (ecosConfigured()) console.log('ecos   ', (await fetchEcosKeyStats()).length, 'indicators');
  if (dartConfigured()) {
    const r = await fetchMajorReports({ days: 1 });
    console.log('dart   ', r.ok ? `ok, scanned ${r.scanned}, kept ${r.items.length}` : `FAIL ${r.error}`);
  }
  if (openlawConfigured()) {
    const r = await fetchLawWatch();
    console.log('openlaw', r.ok ? `ok, ${r.statuses.length} laws${r.errors.length ? `, errors: ${r.errors.length}` : ''}` : `FAIL ${r.error}`);
  }
  if (kosisConfigured()) {
    const r = await fetchKosisSeries({ orgId: INDICATORS.cpi.orgId, tblId: INDICATORS.cpi.tblId, newEstPrdCnt: 1 });
    console.log('kosis  ', r.ok ? `ok, ${r.rows.length} rows` : `FAIL ${r.error}`);
  }
}

async function kosisCpi() {
  const r = await fetchKosisSeries({ orgId: INDICATORS.cpi.orgId, tblId: INDICATORS.cpi.tblId, newEstPrdCnt: 1 });
  if (!r.ok) return console.log('FAIL', r.error);
  console.log('rows:', r.rows.length);
  console.log('first 8 (class1 | item | period | value | unit):');
  for (const row of r.rows.slice(0, 8)) console.log(`  ${row.class1} | ${row.item} | ${row.period} | ${row.rawValue} | ${row.unit}`);
  console.log('pick() result:', INDICATORS.cpi.pick(r.rows));
}

async function kosisSearch(name) {
  const r = await searchKosisTables(name);
  if (!r.ok) return console.log('FAIL', r.error);
  console.log('raw field names:', r.raw[0] ? Object.keys(r.raw[0]).join(', ') : '(no rows)');
  for (const t of r.tables) console.log(`  orgId=${t.orgId} tblId=${t.tblId} | ${t.tblNm} (${t.orgNm})`);
}

async function dart() {
  const r = await fetchMajorReports({ days: 3 });
  if (!r.ok) return console.log('FAIL', r.error);
  console.log(`scanned ${r.scanned}, kept ${r.items.length}, truncated ${r.truncated}`);
  for (const it of r.items.slice(0, 5)) console.log(`  ${it.rceptDt} ${it.market} ${it.label}${it.amended ? ' (정정)' : ''} ${it.corpName}`);
}

async function openlaw() {
  const r = await fetchLawWatch();
  console.log('ok', r.ok, 'errors', r.errors);
  for (const s of r.statuses ?? []) console.log(`  ${s.name}: current ${s.current?.effective ?? '-'}, upcoming ${s.upcoming.map((u) => u.effective).join(', ') || '-'}`);
}

const commands = { all, 'kosis-cpi': kosisCpi, 'kosis-search': () => kosisSearch(rest.join(' ') || '주민등록인구'), dart, openlaw };
if (!commands[cmd]) {
  console.error(`unknown command: ${cmd}. one of: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}
await commands[cmd]();
