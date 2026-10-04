# Editorial Desk

> 2026-10-04 갱신. 요일별 Desk 초안은 **두 트랙**이 따로 만든다. 둘 다 초안까지만 만들고, 발행은 Chief가 `/admin-editorial`에서 한다.
> 사람이 직접 쓰는 KK Daily·Weekly(`/write-desk`)는 별개다 — `CLAUDE.md`의 "KK Daily · KK Weekly · KK ORIGINAL" 참조.

## 두 트랙 한눈에

| | A. VPS Desk (자동 파이프라인) | B. Claude Code 루틴 「kkandfriends - 월~일 리포트」 |
|---|---|---|
| 실행 위치 | VPS `/opt/kk-editorial` Docker cron | Claude Code Routine (claude.ai, 매 실행 새 세션) |
| 시간 (KST) | 06:00 수집 → 06:30 순위 → 07:00 리서치 → 07:30 작성 → 08:00 검수·알림, 08:10 복구 | 매일 09:10 (`CRON_TZ=Asia/Seoul 10 9 * * *`) |
| 글쓰기 모델 | OpenRouter, `DESK_*_MODEL` 4개 (VPS `.env`) | Claude (루틴 설정 모델) + 독립 검수 보조 에이전트 |
| 형식 | 고정 소제목 (Daily 6개 / Weekly 9개), Daily 800~1,200자 · Weekly 1,600~4,000자 | 소제목 없는 자유 본문, Daily 300~1,000자 · Weekly 600~6,000자 |
| 결과 | 승인 대기열(`editorial_drafts`)에 자동 등록 | 초안 파일 + 폰 알림. 대기열 등록은 현재 안 됨 (아래 "알려진 문제") |
| 텔레그램 | `[KK EDITORIAL DESK] MACRO MONDAY` + 제목 + "후보 선정과 초안 검수가 끝났습니다." | `[Desk·Mon ✓] YYYY-MM-DD · 상태 · 제목` 한 줄 |
| 수정하는 곳 | 레포 `research-lab/` → VPS 이미지 재빌드 | claude.ai Routines 에서 프롬프트 수정 (레포 수정만으로는 안 바뀜) |

요일 매핑은 두 트랙이 같다: 월 MACRO MONDAY · 화 MARKETS TUESDAY · 수 BITCOIN WEDNESDAY · 목 AI THURSDAY · 금 SIGNAL FRIDAY · 토 KOREA SATURDAY · 일 KK WEEKLY (`research-lab/src/desk/core.js` `DESKS`).

---

## B. Claude Code 루틴 「kkandfriends - 월~일 리포트」

- Routine ID `trig_01LgAu7GvqNcJTQwoCSFAZLt`, 2026-09-29 생성, 마지막 수정 2026-10-04.
- **원본은 claude.ai의 루틴 프롬프트다.** 이 문서는 요약이며, 루틴 프롬프트를 고치면 여기도 맞춰 고친다.
  프롬프트가 언급하는 레포 사본 `ops/desk-routine/ROUTINE_PROMPT.md`는 레포에 존재하지 않는다 (2026-10-04 확인).
- 권한: 발행·커밋·푸시·VPS 설정 변경 없음. 결과는 최종 메시지, `YYYY-MM-DD-<desk>-draft.md` 파일(SendUserFile), KK 개인 텔레그램 한 줄.

### 실행 순서

1. KST 날짜 확정 → 요일 Desk 선택.
2. 레포를 받아 규칙 원문을 읽는다: `CLAUDE.md`, `research-lab/src/desk/stages.js`, `core.js`, `research-lab/config/desk-feeds.json`, `desk-source-policy.json`.
3. 네트워크 사전 점검: 원자료 사이트 하나와 `https://www.kkandfriends.com/api/desk`. 둘 다 막히면 `근거 부족`으로 즉시 종료(텔레그램은 보냄).
4. 중복 확인: `/api/desk`(발행된 Desk 최신 100편)와 `posts/`.
5. **A. 수집·후보** — 후보 0~5개. 같은 논제를 직접 뒷받침하는 독립 출처 2개 이상, 그중 원자료 1개 이상.
   점수 = 10 × (0.35 영향 + 0.30 구조 + 0.15 새로움 + 0.20 독자 관련성). 70점 미만·원자료 없음·중복·이해상충은 제외.
