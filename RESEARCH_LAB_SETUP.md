# 리서치랩 세팅 (주 2회 주제 선정)

주 2회(화·금 08:00 KST) 자동으로 시장을 훑고, 후보 주제 3개를 만들고, 루브릭으로 채점하고,
1등이 기준을 넘으면 집필 가이드까지 써서 **KK 승인을 기다린다.**
승인 전에는 아무것도 발송되지 않는다.

규칙 자체는 `RESEARCH_PROMPT.md`에 있고, 봇이 **실행 시점에 그 파일을 읽는다.**
문서를 고치면 봇 동작이 바뀐다 — 코드를 만질 필요가 없다.
숫자·목록(이해상충 필터, 모델 체인, 화이트리스트, 가중치)은 `research-config.json`에 있다.

---

## 1. DB 마이그레이션 (한 번만)

Supabase → SQL Editor → New query → `db/migrations/015_research_lab.sql` 전체 붙여넣기 → Run.

`Success. No rows returned` 이 나오면 된 것이다. `research_runs` 테이블 하나가 생긴다.

---

## 2. 환경변수 (Vercel → Settings → Environment Variables)

**Production 환경에 설정해야 한다.** Preview에만 넣으면 크론이 못 읽는다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 이미 있음 (다른 크론과 공유) |
| `CRON_SECRET` | ✅ | 이미 있음 (다른 크론과 공유) |
| `ANTHROPIC_API_KEY` | ✅ *(택1)* | Anthropic 직접 키 |
| `AI_GATEWAY_API_KEY` | ✅ *(택1)* | Vercel AI Gateway 경유 |
| `GEMINI_API_KEY` | — | 모델 체인을 `gemini-*`로 바꿀 때만 |
| `TELEGRAM_BOT_TOKEN` | ✅ | 이미 있음 (기존 봇 공유) |
| `TELEGRAM_CHAT_ID` | ✅ | **KK 개인 채팅.** 승인 요청이 여기로 온다 |
| `RESEARCH_TELEGRAM_CHAT_ID` | — | 리서치만 다른 채팅으로 받고 싶을 때 |
| `SITE_URL` | — | 승인 링크를 만드는 데 쓴다. 기본값 `https://www.kkandfriends.com` |
| `RESEARCH_MODEL` | — | 모델 체인 덮어쓰기. 쉼표 구분, 앞에서부터 시도 |
| `RESEARCH_SCAN_MODEL` | — | 1단계(웹검색) 전용 모델 덮어쓰기 |

> **모델 키가 왜 Anthropic이냐:** `research-config.json`의 체인이 `claude-opus-5 → claude-sonnet-5`다.
> 무료로 돌리고 싶으면 Vercel에 `RESEARCH_MODEL=gemini-3.6-flash,gemini-3.5-flash`,
> `RESEARCH_SCAN_MODEL=gemini-3.6-flash`를 넣고 `GEMINI_API_KEY`만 있으면 된다.
> 코드는 모델 ID 앞부분을 보고 알아서 라우팅한다.
>
> **매일 브리핑과 다른 점:** 데일리 브리핑은 `GEMINI_API_KEY`가 있으면 무조건 Gemini를 쓴다.
> 리서치랩은 설정 파일의 체인을 따른다 — 채점 품질이 걸린 작업이라 모델을 우연히 정하지 않게 했다.

**환경변수를 추가·수정한 뒤에는 반드시 재배포해야 반영된다.**
Vercel → Deployments → 최신 배포 우측 `⋯` → Redeploy.

---

## 3. 동작 확인

브라우저에서 (`<secret>`는 `CRON_SECRET` 값):

```
https://www.kkandfriends.com/api/cron/research-lab?key=<secret>&dry=1
```

`dry=1`은 **DB에 쓰지 않고 텔레그램도 보내지 않는다.** 모델만 돌려서 결과를 JSON으로 보여준다.
확인할 것:

- `"held": false` — 1등이 6.0을 넘었다
- `ranked[].scores` — 지표별 점수
- `ranked[].adjustments` — 코드가 보정한 내역 (근거 상한, 최신성 등)
- `summaryChars` — 2,800 이하여야 정상
- `recentTitles` — 최근 발행분이 잡혔는지. **여기가 비어 있으면 중복 방지가 작동하지 않는다**
- `report` — 옵시디언에 그대로 넣을 전문

실제로 한 번 돌려보려면 `&force=1` (주말·중복 실행 가드를 무시한다).
`force=1`은 **진짜로 발송하고 DB에 쓴다.**

---

## 4. 승인 흐름

1. 08:00 KST, 크론이 돈다.
2. 리포트 전문이 **먼저 DB에 저장된다.** (`research_runs.report_md`)
3. KK 텔레그램으로 승인 요청 + 전문 `.md` 첨부가 온다. 버튼 두 개: **✅ 승인 / ✖️ 반려**
4. 버튼을 누르면 브라우저가 열리고 처리 결과 페이지가 뜬다.
   - **승인** → 요약 + 전문 `.md` 발송
   - **반려** → 아무것도 안 보냄. 전문은 그대로 보관
5. 3시간 무응답 → 리마인더 **1회**
6. 6시간 무응답 → 자동 마감. **발송하지 않고 보관만 한다.** 침묵이 발행이 되는 일은 없다.

