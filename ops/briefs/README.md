# Daily Markets 브리핑 — VPS 실행기

평일 두 번 KK 명의로 올라가는 브리핑을 **VPS 안에서** 예약 실행한다.
2026-10-06부터 이 브리핑은 라운지가 아니라 **공개 Daily Markets**(`/markets/<날짜>-start|close`)에 보인다.
저장 위치는 그대로 `member_posts` + `daily_briefs`이고, 라운지 목록에서만 빠진다 (`server/src/routes/markets.js`).
제목은 코드가 정한다: `오늘의 시작 (10/6 화)`, `오늘의 마감 (10/6 화)` — 모델이 쓴 TITLE은 버린다.
Supabase도, Vercel Cron도 쓰지 않는다.

| 브리핑 | 코드 | 실행 (KST) | 재시도 |
|---|---|---|---|
| 오늘의 시작 (옛 글로벌 마켓 브리핑) | `lib/briefs/global.js` | 월~금 07:00 | 07:20 |
| 오늘의 마감 (옛 한국 금융시장 종합) | `lib/briefs/korea-close.js` | 월~금 17:30 | 17:50 |
| 주간 다이제스트 이메일 | `lib/briefs/digest.js` | 월 09:00 | 없음 (중복 발송 방지 — 실패 시 경고만) |

- 재시도는 앞선 실행이 성공했으면 "already ran today"로 그냥 끝난다. 실패했을 때만 다시 쓴다.
- 발행 경로: 이 컨테이너 → `https://api.kkandfriends.com/api/internal/automation` →
  VPS PostgreSQL. 글·알림·하루 잠금이 한 트랜잭션으로 들어간다 (`server/src/routes/automation.js`).
- 실패하면(설정 누락 포함) KK 텔레그램(`TELEGRAM_CHAT_ID`)으로 경고가 간다.
  예전처럼 "설정 안 됨"을 성공으로 넘기지 않는다.
- **humanizer (2026-10-04 KK 지시):** 글로벌·한국 마감 브리핑은 쓰고 나서 같은 모델로 한 번 더 다듬는다
  (`lib/briefs/humanize.js`, 스킬 원문 `.claude/skills/humanizer/SKILL.md`를 이미지에 복사).
  숫자·`##` 소제목·💡 줄·→ 화살표가 바뀌거나, 표가 생기거나, 본문이 크게 줄거나, 호출이 실패하면
  다듬은 글을 버리고 원문으로 발행한 뒤 KK 텔레그램에 "humanizer 미적용"을 보낸다. 모델 호출이 편당 1회 늘어난다.
- Editorial Desk 컨테이너(`research-lab/deploy`)와 **완전히 분리**된 별도 컨테이너다.
  발행 토큰이 Desk 쪽에 들어가지 않는다.

## 최초 설치 (VPS, SSH 접속 후)

```sh
cd <레포 경로>                  # VPS에 받아둔 이 레포 위치 — 확인 필요
git pull
cd ops/briefs
cp env.example .env && chmod 600 .env
nano .env                       # 아래 "환경변수" 채우기
docker compose up -d --build
docker compose logs -f briefs   # 시작 확인 후 Ctrl+C
```

### 환경변수 (`ops/briefs/.env`)

| 키 | 필수 | 어디서 가져오나 |
|---|---|---|
| `EDITORIAL_INTERNAL_TOKEN` | ✅ | API 서버 env 파일의 같은 키 (운영 compose가 `compose.staging.yaml`이면 `/opt/kkf-community-staging`의 `.env.staging` — 확인 필요). **글자 하나까지 같아야 한다.** |
| `OPENROUTER_API_KEY` | ✅ (쓰기 키 중 하나) | Editorial Desk 컨테이너와 같은 키. 모델은 `OPENROUTER_MODEL` (기본 `deepseek/deepseek-v4.1-flash,deepseek/deepseek-v4-flash-0731:nitro,z-ai/glm-5.3-flash` — 앞 모델이 실패하면 다음 모델). 생각 길이는 `OPENROUTER_REASONING_EFFORT` (기본 `low`) |
| `GEMINI_API_KEY` | 선택 | 있으면 OpenRouter보다 먼저 쓴다. aistudio.google.com/apikey |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | 권장 | Editorial Desk 컨테이너와 같은 값 |
| `TELEGRAM_CHANNEL_ID` | 선택 | 멤버 채널. 없으면 KK 채팅으로 티저가 간다 |
| `RESEND_API_KEY`, `RESEND_FROM` | 다이제스트용 | API 서버 env 파일의 같은 키 |
| `ECOS_API_KEY` | 선택 | 한국은행 ECOS. 없으면 매크로 배경 섹션만 빠진다 |
| `DART_API_KEY` | 선택 | OpenDART(공시). `STATS_IN_BRIEFS=1`일 때만 17:30 한국 마감 브리핑이 공시 건수를 쓴다. 없으면 그 줄만 빠진다 |
| `OPENLAW_OC` | 선택 | 법제처 OC. 자본시장법 시행예정 개정 줄과 `law-watch.mjs`에 쓴다. 없으면 그 줄만 빠진다 |
| `KOSIS_API_KEY` | 선택 | 통계청 KOSIS. 지금은 `scripts/stats-card.mjs`(초안용 수치 카드)에서만 쓴다. 통계표 ID 확인 전이라 꺼져 있다 |
| `STATS_IN_BRIEFS` | 선택 | `1`이면 17:30 마감 브리핑에 공시 건수·법령 일정을 넣는다. 기본은 꺼짐 |

