# 이번 주 체크 포인트 (Week Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 페이지 `/week`와 홈 요약 카드로, 이번 주 발표·일정(공식 달력 옮겨 적은 파일)과 시행되는 법령(OpenLaw)을 출처와 함께 보여준다.

**Architecture:** 순수 모듈 `lib/week-calendar.js`(주 계산, 항목 검증, 화면용 view 조립)와 `lib/week-render.js`(HTML, 홈용 JSON)를 만들고, `api/desk.js`에 `view=week`로 연결한다. 일정은 `data/week-calendar/<연도>.json`에서 읽고, 법령은 기존 `lib/stats/openlaw.js`로 요청 시 조회해 CDN에 캐시한다.

**Tech Stack:** Node ESM, `node --test`, Vercel serverless(기존 `api/desk.js`), 정적 `index.html`.

**Spec:** `docs/superpowers/specs/2026-10-22-week-calendar-design.md`

## Global Constraints

- 새 `api/*.js` 파일 금지 (Vercel 함수 12개 상한). `api/desk.js`에 view를 추가한다.
- Vercel cron 추가 금지 (예약 작업 0개 원칙). VPS 작업·텔레그램 알림은 이번 범위 밖.
- "이번 주" = 월~일(KST). 토·일에는 다음 주를 보여준다.
- 모든 일정 항목: `source.url`은 `https://`, `verifiedAt` 필수. 출처 없는 항목은 화면에 나오지 않는다.
- 캐시: 정상 `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400`, 법령 실패·일부 실패 시 `public, max-age=0, s-maxage=60`.
- 종목명 금지, em dash(—) 금지, 약자는 처음 나올 때 풀어 쓴다.
- 글꼴은 `var(--font-sans)`·`var(--font-serif)`만 사용 (`typography.css`를 마지막 쪽에서 불러온다). 폰 폭에서 가로 스크롤 없음.
- 홈 `.ih-series`는 카드 3개·3열 그대로 둔다 (`tests/home-lounge-card.test.mjs`가 고정). 새 카드는 별도 띠로 넣는다.
- `OPENLAW_OC` 값은 레포·채팅에 쓰지 않는다.
- 기존 발행 글(`posts/`)은 건드리지 않는다.
- 커밋 메시지 끝에 두 줄을 붙인다: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_018GNrox3tgqFV897QR6H3V4`
- 브랜치: `claude/lucid-gauss-6uq8hu`. PR은 KK가 요청할 때만.

## Review Focus

1. `source.url`이 `javascript:`·`http:`·빈 값인 항목 → 검증에서 탈락하고 화면에 안 나온다 (링크 주입 방지).
2. 제목·메모에 `<script>`나 `&`가 든 항목 → 이스케이프되어 그대로 글자로 보인다.
3. 해당 연도 파일이 없거나 `items`가 비어 있음 → "이번 주 일정 없음"이 아니라 "올해 일정이 아직 준비되지 않았습니다" (비어 있음과 준비 안 됨을 구분).
4. 법령 3개 중 일부만 읽혔고 이번 주 해당 0건 → "시행되는 법령 없음"이라 단정하지 않고 "일부만 확인됨/확인할 수 없음"으로 표시, 캐시 60초.
5. 주 경계: 금 23:59 KST는 이번 주, 토 00:00 KST는 다음 주, 연말(2026-12-28~2027-01-03)은 두 해 파일을 합쳐서 본다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/week-calendar.js` (신규) | `weekWindow`, `validateItem`, `loadWeekItems`, `buildWeekView`, `readCalendarFiles` (순수 + 파일 읽기 한 곳) |
| `lib/week-render.js` (신규) | `renderWeekPage(view)`, `homeWeekJson(view, limit)` |
| `lib/stats/openlaw.js` (수정) | `lawsEffectiveIn(statuses, from, to)` 추가 |
| `api/desk.js` (수정) | `makeWeekHandler`, views에 `week` 등록, 머리말 주석 갱신 |
| `lib/markets-render.js` (수정) | `nav` 상수를 `export` |
| `lib/feeds.js` (수정) | `STATIC_PAGES`에 `/week` |
| `vercel.json` (수정) | `/week` 리라이트, `api/desk.js` includeFiles에 일정 파일 |
| `index.html` (수정) | `#home-week` 띠 + 로더 스크립트 |
| `data/week-calendar/2026.json` (신규) | 공식 달력에서 확인한 항목만 |
| `tests/week-calendar.test.mjs` (신규) | 위 전부의 테스트 |
| `CLAUDE.md` (수정) | 운영 절차 한 단락 |