6. **B. 리서치** — 핵심 증거 2~15개, 각 증거에 원문 그대로 발췌(15~300자)·출처 ID·기준일·단위. 반론 1개와 관찰 지표.
7. **C. 작성** (2026-10-02 KK 기준, `/write-desk` 자유 형식) — 제목 160자 이내, 요약 400자 이내, 소제목 없는 본문.
   출처는 `제목 | https://주소` 한 줄씩. 면책 문구 "공개 자료에 기반한 시장 관점이며 개별 투자 권유가 아닙니다."는 원고 맨 아래에만(글자 수·제출 내용 제외).
8. **C-2. 문체** — kk-humanizer 스킬. Desk는 합쇼체 뉴스형이라 루틴 규칙이 스킬 §0보다 우선. 줄표 금지.
   숫자·인용·URL·해석/반론 문장·면책 문구는 바꾸지 않는다. 다듬기 전후 숫자 diff로 확인.
9. **D. 독립 검수** — D-1 `validateContent` 기계 검증, D-2 보조 에이전트가 원문을 직접 열어 대조. 교정은 최대 2회.
   둘 다 통과 → `승인대기`, 아니면 `초안`.
10. **E. 승인 대기열 제출** — `POST https://api.kkandfriends.com/api/routine/editorial` + `EDITORIAL_ROUTINE_TOKEN`. (현재 작동하지 않음, 아래 참조)
11. 결과물 7항목 + JSON 계약 블록 + 텔레그램 한 줄.

### 요일별 지침 요약

- **월 Macro / 화 Markets / 토 Korea** — 그 분야 자체에 중요한 변화 하나. 중요해 보이게 하려고 다른 분야와 엮지 않는다. 화요일은 가격 변화에서 원인을 단정하지 않는다.
- **수 Bitcoin** — Bitcoin 고유의 변화. 원고 하단에 "필자는 디지털 자산 관련 상장사에 재직 중입니다" 공개 문구.
- **목 AI** — 일반 독자에게 가장 중요한 AI 변화. 금융 관련성은 점수에 넣지 않는다.
- **금 Signal** — Google News에서 실제 측정한 보도 관심 모멘텀(헤드라인 수·매체 다양성·최신성). 보도량으로 투자심리·인과를 추정하지 않는다.
- **일 KK Weekly** — 이번 주 뉴스 관심과 소셜 관심 양쪽에 나온 논쟁 하나. 이번 주 **발행된** Desk 3편 이상을 `/desk/<slug>`로 읽는다. 3편 미만이면 `근거 부족`.

### 알려진 문제 (2026-10-04 확인)

1. **E 단계 제출 경로가 없다.** `/api/routine/editorial` 엔드포인트와 `EDITORIAL_ROUTINE_TOKEN`은 레포 어디에도 구현된 적이 없다 (VPS API에는 `/api/v1/editorial`, `/api/internal/editorial`만 있음).
   10/4 실행도 "제출 생략 — 토큰 미설정"으로 끝났다. 지금은 루틴 초안이 관리 화면에 올라가지 않는다.
2. **같은 날짜 초안은 하나만** 들어간다 (ID `날짜-요일데스크`). 트랙 A가 08:00에 먼저 등록하므로, 제출 경로가 생겨도 09:10 루틴은 409(이미 있음)가 정상이다.
   10/4에는 트랙 A의 `2026-10-04-weekly`가 이미 있어 루틴 초안과 주제가 달랐다.