Vercel에 "Sensitive"로 저장된 값은 다시 볼 수 없다. 그럴 땐 원래 발급처에서 새로 받는다.

## 확인·수동 실행

```sh
cd ops/briefs
# 미리보기 — AI가 쓰기만 하고 발행하지 않는다
docker compose exec briefs node /app/ops/briefs/run.mjs global --dry
docker compose exec briefs node /app/ops/briefs/run.mjs korea-close --dry

# 다이제스트: 미리보기(발송 안 함) / 나에게만 1통 / 이번 주 것 강제 발송
docker compose exec briefs node /app/ops/briefs/run.mjs digest --dry
docker compose exec briefs node /app/ops/briefs/run.mjs digest --to=내메일주소

# 오늘 것을 지금 발행 (주말이거나 이미 발행됐어도 강행 — 중복 글이 생길 수 있으니 주의)
docker compose exec briefs node /app/ops/briefs/run.mjs global --force
```

`ok: false`와 `missing: [...]`가 나오면 그 키가 `.env`에 없는 것이다.
`.env`를 고친 뒤에는 `docker compose up -d`로 컨테이너를 다시 띄워야 반영된다.

## 멈추기 / 되돌리기

```sh
cd ops/briefs && docker compose down      # 예약 실행 중지 (DB·글은 그대로)
```

Vercel Cron으로 되돌려야 하면 이 변경 이전 커밋의 `api/cron/daily-brief.js`,
`api/cron/korea-close.js`, `vercel.json` 크론 두 줄을 복원한다. 둘 다 동시에 켜져 있어도
하루 잠금 때문에 중복 발행은 되지 않는다.

## 문제가 생기면

- `Community API briefClaim failed (401)` → `EDITORIAL_INTERNAL_TOKEN`이 API 서버 값과 다르다.
- `fetch failed` / 시간 초과로 API에 닿지 않음 → VPS가 자기 공인 주소로 되돌아 들어가는 연결을
  막는 경우다. `https://api.kkandfriends.com/health`를 VPS 안에서 `curl`로 먼저 확인할 것.
- `Gemini 호출 실패 — 429` → 무료 한도 초과. 키 사용량 확인 또는 `GEMINI_MODEL`로 다른 모델 지정.
- `empty response (finish_reason: length)` → 모델이 생각하느라 글자 한도를 다 썼다. `OPENROUTER_REASONING_EFFORT=none`으로 낮추거나 예비 모델에 맡긴다.
- `OpenRouter 호출 실패 — 400 ... not a valid model` → `OPENROUTER_MODEL` 이름이 틀렸다. openrouter.ai/models에서 정확한 ID 확인.

## 공식 통계 연결 (2026-10-21 추가, `lib/stats/`)

- **17:30 한국 마감 브리핑**: `STATS_IN_BRIEFS=1`일 때만 공시(DART) **건수 집계**와 자본시장법 계열 시행예정 일정을 프롬프트에 넣는다. 기업 이름은 넣지 않는다(종목을 찍지 않는다). 기본은 꺼짐이고, 켠 뒤 문제가 있으면 `.env`에서 `STATS_IN_BRIEFS=`를 지우고 컨테이너를 다시 띄우면 된다.
- **VPS 반영 순서(백업, 플래그 끈 채 확인, 켜기, 되돌리기):** `DEPLOY_STATS.md`.
- **미리보기**: `docker compose exec briefs node /app/ops/briefs/run.mjs korea-close --dry` 결과의 `official` 배열에 들어간 줄이 보인다.
- **법령 감시** (2026-10-22부터 평일 KST 08:30 예약, `briefs.cron`): `docker compose exec briefs node /app/ops/briefs/law-watch.mjs --dry`. 첫 실행은 기준선만 저장하고, 이후 현행 버전이 바뀌거나 시행예정 개정이 새로 생기면 텔레그램으로 알린다. 키나 읽기 실패는 알림과 함께 실패로 끝난다. 바뀐 것이 없으면 조용하고, 이 예약을 끄려면 `briefs.cron`의 해당 줄을 지우고 이미지를 다시 만든다. 수동 실행은 같은 명령이다.
- **초안용 수치 카드**(컨테이너 밖에서도 된다): `node scripts/stats-card.mjs`. 출처·기준일·교차 확인이 붙은 목록을 초안 아래(본문 밖)에 붙인다. `node scripts/stats-probe.mjs`는 키와 연결 상태만 보여 준다.
- **KOSIS는 아직 꺼져 있다**: 통계표 ID와 응답 필드명을 실제 키로 확인하지 못했다. `node scripts/stats-probe.mjs kosis-cpi`, `kosis-search 주민등록인구`로 확인한 뒤 `lib/stats/kosis.js`의 `verified`를 고친다.