---

### Task 1: 기준선 확인 + 주 계산·항목 검증

**Files:**
- Create: `lib/week-calendar.js`, `tests/week-calendar.test.mjs`

**Interfaces:**
- Produces:
  - `weekWindow(now: Date): { from: string, to: string, isNextWeek: boolean }` (`YYYY-MM-DD`, KST 월~일)
  - `validateItem(item: unknown, fileYear?: number): string[]` (빈 배열 = 유효)
  - `type Item = { id, date, time?, region: 'kr'|'us'|'global', title, note, source: {name, url}, verifiedAt }`

- [ ] **Step 1: 기준선 만들기.** `npm ci` 후 `npm test`를 돌려 결과를 기록한다. 현재 7건 실패는 전부 `node_modules` 없음(`@resvg/resvg-js`, `puppeteer-core`) 때문이다. `npm ci`가 막히면 그 사실을 기록하고, 해당 7건은 "기존 실패"로 두고 진행한다.
- [ ] **Step 2: 실패하는 테스트 작성** (`tests/week-calendar.test.mjs`, 형식은 기존 테스트처럼 `node:test` + `node:assert/strict`):
  - `weekWindow(new Date('2026-10-22T03:00:00Z'))` → `{from:'2026-10-19', to:'2026-10-25', isNextWeek:false}`
  - `'2026-10-23T14:59:59Z'`(금 23:59:59 KST) → `from:'2026-10-19'`, `isNextWeek:false`
  - `'2026-10-23T15:00:00Z'`(토 00:00 KST) → `{from:'2026-10-26', to:'2026-11-01', isNextWeek:true}`
  - `'2026-10-25T10:00:00Z'`(일 19:00 KST) → `from:'2026-10-26'`, `isNextWeek:true`
  - `'2026-12-28T01:00:00Z'` → `{from:'2026-12-28', to:'2027-01-03', isNextWeek:false}`
  - `validateItem`: 유효 샘플은 `[]`. 각각 비어 있지 않은 배열을 기대하는 경우: `source.url`이 `http://x`, `javascript:alert(1)`, `''`; `date:'2026-02-30'`; `time:'25:00'`; `region:'jp'`; `title`에 `—`; `title` 빈 문자열; `verifiedAt` 없음; `id`에 공백; `fileYear:2026`인데 `date:'2027-01-04'`
- [ ] **Step 3: 실패 확인.** `node --test tests/week-calendar.test.mjs` → 모듈 없음으로 FAIL.
- [ ] **Step 4: 구현.** `lib/week-calendar.js`에 위 두 함수. 주 계산은 `lib/stats/http.js`의 `kstYmd(now, offsetDays)`·`isoFromYmd`를 재사용한다 (KST 날짜를 먼저 구하고 그 날짜의 요일로 월요일을 역산, 토·일이면 +7). 존재하지 않는 날짜(2월 30일)는 `Date.UTC` 왕복 비교로 거른다. 제목 60자, 메모 120자 이내, 줄바꿈 금지. `source.url`은 `new URL()`로 파싱해 `protocol === 'https:'`만 통과.
- [ ] **Step 5: 통과 확인.** 같은 명령 → PASS.
- [ ] **Step 6: 커밋.** `git add lib/week-calendar.js tests/week-calendar.test.mjs && git commit -m "Add week window and calendar item validation"`

---

### Task 2: 일정 불러오기와 화면용 view 조립