> **버튼이 왜 URL이냐:** 텔레그램 콜백 버튼을 쓰려면 webhook을 등록해야 하고, 봇 토큰을 갈면
> 조용히 멈춘다. URL 버튼은 등록할 게 없다. 링크 안의 토큰(128비트, 1회용)이 권한이고,
> 링크는 KK 개인 채팅에만 나타난다. 한 번 쓰면 무효가 된다.

보류(임계값 미달)일 때는 승인 절차 없이 "오늘 발행 보류" 메시지만 온다. 발행할 게 없으니 승인할 것도 없다.

---

## 5. 크론

`vercel.json`에 이미 들어 있다.

| 경로 | cron (UTC) | 실제 (KST) |
|---|---|---|
| `/api/cron/research-lab` | `0 23 * * 1,4` | **화·금 08:00** |
| `/api/cron/research-followup` | `0 * * * *` | 매시 (리마인더·마감 처리) |

> ⚠️ **UTC 요일과 KST 요일은 하루 어긋난다.** UTC 월·목 23:00 = KST 화·금 08:00.
> 저녁·심야 cron의 요일 지정은 반드시 UTC로 환산해서 쓸 것. 이걸 틀리면 하루 밀려서 돈다.
>
> `research-config.json`의 `schedule.cron_utc`도 같은 값이어야 한다. 한쪽만 고치면
> 문서와 실제가 갈라진다 — `vercel.json`이 실제로 실행되는 쪽이다.

Vercel Hobby 플랜은 크론 정밀도가 "시간 단위"라 정확히 08:00에 안 올 수 있다. Pro는 정시에 온다.

---

## 6. 자주 만지게 될 것들

### 이해상충 배제 목록 — **역할이 바뀌면 즉시**

`research-config.json` → `kk_roles`, `conflict_filter`.
배제 항목마다 `role`이 붙어 있으니, 그만둔 자리 이름으로 검색해서 해당 항목을 지우면 된다.
지운 기록은 `retired_roles`에 남긴다 (강제력 없음, 나중에 왜 없는지 헷갈리지 않게).

### 발행 주기를 바꿀 때

`schedule`만 고치면 안 된다. **`recency_scale`과 세트다.**
지금은 주 2회 기준(3일 내 10점)이다. 일간으로 바꾸면 더 촘촘하게(1~2일=10),
주간으로 바꾸면 느슨하게(7일 내=10) 함께 조정해야 채점이 말이 된다.
그리고 `vercel.json`의 cron도 같이 고쳐야 한다.

### 가중치

`weights`의 합이 정확히 1이 아니면 **봇이 실행을 거부한다.** 하나를 올리면 다른 하나를 내려야 한다.

### 화이트리스트

`whitelist`. 이 목록은 장식이 아니다 — 목록 밖 소스로만 뒷받침되는 후보는 근거 점수가 5점으로 잘린다.
분기마다 한 번 훑고 `whitelist_reviewed` 날짜를 갱신할 것.

---

## 7. 안 될 때

| 증상 | 원인 |
|---|---|
| `{"ok":false,"error":"unauthorized"}` | `key=` 값이 `CRON_SECRET`과 다름. 환경변수 바꾼 뒤 재배포 안 했을 수도 |
| `설정 오류 — 실행하지 않음` 알림 | `research-config.json`이 검증에 걸렸다. 알림 본문에 어느 항목인지 나온다 |
| `no usable model in chain` | 체인의 모델에 맞는 API 키가 없다. 알림에 모델별 실패 사유가 다 찍힌다 |
| `RESEARCH_PROMPT.md not found` | `vercel.json`의 `includeFiles`가 안 먹었다. 함수 번들에 문서가 안 들어간 것 |
| `recentTitles`가 비어 있음 | 중복 방지가 무력화된 상태. `posts/**` 번들 또는 `member_posts` 조회 확인 |
| 승인 버튼이 "만료된 링크" | 이미 처리됐거나 6시간 마감이 지났다. 전문은 `research_runs`에 남아 있다 |
| 텔레그램이 안 옴 | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` 미설정. 리포트는 저장됐으니 DB에서 꺼내면 된다 |

승인 못 받고 마감된 리포트 꺼내기 — Supabase SQL Editor:

```sql
select run_date, status, winner_title, winner_score, report_md
from research_runs
order by run_date desc
limit 10;
```

---

## 8. 파일

| 파일 | 역할 |
|---|---|
| `RESEARCH_PROMPT.md` | 편집 규칙 원본. 봇이 `=== PROMPT END ===`까지 실행 시점에 읽는다 |
| `research-config.json` | 필터·모델·화이트리스트·가중치·일정 |
| `lib/research-config.js` | 설정 로드·검증 + 가중합·순위·임계값 (모델이 아니라 코드가 계산) |
| `lib/research-llm.js` | 모델 체인 호출, 폴백, JSON 추출 |
| `lib/research-report.js` | 옵시디언 리포트 / 텔레그램 요약 렌더링 |
| `lib/telegram.js` | 발송·분할·문서 첨부 |
| `api/cron/research-lab.js` | 본 실행 |
| `api/cron/research-followup.js` | 리마인더·마감 |
| `api/research-decide.js` | 승인/반려 버튼이 도착하는 곳 |
| `db/migrations/015_research_lab.sql` | `research_runs` 원장 |
