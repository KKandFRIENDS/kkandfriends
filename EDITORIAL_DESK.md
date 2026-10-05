# Editorial Desk

> 2026-10-04 KK 결정: 요일별 자동 초안은 **VPS Desk 하나로 합친다.** Claude Code 루틴 「kkandfriends - 월~일 리포트」는 꺼 두었다(삭제 아님, claude.ai Routines에서 다시 켤 수 있음).
> 목표: 일반 독자가 읽기 쉬운 글이 요일 주제에 맞게 매일 아침 `/admin-editorial`에 올라와 있고, Chief는 읽고 고친 뒤 발행만 누른다.

## 지금 흐름 (코드 기준, VPS 재빌드 후 적용)

1. 06:00~08:00 KST, VPS `/opt/kk-editorial` 컨테이너가 수집 → 후보 순위 → 리서치 → 작성 → 검수를 돈다.
2. 초안은 `/write-desk`가 만드는 것과 **같은 자유 형식**이다: 제목 · 요약 · 소제목 없는 본문 · 출처.
   Daily(월~토) 300~1,000자(목표 600~900), Weekly(일) 600~6,000자(목표 1,500~3,000). Weekly는 그 주 발행된 Daily를 "이번 주 Daily" 링크로 붙인다.
3. 작성 단계에서 **풀어쓰기 규칙**(약자 첫 등장 시 풀이, 용어 대신 동작으로, 퍼센트보다 개수 먼저, "예를 들어" 일상 예시 최대 1개)을 지시한다.
4. 작성 직후 **humanizer 스킬**(`.claude/skills/humanizer/SKILL.md`)로 문체를 다듬는다 (`stages.js` `humanizeDesk`).
   숫자·인용문이 바뀌거나, 줄표가 남거나, 길이·금요일 규칙을 깨거나, 모델이 실패하면 다듬기 전 원고를 그대로 쓰고 사유를 남긴다.
5. 편집 모델이 다듬어진 최종본을 원문 근거와 대조한다. 지적이 있으면 한 번 고쳐 쓰고(다시 humanizer) 재검수, 그래도 안 되면 다음 후보.
6. 통과하면 승인 대기열(`editorial_drafts`)에 저장되고 텔레그램이 온다:
   `[KK Daily 자동 초안] MACRO MONDAY` / 제목 · 본문 글자 수 / 문체 다듬기 적용 여부 / `검토 후 발행: …/admin-editorial?id=YYYY-MM-DD-macro`
7. Chief가 링크를 열어 읽고, 필요하면 고쳐 저장하고, 확인란 체크 → 승인 → 발행.

같은 날짜 초안은 하나뿐이다. 자동 초안이 있는 날 `/write-desk`로 새로 쓰면 막히므로, 그날은 `/admin-editorial`에서 자동 초안을 고친다.

## 비용

- VPS Desk: OpenRouter 모델 4개(`DESK_*_MODEL`, VPS `.env`) + humanizer 1회. humanizer는 작성 모델을 그대로 쓴다(새 설정 없음).
  모델별 단가는 VPS `.env` 값을 확인해야 알 수 있다 — **확인 필요**. 참고로 같은 VPS의 라운지 브리핑(DeepSeek flash 계열)은 편당 약 $0.001이다.
- 꺼 둔 Claude Code 루틴: 10/4 일요일 실행 1회가 표시 가격 기준 약 $1.33(Sonnet 5.5 + Haiku 4.5)이었다. 매일 돌면 월 약 $40 수준.
- 비용을 더 줄이려면 `DESK_*_MODEL` 4개를 브리핑과 같은 저가 모델로 맞추는 것이 가장 크다. 바꾼 뒤 1주일 동안 보류(holding)·편집 실패 건수를 본다.

## 수정하는 곳

| 바꾸고 싶은 것 | 파일 |
|---|---|
| 실행 시간 | `research-lab/deploy/desk.cron` (UTC로 적혀 있음, KST−9시간) |
| 요일별 주제 | `research-lab/src/desk/core.js` `DESKS`, 주제 지침은 `stages.js` `editorialFocus` |
| 풀어쓰기·문체 지시 | `stages.js` `PLAIN_KOREAN`, humanizer 지시는 `humanizeDesk` |
| humanizer 규칙 자체 | `.claude/skills/humanizer/SKILL.md` (이미지에 복사됨) |
| 분량 | `core.js` `FREE_LENGTH` + `server/src/routes/editorial.js` `FREE_LENGTH` + `js/desk-editor.js` `rangeFor` (세 곳을 같이) |
| 텔레그램 문구 | `research-lab/src/desk/notify.js` `draftReadyMessage` |
| 뉴스 출처 | `research-lab/config/desk-feeds.json`, `desk-source-policy.json` |
| 모델 | VPS `.env`의 `DESK_*_MODEL` (재빌드 없이 재시작만) |