**Files:**
- Modify: `lib/week-calendar.js`
- Test: `tests/week-calendar.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `weekWindow`, `validateItem`, `Item`
- Produces:
  - `loadWeekItems(files: {year: number, items: unknown[]}[]): { items: Item[], rejected: {id: string, errors: string[]}[], years: number[] }` (유효 항목만, id 중복은 뒤의 것을 탈락)
  - `type LawItem = { name: string, effective: string, kind: string }`
  - `type LawInput = { status: 'ok'|'empty'|'unavailable', items: LawItem[], partial?: boolean }`
  - `buildWeekView({ now: Date, files: {year,items}[], law: LawInput }): WeekView`
  - `WeekView = { window, calendar: { status: 'ok'|'empty'|'not-prepared', items: Item[] }, law: { status: 'ok'|'empty'|'partial'|'unavailable', items: LawItem[] }, shortCache: boolean }`
  - `readCalendarFiles(dir?: URL): Promise<{year, items}[]>` (`data/week-calendar/*.json`을 읽고, 읽기·파싱 실패 파일은 건너뛴다)

- [ ] **Step 1: 실패하는 테스트 작성:**
  - 두 해 파일(2026, 2027)에 걸친 주(`now='2026-12-30T03:00:00Z'`)에서 양쪽 항목이 날짜순으로 나온다.
  - 같은 날짜: `time` 있는 항목이 시각순으로 먼저, 시각 없는 항목이 뒤.
  - 해당 주 항목 0건이지만 파일에 항목이 있음 → `calendar.status === 'empty'`.
  - 파일이 없거나 `items: []`뿐 → `calendar.status === 'not-prepared'` (Review Focus 3).
  - `law`가 `{status:'empty', partial:true}` → `view.law.status === 'partial'`, `shortCache === true` (Review Focus 4). `{status:'unavailable'}` → `shortCache === true`. `{status:'ok'}` + 정상 → `shortCache === false`.
  - 유효하지 않은 항목(http 출처)은 `calendar.items`에 없고 `rejected`에 있다 (Review Focus 1).
- [ ] **Step 2: 실패 확인.** `node --test tests/week-calendar.test.mjs` → FAIL.
- [ ] **Step 3: 구현.** 위 세 함수. 비어 있음과 준비 안 됨 구분 규칙은 위 테스트가 정의한다.
- [ ] **Step 4: 통과 확인.** → PASS.
- [ ] **Step 5: 커밋.** `git commit -am "Add week view assembly and calendar file loader"` (신규 파일 없음, 수정분만)

---

### Task 3: 법령 시행일 추출

**Files:**
- Modify: `lib/stats/openlaw.js` (파일 끝에 추가, 기존 export 변경 없음)
- Test: `tests/week-calendar.test.mjs`

**Interfaces:**
- Consumes: `fetchLawWatch()`가 주는 `statuses[]`. 각 원소는 `{ok, name, current: {mst, promulgated, effective, kind}|null, upcoming: [{mst, promulgated, effective, kind}]}` (`lib/stats/openlaw.js`의 `fetchLawStatus` 주석 참조)
- Produces: `lawsEffectiveIn(statuses, from: string, to: string): { name: string, effective: string, kind: string }[]` (`current`와 `upcoming` 모두 대상, `mst`로 중복 제거, `effective` 오름차순 후 `name` 순, 양 끝 날짜 포함)

- [ ] **Step 1: 실패하는 테스트:** `upcoming`의 시행일이 창 안/밖/경계(`from`, `to` 당일)인 경우, `current`의 시행일이 창 안(이번 주에 막 시행됨)인 경우, 같은 `mst`가 `current`와 `upcoming`에 중복된 경우, `statuses`가 빈 배열인 경우.
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현** `lawsEffectiveIn`. 문자열 `YYYY-MM-DD` 비교만 쓴다.
- [ ] **Step 4: 통과 확인.** `node --test tests/week-calendar.test.mjs tests/stats.test.mjs` → PASS (기존 stats 테스트 유지).
- [ ] **Step 5: 커밋.** `git commit -am "Add lawsEffectiveIn for the week calendar"`

---

### Task 4: 화면 렌더 (`/week` HTML, 홈용 JSON)

**Files:**
- Create: `lib/week-render.js`
- Modify: `lib/markets-render.js` (`const nav` → `export const nav`, 다른 변경 없음)
- Test: `tests/week-calendar.test.mjs`

**Interfaces:**
- Consumes: `WeekView`(Task 2), `nav`·`SITE` from `lib/markets-render.js`
- Produces:
  - `renderWeekPage(view: WeekView): string` (완성된 HTML 문서)
  - `homeWeekJson(view: WeekView, limit = 5): { from, to, isNextWeek, items: { date, time?, title, region }[] }` (일정 + 법령 시행 항목을 날짜순으로 합쳐 `limit`개. 법령은 `title`을 `` `${name} 시행` ``, `region:'kr'`)

- [ ] **Step 1: 실패하는 테스트:**
  - 페이지에 `<link rel="canonical" href="https://www.kkandfriends.com/week">`, `<title>이번 주 체크 포인트 · KK &amp; Friends</title>`, `/typography.css` 링크가 있고 `Source Serif` 글자는 없다.
  - 제목이 `<script>alert(1)</script> & x`인 항목 → 출력에 `<script>alert` 없음, `&lt;script&gt;` 있음 (Review Focus 2).
  - 각 항목에 출처 링크 `<a href="https://…" rel="noopener noreferrer">`와 `verifiedAt` 날짜 표시.
  - `calendar.status === 'not-prepared'` → "올해 일정이 아직 준비되지 않았습니다", `'empty'` → "이번 주 예정된 주요 일정이 없습니다". 두 문구가 서로 섞이지 않는다.
  - `law.status` 별 문구: `unavailable` → "지금 확인할 수 없습니다", `partial` → "일부만 확인됐습니다", `empty` → "이번 주 시행되는 법령이 없습니다".
  - `isNextWeek:true`이면 제목 아래에 "다음 주 일정" 표시, 아니면 "이번 주".
  - 응답 문자열에 `—`(em dash)가 없다.
  - `homeWeekJson`: 6개 이상 항목에서 5개만, 날짜순, 법령 항목 포함.
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.** `renderWeekPage`는 `renderMarketPage`와 같은 head 구성(canonical, og, `/member.css`·`/typography.css`·`/brand.css`)을 따르고, 본문 CSS는 `var(--font-sans)`·`var(--font-serif)`만 쓴다. `nav`는 문자열 치환으로 `aria-current="page"`를 제거해 쓴다. 모든 동적 값은 이스케이프 함수를 거친다. 날짜 표시는 "10월 22일 (목)" 형식, 시각은 `HH:MM KST`. `/js/site-nav.js` 모듈 스크립트를 마지막에 넣는다.
- [ ] **Step 4: 통과 확인.** → PASS. 추가로 `node --test tests/typography.test.mjs tests/design-system-consistency.test.mjs tests/korean-copy.test.mjs` → PASS.
- [ ] **Step 5: 커밋.** `git add lib/week-render.js lib/markets-render.js tests/week-calendar.test.mjs && git commit -m "Render the week calendar page and home summary JSON"`

---

### Task 5: 핸들러·라우트·사이트맵 연결

**Files:**
- Modify: `api/desk.js`, `vercel.json`, `lib/feeds.js`
- Test: `tests/week-calendar.test.mjs`

**Interfaces:**
- Consumes: `buildWeekView`, `readCalendarFiles`, `renderWeekPage`, `homeWeekJson`, `lawsEffectiveIn`, `fetchLawWatch`, `openlawConfigured`
- Produces: `makeWeekHandler({ now?: () => Date, loadFiles?: () => Promise<files>, fetchLaw?: (win) => Promise<LawInput> } = {})` — `api/desk.js`에서 export, `makeHandler`의 views에 `week`로 등록.
  - 기본 `fetchLaw`: `openlawConfigured()`가 아니면 `{status:'unavailable', items:[]}`. 읽기 실패(`ok:false`)도 `unavailable`. 일부 법령만 읽힌 경우(`errors.length > 0`)는 `partial:true`로 표시하되, 항목이 0건이면 `status:'empty'`로 두고 `partial:true`를 함께 넘긴다 (조립은 Task 2가 `partial`로 바꾼다).
  - 응답: 기본 `text/html; charset=utf-8`, `format=json`이면 `homeWeekJson`. GET/HEAD 외 405.

- [ ] **Step 1: 실패하는 테스트** (`tests/discoverability.test.mjs`의 `fakeRes` 형태를 이 테스트 파일에 복사해 쓴다):
  - 정상: 200, `cache-control`이 `s-maxage=3600` 포함, 본문에 항목 제목.
  - `fetchLaw`가 `unavailable`을 돌려줌: 200, `s-maxage=60`, 일정 칸은 정상 렌더 (Review Focus 4), 법령 칸에 "지금 확인할 수 없습니다".
  - `format=json`: `res.json(body)`로 `{from, to, isNextWeek, items}` 객체가 오고 `items.length <= 5`.
  - `loadFiles`가 예외를 던짐 → 500이 아니라 200 + "올해 일정이 아직 준비되지 않았습니다", `s-maxage=60`.
  - POST → 405.
  - `makeHandler()`가 `{ query: { view: 'week' } }`를 `week` 핸들러로 보낸다.
  - `STATIC_PAGES`에 `{ path: '/week' }` 포함, `buildSitemap` 결과에 `https://www.kkandfriends.com/week`.
  - `vercel.json`에 `{"source":"/week","destination":"/api/desk?view=week"}` 리라이트가 있고, `functions["api/desk.js"].includeFiles`가 `data/week-calendar/*.json`과 `fonts/Pretendard-*.otf`를 둘 다 가리킨다.
  - `robots.txt`에 `Disallow: /week`가 없다.
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.** `api/desk.js` 머리말 주석의 view 목록에 `/week -> view=week` 한 줄 추가. `vercel.json`: 리라이트를 `/markets/:slug` 근처에 추가, `includeFiles`는 `"{fonts/Pretendard-*.otf,data/week-calendar/*.json}"`로 바꾼다 (중괄호 glob 지원은 배포 미리보기에서 확인할 항목, 아래 Task 8). `lib/feeds.js`: `{ path: '/week', changefreq: 'weekly', priority: '0.7' }`.
- [ ] **Step 4: 통과 확인.** `node --test tests/week-calendar.test.mjs tests/discoverability.test.mjs` → PASS (discoverability의 `@resvg` 3건은 기준선 실패일 수 있다. Step 1 기록과 비교).
- [ ] **Step 5: 커밋.** `git add api/desk.js vercel.json lib/feeds.js tests/week-calendar.test.mjs && git commit -m "Serve /week from api/desk.js and list it in the sitemap"`

---

### Task 6: 홈 요약 띠

**Files:**
- Modify: `index.html` (`.ih-series` 닫는 태그 뒤, `.ih-latest` 앞에 띠 추가. CSS는 기존 `.insights-hub` 스타일 블록 안. 로더 스크립트는 `loadLatestInsights` 스크립트 다음)
- Test: `tests/week-calendar.test.mjs`

**Interfaces:**
- Consumes: `GET /api/desk?view=week&format=json` → `homeWeekJson` 모양

- [ ] **Step 1: 실패하는 테스트** (`readFile`로 `index.html`을 읽는 기존 방식, `tests/home-lounge-card.test.mjs` 참고):
  - `id="home-week"`인 요소가 `hidden` 속성으로 시작하고 `href="/week"` 링크를 가진다.
  - 로더가 `/api/desk?view=week&format=json`을 부르고, 목록 채우기에 `textContent`를 쓰며 그 스크립트 구간에 `innerHTML`이 없다.
  - 실패·빈 목록이면 `hidden`을 유지하는 분기가 있다 (`items.length` 검사 문자열).
  - `.ih-series`는 여전히 3열(`repeat(3,1fr)`)이고 카드 3개 (기존 `home-lounge-card` 테스트가 그대로 통과).
  - 700~820px 이하 미디어쿼리에서 띠가 1열이다.
- [ ] **Step 2: 실패 확인.** → FAIL.
- [ ] **Step 3: 구현.** 띠 제목은 일정 응답의 `isNextWeek`로 "다음 주 체크 포인트" / "이번 주 체크 포인트"를 정하고, 각 줄은 `10/22(목) 09:00 · 제목`, 맨 아래 "전체 일정 보기 →" 링크. 색·간격은 기존 `.ih-series-card` 규칙을 따른다. `[hidden]` 일 때 `display:none`이 이기도록 CSS에 명시한다.
- [ ] **Step 4: 통과 확인.** `node --test tests/week-calendar.test.mjs tests/home-lounge-card.test.mjs tests/content-consistency.test.mjs tests/korean-copy.test.mjs` → PASS. (puppeteer 기반 `performance`·`mobile-responsive`는 `npm ci` 성공 시 전체 `npm test`에서 확인)
- [ ] **Step 5: 커밋.** `git add index.html tests/week-calendar.test.mjs && git commit -m "Add the home week summary band"`

---

### Task 7: 초기 일정 파일과 운영 기록

**Files:**
- Create: `data/week-calendar/2026.json`
- Modify: `CLAUDE.md` (신규 단락 「이번 주 체크 포인트 (2026-10-22 KK 결정)」)
- Test: `tests/week-calendar.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `validateItem`, Task 2의 `loadWeekItems`

- [ ] **Step 1: 실패하는 테스트:** `data/week-calendar/*.json` 전체를 읽어 `rejected`가 비어 있고 id 중복이 없다 (파일이 바뀔 때마다 CI가 검증). 파일명 연도와 `year` 필드가 같다.
- [ ] **Step 2: 실패 확인.** 파일이 없으므로 FAIL.
- [ ] **Step 3: 공식 달력 확인.** 아래 네 곳을 `curl`(프록시 경유, `$HTTPS_PROXY`)로 직접 읽어 2026-11~12월 항목을 찾는다: 한국은행 금융통화위원회 개최 일정, 통계청 주요 지표 공표 일정, Fed FOMC 달력, BLS 발표 일정. 접근되고 날짜가 본문에서 확인된 항목만 `data/week-calendar/2026.json`에 넣는다 (`verifiedAt: 2026-10-22`, 출처 이름·주소). **확인하지 못한 항목은 넣지 않는다.** 4곳 모두 막히면 `{"year":2026,"items":[]}`로 두고 아래 보고에 그대로 적는다 (이 경우 화면은 "아직 준비되지 않았습니다"로 정직하게 나온다).
- [ ] **Step 4: 통과 확인.** → PASS.
- [ ] **Step 5: 문서.** `CLAUDE.md`에 한 단락: 파일 위치, 검증 규칙(출처·확인일 필수), 관리 절차(Claude 초안 → KK 승인 PR, 확인 못 한 항목 제외 후 PR 설명에 목록), 12월에 다음 해 파일 준비, `OPENLAW_OC`가 Vercel에도 필요, Vercel cron 쓰지 않음.
- [ ] **Step 6: 커밋.** `git add data/week-calendar CLAUDE.md tests/week-calendar.test.mjs && git commit -m "Seed the 2026 week calendar and document the routine"`

---

### Task 8: 통합 확인

**Files:** 변경 없음 (결과 보고만)

- [ ] **Step 1: 전체 테스트.** `npm test` → Task 1 Step 1 기준선과 비교. 새 실패 0건이어야 한다. 기준선 실패가 남아 있으면 이름을 그대로 보고한다.
- [ ] **Step 2: 로컬 렌더 확인.** `makeWeekHandler()`에 가짜 `fetchLaw`를 넣어 호출한 HTML을 스크래치패드에 저장하고, 설치된 Chromium(Playwright, `executablePath: '/opt/pw-browsers/chromium'`)으로 폭 375px·1280px에서 열어 `document.documentElement.scrollWidth <= innerWidth`(가로 스크롤 없음)와 콘솔 오류 0건을 확인한다. 이 컨테이너에서 Chromium이 안 열리면 그 사실을 보고한다.
- [ ] **Step 3: 푸시.** `git push -u origin claude/lucid-gauss-6uq8hu` (네트워크 오류 시에만 2·4·8·16초 간격 재시도).
- [ ] **Step 4: KK에게 보고할 배포 후 확인 항목** (이 컨테이너에서는 검증할 수 없다고 명시): ① Vercel에 `OPENLAW_OC` 등록 여부 ② `includeFiles` 중괄호 glob이 일정 파일을 함수에 싣는지 (미리보기 `/week`에 항목이 나오는지) ③ Vercel에서 OpenLaw HTTPS가 되는지 (안 되면 법령 칸이 "확인할 수 없습니다"로 나오며, 이때 `OPENLAW_BASE` 필요 여부 판단) ④ LinkedIn 등 미리보기는 이번 범위 밖.
