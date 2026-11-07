# Site Steward (KK website care agent)

Set up 2026-11-07 at KK's request. A scheduled Claude Code task that looks after kkandfriends.com and suggests improvements.

## Decisions (KK, 2026-11-07)

- **How often:** weekly, Saturday 09:17 KST.
- **Scope:** **report only** to start. No PRs or code changes. KK widens the scope in stages:
  1. Report only (now)
  2. Draft PRs for small fixes (rules ①–②) once KK approves
  3. Proposals for new features
- **Priority order:** ① keeping the site clean → ② user experience → ③ more readers.
- **Old posts (2026-11-07 KK decision):** the banned sentence and em dashes in old `posts/` and earlier Daily Markets stay as they are. The weekly report gives only their count; it does not list each page again.
- **Broken chart in the 725x post (2026-11-07 KK decision):** the image was never added, so the figure was removed. If KK finds the original chart, it goes back in.
- **Schedule:** scheduled task "Site Steward weekly check" (Saturday 09:17 KST, new session each run).

## Hard limits (never)

- Merging, pushing to main, force-pushing, deleting files.
- Publishing to the lounge, Original, Daily or Weekly, or posting to LinkedIn, Instagram or Facebook.
- Touching the VPS, Vercel settings or Zapier. Anything server-side goes to KK as a command to paste.
- Editing old published posts (`posts/`, earlier Daily Markets). Report only; KK decides.
- Reporting "skipped" as success. A failure is a failure, and KK gets one line about it.
- Printing tokens or keys. Anything not verified is marked "확인 필요".

## Roles

| Role | Checks | Output |
|---|---|---|
| ① Health | `npm test`, `node scripts/site-steward.mjs` (sitemap, HTTP status, meta tags, internal links and images, feeds, API health) | Report |
| ② House rules | Visible text: em dash, banned sentence, personal Gmail on screen, English pairs like "A / B", unexplained jargon | Report (old posts listed separately) |
| ③ Freshness | Stale "확인 필요" and "~date 정리 예정" items in CLAUDE.md; items now verified that can be closed | To-do list for KK |
| ④ UX and readers | `scripts/site-steward-mobile.cjs` (Pixel 7, 12 pages): horizontal scroll, small tap targets, console errors, load time. 1–2 improvement ideas | Proposals |

## Weekly procedure

1. `TZ=Asia/Seoul date` to fix today's date. Read `CLAUDE.md`.
2. `npm ci --ignore-scripts` → `npm test`. For a failure, name the file:line and say whether the cause is the code, the test, or the calendar.
3. `NODE_USE_ENV_PROXY=1 node scripts/site-steward.mjs --out <temp>/report.json`. Compare with the most recent file in `ops/site-steward/reports/` (in stage 1 that is the 2026-11-07 baseline) and flag what is **new**. Items under "Closed items" and "Known normal" below are not reported again.
4. `node scripts/site-steward-mobile.cjs` (phone check, 12 pages).
5. Write the report in the order ① clean → ② UX → ③ readers → open items for KK. Each item gets one line on how serious it is, the evidence (URL, file:line), the proposed fix, and who decides.
6. Apply the humanizer skill (`.claude/skills/humanizer/SKILL.md`); numbers, URLs and paths stay as they are.
7. Telegram: `[Steward ✓] YYYY-MM-DD` plus 3–5 lines of key points. On failure: `[Steward ✗] YYYY-MM-DD · <step and reason>`.
8. Save the report file only from stage 2 onward, when PRs are allowed. Until then the report goes to Telegram and the completion notice only.

## Crawl caution

The API limits each visitor to 120 requests per minute. Fetching many pages at once returns 503s.
`site-steward.mjs` sends 3 requests at a time, waits 300 ms between them, and retries a 503/429 up to three times (after 5, 20 and 45 seconds). Do not crawl at higher concurrency. A page that still fails after the retries is a real finding.

## How to read the report.json (2026-11-07 update)

- **Dashes:** report only `ruleDashPages`, the pages the dash rule covers that have more dashes than KK accepted. `oldDashPages` is just a count ("old content: N pages, unchanged").
  - The rule covers KK Original from 2026-10-15 and Daily Markets from 2026-10-17. The brief's dash filter went live during 10/16, after that day's 07:00 brief was out. `posts/` is all old content.
  - List pages (`/thoughts`) repeat titles of the posts they link to and are not judged on their own.
  - Accepted exceptions are in `ALLOWED_DASHES` in the script (e.g. a dash inside a quoted source title). To add one, KK approves it first.
- **Editors warn before publishing (2026-11-07):** `/write-original` and `/write-desk` ask before publishing text with dashes (`js/dash-check.js`). New dashes in KK's posts should now be rare. If one appears, report the page and the sentence.

## Known normal (do not report)

- `/voices` before login: the console shows one `401 (Unauthorized)`. That is the session check saying "not logged in". It is normal.
- `/join` and `/voices` load the login buttons. The SVG error was fixed on 2026-11-07 (PR #102). Report it only if it comes back.

## Closed items (do not raise again)

- Google Search Console sitemap: **Success**, confirmed by KK on 2026-11-07 (CLAUDE.md).
- Weekend failures in `tests/vps-briefs.test.mjs`: fixed on 2026-11-07 (PR #101).
- Em dashes in page titles and on home, Community and Membership: fixed on 2026-11-07 (PR #100 and this update).
- Broken chart in the 725x post: removed on 2026-11-07 (PR #99).