3. **D-1 검증과 C 형식이 맞지 않는다.** `validateContent`는 트랙 A의 고정 소제목·800~1,200자 기준이다. 루틴 C는 자유 형식 300~1,000자다.
   자유 형식 검증은 VPS API `server/src/routes/editorial.js`의 `FREE_LENGTH` / `validateFreeContent` 쪽에 있다.
4. 소셜 관심 수집(Reddit·X)은 루틴 세션에서 막히는 경우가 있다. 10/4에는 Hacker News로 대체했다.

→ 두 트랙을 계속 같이 돌릴지, 하나로 합칠지는 KK 결정 사항이다.

---

## A. VPS Desk (자동 파이프라인)

### 운영

- 관리 화면: `/admin-editorial` (Chief 세션 로그인). 공개 글: `/desk`, `/desk/:slug`. THOUGHTS에 시리즈·토픽 필터가 따로 있다.
- 단계 5개가 서로 독립된 cron이다 (`research-lab/deploy/desk.cron`, 시간은 UTC로 적혀 있음 — KST에서 9시간 뺀 값).
  06:00 scan · 06:30 rank · 07:00 research · 07:30 write · 08:00 edit·알림. Windows 예약 작업은 없다.
- 일시적 메모리·DB 읽기 실패는 3회 재시도. 앞 단계 체크포인트가 없으면 뒤 단계는 오류를 반복하지 않고 기다린다.
  08:10 복구 작업(`recover.mjs`)이 빠진 첫 단계부터 이어 가고, 필요하면 텔레그램을 재발송하며, 끝내 실패하면 실패 알림 한 번.
- 1순위 후보가 편집자 지적 반영 재작성 후에도 실패하면, 적격 후보 다음 2개를 새로 리서치·작성·검수한다. 저장된 순위에 대안이 없으면 탈락 주제를 뺀 새 순위를 한 번 더 매긴다.
- 모델 응답 JSON이 깨지면 같은 스키마로 1회 재시도.
- 목요일 AI 수집은 Google DeepMind·Microsoft Research·OpenAI 공식 피드 포함. 토요일 Korea는 금융위원회 보도자료와 Google News 한국 신호 추가 — 신호는 주제 선정에만 쓰고 사실 근거로 쓰지 않는다.
- 토요일 20:00 KST, 월요일 이후 **발행된** Desk가 3편 미만이면 일요일 전에 텔레그램 경고 한 번 (`weekly-readiness.mjs`). 자동 발행은 하지 않는다.
- 08:00 편집 단계가 최종 검증·제출 직전에 DB 리스를 잡는다. 앞 단계가 실패하면 발행 가능한 초안은 남지 않고 짧은 실패 알림이 간다.
- 승인·발행은 Chief만 한다. 수정하면 승인이 풀린다. 발행된 글은 v1에서 변경 불가.

### 텔레그램 문구 수정 위치

- 성공 알림: `research-lab/bin/stage-desk.js`(편집 단계)와 `research-lab/deploy/recover.mjs`(복구 경로) — **두 곳 모두** 고쳐야 한다.
- 단계 중단·복구 실패·주간 경고: 같은 두 파일과 `weekly-readiness.mjs`.

### 출처·품질 기준

- 수집 피드: `research-lab/config/desk-feeds.json`. 허용 도메인: `desk-source-policy.json`.
  2026-09-08 첫 점검: 피드 항목 105개, 최근·중복 제거 원문 34개. BIS URL 하나가 404라 꺼 두었고 교체 추적용으로 설정에 남겨 두었다. 기업 보도자료는 그 회사의 주장 근거일 뿐, 전망의 독립 증거가 아니다.
- 후보 점수: 시장 영향 35% · 구조적 중요성 30% · 새로움 15% · 독자 관련성 20%. 70점 미만, 원자료·독립 출처 없음, 중복, 이해상충은 보류.
  출처 날짜는 14일 이내. 인용문 일치는 출처 확인일 뿐 사실 정확성 보증이 아니다. 편집 모델 검수 후 사람 검토 필수.
