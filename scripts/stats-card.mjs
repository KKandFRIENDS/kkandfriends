// Print the 수치 카드 for a draft: official numbers with source, as-of date and
// cross-checks, ready to paste BELOW the body (출처·정정 표는 본문 밖).
//
//   node scripts/stats-card.mjs                 # last 3 days of 공시, all sections
//   node scripts/stats-card.mjs --days=7        # widen the 공시 window
//   node scripts/stats-card.mjs --no-details    # headlines only, fewer API calls
//
// Needs the keys in the environment (ECOS_API_KEY, DART_API_KEY, OPENLAW_OC,
// KOSIS_API_KEY). Missing ones are listed under "확인 필요" instead of failing.
// Never prints a key. Read-only: it only GETs public statistics APIs.
import { gatherCardEntries, renderCard } from '../lib/stats/index.js';

const args = process.argv.slice(2);
const days = Number((args.find((a) => a.startsWith('--days=')) || '').slice('--days='.length)) || 3;
const details = !args.includes('--no-details');

const card = await gatherCardEntries({ days, details });
console.log(renderCard(card));
