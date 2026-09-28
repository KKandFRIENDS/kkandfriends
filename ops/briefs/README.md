# 라운지 브리핑 — VPS 실행기

평일 두 번 라운지(`/voices`)에 KK 명의로 올라가는 브리핑을 **VPS 안에서** 예약 실행한다.
Supabase도, Vercel Cron도 쓰지 않는다.

| 브리핑 | 코드 | 실행 (KST) | 재시도 |
|---|---|---|---|
| 글로벌 마켓 브리핑 | `lib/briefs/global.js` | 월~금 07:00 | 07:20 |
| 한국 금융시장 종합 | `lib/briefs/korea-close.js` | 월~금 17:30 | 17:50 |
| 주간 다이제스트 이메일 | `lib/briefs/digest.js` | 월 09:00 | 없음 (중복 발송 방지 — 실패 시 경고만) |

- 재시도는 앞선 실행이 성공했으면 "already ran today"로 그냥 끝난다. 실패했을 때만 다시 쓴다.
- 발행 경로: 이 컨테이너 → `https://api.kkandfriends.com/api/internal/automation` →
  VPS PostgreSQL. 글·알림·하루 잠금이 한 트랜잭션으로 들어간다 (`server/src/routes/automation.js`).
- 실패하면(설정 누락 포함) KK 텔레그램(`TELEGRAM_CHAT_ID`)으로 경고가 간다.
  예전처럼 "설정 안 됨"을 성공으로 넘기지 않는다.
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
| `OPENROUTER_API_KEY` | ✅ (쓰기 키 중 하나) | Editorial Desk 컨테이너와 같은 키. 모델은 `OPENROUTER_MODEL` (기본 `z-ai/glm-5.3-flash,deepseek/deepseek-v4-flash-0731:nitro` — 앞 모델이 실패하면 다음 모델). 생각 길이는 `OPENROUTER_REASONING_EFFORT` (기본 `low`) |
| `GEMINI_API_KEY` | 선택 | 있으면 OpenRouter보다 먼저 쓴다. aistudio.google.com/apikey |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | 권장 | Editorial Desk 컨테이너와 같은 값 |
| `TELEGRAM_CHANNEL_ID` | 선택 | 멤버 채널. 없으면 KK 채팅으로 티저가 간다 |
| `RESEND_API_KEY`, `RESEND_FROM` | 다이제스트용 | API 서버 env 파일의 같은 키 |
| `ECOS_API_KEY` | 선택 | 한국은행 ECOS. 없으면 매크로 배경 섹션만 빠진다 |

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