- 분량: Daily 800~1,200자(공백 포함), Weekly 1,600~4,000자. 고정 소제목(`DAILY_SECTIONS` 6개, `WEEKLY_SECTIONS` 9개, `core.js`).
- 금요일은 **보도 관심 모멘텀**이지 소셜 심리가 아니다. Google News RSS(매크로·시장·Bitcoin·AI)를 묶어 헤드라인 수·매체 다양성·최신성으로 최대 15개 신호를 고른다. `DESK_SIGNALS_FILE`로 RSS 신호 추가 가능.
- 일요일은 월~토 **발행된** Desk 3편 이상이 필요하다. 미승인 초안은 KK 견해로 인용하지 않는다.

### 저장·보안 (2026-09-25 Supabase → VPS PostgreSQL 전환 이후)

- 데이터 경로: VPS Desk 컨테이너 → Vercel `/api/editorial-worker` (`EDITORIAL_WORKER_TOKEN`) → `api.kkandfriends.com/api/internal/editorial` (`EDITORIAL_INTERNAL_TOKEN`) → VPS PostgreSQL.
- 테이블: `editorial_runs`, `editorial_drafts`, `editorial_events`. 쓰기 함수: `editorial_claim`, `editorial_finish`, `editorial_transition`.
  90분 시도 리스로 오래된 워커를 막고, KST 날짜당 에디션 하나로 중복을 막는다. 모든 수정본은 events에 남는다.
- 마이그레이션 원본: `db/migrations/015_editorial_desk.sql`, `016_editorial_stage_lease.sql` (Supabase 시절 기록).
- 워커는 초안 제출과 발행된 글 읽기만 한다. 승인·발행·회원 데이터 접근 불가.
- Vercel 환경 변수: `EDITORIAL_WORKER_TOKEN`, `EDITORIAL_INTERNAL_TOKEN`, `EDITORIAL_PUBLISH_ENABLED=true`(Chief의 발행 버튼만 활성화, 자동 발행 아님).
- VPS `.env` (root 전용, 이미지·Git에 넣지 않음): `EDITORIAL_WORKER_TOKEN`, `EDITORIAL_SITE_URL`, `OPENROUTER_API_KEY`, `DESK_DISCOVERY_MODEL`·`DESK_RESEARCH_MODEL`·`DESK_WRITER_MODEL`·`DESK_EDITOR_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Google News는 키 불필요.

### 검증·배포

- 2026-09-09 실전 검증: 원문 31개, 후보 5개, 선정 점수 85.5, 928자 초안 기계 검증 통과, 편집 검수 통과, 텔레그램 성공, 승인 대기 저장.
- 테스트 (레포 루트): `node --test research-lab/test/*.test.js`.
  실제 PostgreSQL 트랜잭션 테스트: `PGLITE_MODULE`에 `@electric-sql/pglite/dist/index.js` 경로를 넣고 `node research-lab/test/desk-sql.integration.mjs`. 운영 DB는 쓰지 않는다.
- 이미지 빌드 (레포 루트): `docker build -t kk-editorial:VERSION -f research-lab/deploy/Dockerfile .` — compose 정의는 `research-lab/deploy/compose.yaml`.
- **레포 merge만으로는 반영되지 않는다.** VPS에는 git 사본이 없으므로 GitHub tarball을 받아 `/opt/kk-editorial`에서 이미지를 다시 빌드·재시작한다 (명령은 에이전트가 만들고 KK가 붙여넣는다). 모델만 바꿀 때는 `.env` 수정 후 재시작.
- 롤백: Desk 컨테이너 정지, 또는 `EDITORIAL_PUBLISH_ENABLED=false`로 Vercel 재배포. 편집 테이블·이벤트는 지우지 않는다.

### 점검 항목

성공·보류 건수, 출처 실패, 사람 교정량, 주제 중복을 runs/events에서 확인한다. OpenRouter 비용은 따로 본다. 08:00 완료는 목표이지 보장이 아니다. 테스트 통과를 근거로 자동 발행을 켜지 않는다.
