// 이번 주 체크 포인트: the hand-kept calendar, one module per year.
//
// Why modules and not JSON read from disk: a static import is bundled with the
// function automatically, so nothing in vercel.json has to change for this
// feature. Adding a year = add the file and one import/array entry below.
//
// Rules for every item (enforced by tests/week-calendar.test.mjs):
//   - source.url is the official calendar page (https), verifiedAt is the day
//     the date was read there. No source, no item.
//   - Only dates read from the source. Never fill one in from memory.
//   - One line each for title and note; no em dash; no individual stocks.
import y2026 from './2026.js';

export default [y2026];