**반영 순서:** 레포 merge(→ Vercel의 `/api/editorial-worker`가 자유 형식을 받게 됨) → 그다음 VPS에서 Desk 이미지 재빌드.
순서를 거꾸로 하면 새 VPS가 보낸 자유 형식 초안을 옛 Vercel 코드가 거절한다. API 서버(`/opt/kkf-community-staging`)는 이미 자유 형식을 받으므로 재배포가 필요 없다.

## 꺼 둔 루틴 기록 (B. 「kkandfriends - 월~일 리포트」)

- Routine ID `trig_01LgAu7GvqNcJTQwoCSFAZLt`, 매일 09:10 KST, 2026-10-04 비활성화.
- 꺼진 이유: ① 초안을 관리 화면에 올리는 경로(`/api/routine/editorial`, `EDITORIAL_ROUTINE_TOKEN`)가 구현된 적이 없어 결과가 파일로만 남았다.
  ② 같은 날짜 초안은 하나뿐이라 VPS Desk와 겹쳤다. ③ 실행당 비용이 VPS보다 크다.
- 이 루틴에만 있던 장점(보조 에이전트의 원문 대조 검수, 자유 형식, 풀어쓰기, humanizer)은 자유 형식·풀어쓰기·humanizer를 VPS Desk로 옮겼다.
  원문 대조는 VPS의 인용문 일치 검사 + 편집 모델 검수가 맡는다.

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

- 성공 알림: `research-lab/src/desk/notify.js` `draftReadyMessage` 한 곳(편집 단계와 08:10 복구 경로가 같이 씀).
- 단계 중단·복구 실패·주간 경고: `research-lab/bin/stage-desk.js`, `research-lab/deploy/recover.mjs`, `weekly-readiness.mjs`.

### 출처·품질 기준

- 수집 피드: `research-lab/config/desk-feeds.json`. 허용 도메인: `desk-source-policy.json`.
  2026-09-08 첫 점검: 피드 항목 105개, 최근·중복 제거 원문 34개. BIS URL 하나가 404라 꺼 두었고 교체 추적용으로 설정에 남겨 두었다. 기업 보도자료는 그 회사의 주장 근거일 뿐, 전망의 독립 증거가 아니다.
- 후보 점수: 시장 영향 35% · 구조적 중요성 30% · 새로움 15% · 독자 관련성 20%. 70점 미만, 원자료·독립 출처 없음, 중복, 이해상충은 보류.
  출처 날짜는 14일 이내. 인용문 일치는 출처 확인일 뿐 사실 정확성 보증이 아니다. 편집 모델 검수 후 사람 검토 필수.
- 분량: 자유 형식 Daily 300~1,000자, Weekly 600~6,000자(공백 포함). 고정 소제목(`DAILY_SECTIONS` 6개, `WEEKLY_SECTIONS` 9개, Daily 800~1,200자)은 예전 초안과 옛 수동 형식 검증용으로만 남아 있다.
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

- 2026-09-09 실전 검증(고정 소제목 시절): 원문 31개, 후보 5개, 선정 점수 85.5, 928자 초안 기계 검증 통과, 편집 검수 통과, 텔레그램 성공, 승인 대기 저장.
- 테스트 (레포 루트): `node --test research-lab/test/*.test.js`.
  실제 PostgreSQL 트랜잭션 테스트: `PGLITE_MODULE`에 `@electric-sql/pglite/dist/index.js` 경로를 넣고 `node research-lab/test/desk-sql.integration.mjs`. 운영 DB는 쓰지 않는다.
- 이미지 빌드 (레포 루트): `docker build -t kk-editorial:VERSION -f research-lab/deploy/Dockerfile .` — compose 정의는 `research-lab/deploy/compose.yaml`.
- **레포 merge만으로는 반영되지 않는다.** VPS에는 git 사본이 없으므로 GitHub tarball을 받아 `/opt/kk-editorial`에서 이미지를 다시 빌드·재시작한다 (명령은 에이전트가 만들고 KK가 붙여넣는다). 모델만 바꿀 때는 `.env` 수정 후 재시작.
- 롤백: Desk 컨테이너 정지, 또는 `EDITORIAL_PUBLISH_ENABLED=false`로 Vercel 재배포. 편집 테이블·이벤트는 지우지 않는다.

### 점검 항목

성공·보류 건수, 출처 실패, 사람 교정량, 주제 중복을 runs/events에서 확인한다. OpenRouter 비용은 따로 본다. 08:00 완료는 목표이지 보장이 아니다. 테스트 통과를 근거로 자동 발행을 켜지 않는다.
