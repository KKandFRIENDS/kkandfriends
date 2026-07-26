# MEMORY.md

**최종 수정:** 2026-07-26

행동 규칙은 `CLAUDE.md`에 있다. 이 파일은 **변할 수 있는 사실**만 담는다.

---

## 프로필

- **이름:** 김기석 / Kiseok Kim · 호칭 **KK** 또는 **Chief** · 1969년생
- **거주:** 서울
- **언어:** 한국어, 영어, 프랑스어
- **학력:** MBA, University of Wisconsin-Madison (1996)
- **기기:** Windows OS, Android (iPhone·Mac 사용 안 함)

**현재 직함**

| 조직 | 역할 | 시작 |
|---|---|---|
| Bitplanet Inc. | CSO / VP | 2025-10 |
| CROWDY Inc. | Founder / CEO | 2015-09 |
| JB Financial Group | 사외이사 · **리스크관리위원회 위원장** | 2024-04 (위원장 2026-03-26~) |

**자문 역할:** 부산시 금융혁신정책 자문위원 · KORBIT 상장심사위원회 위원 · 부산금융센터 포럼 회원

**경력:** JP Morgan 홍콩/서울 (1997–2001) → Bank of America MD (2001–2009) → BofA Merrill Lynch Korea CEO (2009–2011) → ANZ Korea CEO (2011–2015) → CROWDY. 총 약 30년 글로벌 금융.

**운영 사이트:** www.kkandfriends.com · www.standardbtc.com — 은퇴 후 금융 전문가 커뮤니티 운영을 염두에 둔 프로젝트.

---

## 진행 중인 프로젝트

| 프로젝트 | 상태 | 비고 |
|---|---|---|
| CROWDY STO 발행중개업 전환 | 진행 중 | 2026 Q2 ~ 2028+ 단계별 실행 |
| Bitplanet IR 포지셔닝 | 진행 중 | 코스닥 상장 로드맵, KPI 프레임워크 포함 |
| Bitplanet–CROWDY M&A 검토 | 검토 중 | Scenario B: 전략적 지분 취득 40~51% |
| NotebookLM MCP 통합 | 운영 중 | 노트북 4개: Prompt Optimizer / JB금융지주_리스크위원회 / Broken Money / BITCOIN |
| KKandFriends 블로그 | 운영 중 | 2026-04부터 발행. 최신 글 2026-07-22 |
| AI 워크스페이스 정비 | **진행 중** | 2026-07-26 착수. 아래 참조 |

**관계:** Paul — Bitplanet CEO.

---

## AI 워크스페이스 정비 (2026-07-26~)

**완료**

- `CLAUDE.md` 루트에 `.md`로 생성 — 이전 `CLAUDE/CLAUDE.md.docx`는 작동한 적이 없었음 (확장자·위치 둘 다 틀림)
- `MEMORY.md` 루트에 `.md`로 생성 — 이전 `.docx`는 Anthropic 스타터 템플릿 그대로였음
- `KK-Master-Writing-Prompt.docx` → `.md` 변환. `.md`가 운영 마스터, `.docx`·`.pdf`는 아카이브로 동결
- **마스터 프롬프트 v3.2** — §5 모순 해소. Chief 확인 결과 "이 표현들 쓰지 말자"는 **표현 금지가 아니라 반복 금지**가 본뜻이었음(기록 오류). 팩트-해석 분리와 실전 경험 섹션은 의미상 필수로 유지, 고정 문구만 금지. "이미 쓴 표현/헤더" 대조표 신설
- 스킬 3종 설치: `kk-writing-style` · `paper-to-blog` · `session-audit`
- `starter-session-audit.skill` 내용 확인 → 유용하다고 판단, 한국어·KK 규칙 반영해 `session-audit`으로 설치. 원본 `.skill` 파일은 보존

**완료 (2026-07-26 오후)**

- **폴더 재구성 실행.** 도구별 → 주제별. 40개 복사 → md5 40/40 대조 → 원본을 `_archive/_old-structure/`로 이동. 유실 0건
- **OBSIDIAN → `_archive/obsidian-unused/`** 격리 (3,437개). 삭제 아님. Obsidian 앱에서 vault 경로만 바꾸면 그대로 사용 가능
- **파일 개명 4건** — html 참조 검사 후 안전 확인하고 실행 (kurzweil→20260705, 코스피 하이픈→언더스코어, VASP 공백 제거, 청구서 접두사 정리)
- **`Blog/ops/` 신설** — 운영 문서 6개 이관 (`posts/`에서 5개 + `Blog/` 루트에서 주소록 csv 1개)
- **`Research/Digital-Assets/` 채움** — 디지털자산 규제 딥리서치 국/영문 2편을 `posts/`에서 이관. KK 문체 블로그 글이 아니라 리서치 산출물이었음. 이로써 `Blog/posts/`에는 발행 글 8편만 남음
- **면책 문구 소급** — 20260722 포드, 20260705 커즈와일 2편에 추가

**대기 중인 결정**

1. **NotebookLM 재인증** — 인증 만료. Chief가 Windows 터미널에서 `nlm login` 실행 필요. Claude 샌드박스에서는 불가
2. **Claude in Chrome 재연결** — 확장 연결 끊김. YouTube 등 JS 렌더링 페이지 읽기 불가
3. **웹사이트에만 있고 로컬에 없는 글 6편** — 아래 참조
4. **`_archive/_old-structure/` 처리** — 재구성이 안정됐다고 판단되면 삭제할지 보관할지. **Chief 명시 허가 없이 삭제하지 않음**

**웹사이트에만 있고 로컬 사본이 없는 글 6편** (`Blog/site/index.html`이 링크 중):

`20260419_blockchain_fragmentation` · `20260419_kurzweil_energy_currency` · `20260419_stablecoin_new_rail` · `20260420_strategy_strc_frequency` · `20260421_fiat_future` · `20260422_ai_infra_korea`

*이 6편의 메타포·표현이 마스터 프롬프트 대조표에 반영돼 있지 않다. 재탕 위험이 남아 있다.*

**미착수 (합의된 로드맵)**

- `jb-risk-committee` 스킬
- `bitplanet-ir` 스킬
- `crowdy-sto` 스킬
- 예약 작업 / 아티팩트 대시보드 (현재 각 0개)

---

## 도구 환경

**AI 스택:** Claude (주력) · ChatGPT · Gemini · NotebookLM · Perplexity · Genspark · Whisper Flow · Grok · Fireflies.ai

**Claude 사용 모드:** `KK_Chat` (캐주얼 대화·전략) / `KK_Cowork` (문서 작업·실무)

**연결된 MCP:** Outlook · SharePoint · Teams · NotebookLM · scheduled-tasks · Claude in Chrome

**알려진 이슈 (2026-07-26 기준):**

- Claude in Chrome 확장 연결 안 됨 → YouTube 등 JS 렌더링 페이지 읽기 불가
- NotebookLM 인증 만료 → Chief가 Windows 터미널에서 `nlm login` 실행 필요

---

## Hermes AI Agent (VPS)

**호스팅:** Hostinger VPS · Ubuntu 24.04 · `root@srv1619910`
**접속:** Hostinger 웹 콘솔 (SSH 클라이언트 안 씀)
**컨테이너:** `hermes-agent-i9bo-hermes-agent-1` (이미지 `ghcr.io/hostinger/hvps-hermes-agent:latest`)
**데이터 경로:** `/opt/data/` — 설정 `config.yaml`, 비밀값 `.env`
**LLM 게이트웨이:** OpenRouter (`OPENROUTER_API_KEY` in `/opt/data/.env`)
**인터페이스:** Telegram 봇 `KK_Hermes_Master_Docker`

**Master Agent 역할:** 단순 디스패처가 아님. 시장 데이터 종합 판단(Bottom Line), LOOP v2 팩트체크·검증·스코어링, 크론 결과 진단 및 액션 제안, 도구·스킬 선택, 멀티에이전트 위원회 결과 종합.

**모델 설정 (2026-07-26 기준)**

| 항목 | 값 |
|---|---|
| `model.default` | `deepseek/deepseek-v4-pro` |
| `smart_model_routing.cheap_model.default` | `deepseek/deepseek-v4-flash` (160자/28단어 이하) |
| 이력 | DeepSeek V4 Flash → Sonnet 4 (2026-07-26 오후) → DeepSeek V4 Pro |

**모델 슬러그는 반드시 `제공사/모델명` 전체 형식.** `deepseek/deepseek-v4`처럼 접미사 없는 값은 OpenRouter에 존재하지 않는다.

**크론 19개** (2026-07-26 기준) — 가동 18 / 통지 1(`LOOP - Blogs`).

같은 날 2개를 완전 삭제했다: `Curator Daily Run`(계속 돌아서 Chief가 멈춰뒀던 것), `LOOP - Builds`(Chief가 존재를 모르던 크론. 검증 불가 1인칭 성과 수치를 매일 09:00에 발행하고 있었다). 삭제 전 `jobs.json.bak_before_delete_20260726` 백업.

**크론 시각은 `jobs.json`에 UTC로 저장된다.** KST = UTC+9. 이름·프롬프트 본문의 시각 표기는 낡은 경우가 있으니 `schedule` 필드만 신뢰한다.

**모델 비용 참고 (OpenRouter, $/1M 토큰, 2026-07 기준)**

| 모델 | Input | Output |
|---|---|---|
| DeepSeek V4 Flash | 0.09 | 0.18 |
| DeepSeek V4 Pro | 0.435 | 0.87 |
| GPT-5.4 Mini | 0.75 | 4.50 |
| Claude Sonnet 5 | 2 (프로모션, ~2026-08-31) | 10 |

*Claude Sonnet 4 / Opus 4는 2026-06-15 Anthropic API에서 은퇴. 단, OpenRouter 경유로는 은퇴 후에도 응답한 정황이 있음 — 서드파티 라우팅 추정. **확인 필요.***

**남은 개선 여지 (봇 자체 보고):** `max_turns` 90→150 상향이 효과 가장 큼. 그 외 메모리 한도 4,000자 상향, oh-my-hermes 3-agent 위원회, MCP 서버 확장.

⚠️ **봇의 자기 진단은 근거가 아니다.** 2026-07-26에 봇이 "✅ DeepSeek V4 (Pro)로 변경됨"이라고 보고했으나 실제로는 존재하지 않는 슬러그(`deepseek/deepseek-v4`)를 저장해 전체가 멈췄다. 자기 상태·능력에 대한 보고는 항상 파일로 확인한다.

---

## LOOP v2 (2026-07-26 대수술)

**위치:** `/opt/data/loop-v2/` · 코드 `loop.py` · 설정 `examples/*.yaml` · 상태 `state/`

**설정 3개:** `markets-v2.yaml` (LOOP-Markets) / `content-v2.yaml` (LOOP-Blogs) / `content-v2-builds.yaml`

**중요 — LOOP v2는 Hermes 모델 설정과 무관하다.** `loop.py` 322행에 `deepseek/deepseek-v4-flash`가 하드코딩되어 있다. improver도 judge도 전부 Flash. Master Agent를 Pro로 바꿔도 LOOP v2는 영향받지 않는다.

**cron 모드는 1회만 돈다.** `run.sh --cron` = `--json --reset`. `--loop-until-done`이 아니므로 `max_iterations: 10`은 cron에 무의미하다.

### 수술 전 상태 — 왜 팩트체크가 작동하지 않았나

| 문제 | 내용 |
|---|---|
| improver가 데이터를 못 봤음 | Yahoo Finance 호출이 `verify_fact_check` 안에만 있었음. 글 쓰는 쪽엔 전달 안 됨 → 숫자를 지어냄 |
| 숫자 없으면 7.0점 | `claims_found == 0` → 7.0. 총점 9.1로 **편하게 통과.** 즉 "검증 가능한 숫자를 피하라"고 보상하는 구조 |
| fetch 실패도 5.0점 | 총점 8.5 = 통과선. 데이터가 죽어도 통과 |
| 허용 오차 2% | 코스피 6690 기준 **±134포인트** |
| good_example이 코스피 2600 | 실제의 40%. few-shot이 모델의 숫자 감각을 왜곡 |
| `max_tokens=256` | Flash는 추론 모델. 추론에 256을 다 쓰면 `content`가 빈 값 → judge가 "Could not parse score" → 5.0 |
| `humanify`가 spec과 충돌 | 데이터 브리핑을 "formulaic"이라고 감점. 그런데 formulaic이 spec 요구사항 |
| `No hedging language` | 마스터 프롬프트에 없는 문구. §4 "검증 안 된 수치는 확인 필요 명시"와 정면 충돌 |

### 적용한 수정

**`loop.py`** (백업: `loop.py.bak_20260726`)

| 위치 | 변경 |
|---|---|
| 290행대 | `live_market_data: true`면 프롬프트에 `## LIVE MARKET DATA` 블록 주입 (신규) |
| 319행 | `max_tokens` 256 → **2048** |
| 477·480행 | fetch 실패 5.0 → **0.0** + `FACT CHECK UNAVAILABLE` 사유 노출 |
| 534행 | 오차 2% → **0.5%** |
| 535행 | 정규식에 `(\d[\d,]*...)`로 선행 숫자 강제 + `(?![\d.,]*선)`로 `선` 붙은 숫자 제외 |
| 542행 | 숫자 없으면 7.0 → **0.0** (`SPEC VIOLATION`) |

`선` = `선`. 지지선·저항선 언급을 현재 시세 주장으로 오해하는 오탐을 막는다. 콘솔 붙여넣기에서 한글이 깨질 위험을 피하려고 코드값으로 넣었다.

**`markets-v2.yaml`** (백업: `markets-v2.yaml.bak_20260726`)

- `live_market_data: true` 추가
- constraints: `No hedging language` 삭제 → **현재 사실은 단정 / 전망은 조건부 / 미검증 수치는 추정 표기** 3줄로 교체
- improver instruction: good_example의 숫자 재사용 금지 명시
- quality criteria: `no hedging?` → `current facts definitive, forecasts conditional, no vague hedges?`
- length target 120 → **50**
- 가중치 재배분: fact_check 0.30→**0.45** / quality 0.35→0.40 / humanify 0.20→**0.10** / length 0.15→**0.05**

### 결과 (2026-07-26 검증)

`9.4 / 10 → ✅ Target reached` · fact_check 10.0 (2/2 정확)

산출물의 코스피·코스닥·환율·S&P500·WTI 5개 지표가 실데이터와 완전 일치. 비트코인은 0.07% 차이를 모델이 스스로 `(추정치)`로 표기. 전망은 `6600선 이탈 시 6500까지`로 조건부 서술.

**가중치 검산:** fact_check 10 → 8.75 통과 / fact_check 5 → 6.50 탈락. 숫자가 틀리면 못 나가고 문체가 딱딱한 건 통과한다.

---

## LOOP - Markets 크론 수정 (2026-07-26, 2차 세션)

**Job ID:** `2c23eb93dcee` · 스케줄 `0 8 * * 1-5` (= 17:00 KST 평일) · 배달 `telegram:-1004327614242:23`
**설정 위치:** `/opt/data/cron/jobs.json` (백업 `jobs.json.bak_1784930886`)
**수정 명령:** `hermes cron edit <job_id> --prompt "$(cat 파일)"` — 봇에게 말로 시키지 말고 CLI로 직접

### 발견 — LOOP v2는 production에서 한 번도 돌지 않았다

```
loop.py: error: unrecognized arguments: --cron
```

**`--cron`은 `run.sh`의 플래그다. `loop.py`는 모른다.** `run.sh`가 이걸 `--json --reset`으로 번역해 준다.

그런데 크론 프롬프트는 `run_with_key.sh`를 호출하고, 이 스크립트는 `run.sh`를 거치지 않고 `loop.py`를 직접 실행한다. 그래서 `--cron`이 그대로 전달되어 argparse가 매번 거부했다.

**결과:** LOOP이 죽고 → 프롬프트 3번 "If LOOP fails, generate a brief market update using web data"로 넘어가 → **에이전트가 웹 검색으로 직접 쓴 글이 올라갔다.** `last_status: ok`는 "에이전트가 무언가 올렸다"는 뜻일 뿐이었다.

즉 1차 세션에서 고친 LOOP v2 팩트체크는 **production에 적용된 적이 없었다.**

### 크론 프롬프트의 두 구멍 (수정 전)

| 문구 | 문제 |
|---|---|
| "deliver it to #Markets topic **as-is**" | 점수 게이트 없음. `fact_check` 점수를 아무도 읽지 않았다 |
| "If LOOP fails, **generate a brief using web data**" | 검증 안 된 글이 검증된 글과 똑같은 모양으로 발행. Chief가 구분 불가 |

### 적용한 새 프롬프트 (영문 — 콘솔 한글 붙여넣기 위험 회피)

1. `./run_with_key.sh --config .../markets-v2.yaml --json --reset --loop-until-done`
2. JSON에서 `best_scores.fact_check`와 `status`를 읽는다
3. **게이트:** `fact_check >= 9.0` **AND** `status == complete` → 브리핑 그대로 발행. 아니면 발행하지 않고 보류 사실 + 실제 점수만 한 줄
4. 명령 실패·JSON 없음 → "LOOP v2 did not run, no brief today" 한 줄만
5. **NEVER write a market brief from web search, memory, or your own knowledge. An unverified brief is worse than no brief.**

**`--loop-until-done`을 쓴 이유:** 검증 대상이 2~3개뿐이라 점수가 거칠다(3/3=10.0, 2/3=6.7, 1/2=5.0). 1회만 돌리면 숫자 하나만 어긋나도 보류된다. 반복하게 하면 LOOP이 교훈을 반영해 스스로 고친다. `max_iterations: 10` + `stop_on_plateau`가 무한 반복을 막는다. 반복 사이 30초 대기가 있어 최대 몇 분 소요.

### `run_with_key.sh` 수정

- 19행: `print(f'key prefix: {key[:10]}...')` → `pass`. **API 키가 stdout·로그·에이전트 컨텍스트로 새던 경로 차단**
- `present: True` / `key length` 두 줄은 비밀이 아니므로 유지

### Blogs · Builds 크론도 같은 버그였다 — 함께 수정

| Job | ID | 스케줄 |
|---|---|---|
| LOOP - Blogs | `e52b7db0b8c3` | `0 0 * * *` (09:00 KST) |
| LOOP - Builds | `22ee64d70efb` | `0 0 * * *` (09:00 KST) |

둘 다 `--cron` 플래그와 `"If LOOP fails, generate ... using available data"` 폴백을 똑같이 갖고 있었다. **세 토픽(#Markets·#Blogs·#Builds) 전부 LOOP v2가 한 번도 돌지 않았고, 올라간 글은 모두 에이전트가 즉석에서 쓴 것이었다.**

수정 내용은 markets와 동일하되 게이트는 `status == complete` 하나만 걸었다 — 이 두 설정에는 `fact_check` verifier가 없어서 정확도 게이트를 걸 수 없다.

**프롬프트 본문의 시각 표기를 제거했다.** 구 프롬프트는 "09:00, 21:00 KST"라고 적혀 있었지만 실제 스케줄은 09:00 하나뿐이었다. 시각은 `schedule` 필드가 유일한 근거다.

### 검증 (2026-07-26)

- markets: 크론과 동일 명령 end-to-end → `status: complete` · `fact_check: 10.0` · 출력에 `sk-or-v1` 없음
- content-v2: `status: complete` 수렴 확인. 다만 **여러 회차를 돌아 수분 소요됐다** (정확한 회차 수는 미측정)
- 세 크론 프롬프트 모두 `--loop-until-done` 포함 / `--cron` 미포함 확인

### ⚠️ `docker exec`로 작업할 때 파일 소유권 주의

`docker exec`는 **root로 실행된다.** Python의 `open(path,"w")`로 새 파일을 만들거나 `py_compile`을 돌리면 **root 소유 파일이 생긴다.** 크론은 `hermes` 사용자로 도니 그 파일을 쓸 수 없어 다음 실행이 실패한다.

2026-07-26에 실제로 6개가 생겼다: `state/*/state.json` 2개(치명적), `__pycache__` 2개, `.bak` 2개. `chown -R hermes:hermes /opt/data/loop-v2`로 정리했다.

**작업 후 반드시 확인할 것:**

```
docker exec <컨테이너> sh -c 'find /opt/data -user root 2>/dev/null | head'
```

`sed -i`와 `hermes` CLI는 소유권을 보존하므로 `.env`·`config.yaml`·`jobs.json`은 영향 없었다. 문제가 되는 건 **새로 생성되는 파일**이다.

---

## LOOP - Blogs · LOOP - Builds 폐기 (2026-07-26, Chief 승인)

**조치 (최종):**

- `LOOP - Builds` — **크론 완전 삭제** (`22ee64d70efb`). Chief가 이 크론의 존재를 모르고 있었다
- `LOOP - Blogs` — **크론 완전 삭제** (`e52b7db0b8c3`)
- 설정 파일 `content-v2.yaml`·`content-v2-builds.yaml`은 **둘 다 보존.** 삭제하지 않았다
- 삭제 후 크론 **18개, 통지 0개.** LOOP 계열은 `LOOP - Markets` 하나만 남았다

`--cron` 버그를 고쳐 LOOP이 처음 정상 작동하게 만든 직후, 두 설정이 근본적으로 잘못 설계돼 있음이 드러났다. **버그를 고친 것이 오히려 위험을 키웠다** — 이전에는 LOOP이 죽고 에이전트가 웹 검색으로 썼는데, 고친 뒤에는 낡은 예시를 베낀 글이 검증 없이 발행되는 경로가 열렸다.

### `content-v2.yaml` (#Blogs) — 왜 폐기했나

- **markets-v2의 복사판이다.** `good_example`이 코스피 2600선 시장 브리핑(markets의 옛 예시와 동일), constraints도 동일. 블로그 개선기가 아니라 시장 브리핑 생성기였다
- **`seed_text`가 고정된 가짜 문단이다** — *"Market is showing some interesting movements this week. The KOSPI is fluctuating..."*. 실제 블로그 소재가 입력되는 경로가 없다. 매일 같은 가짜 문단 하나를 다듬는다
- **`fact_check`가 없다.** 실측: 코스피 실제 6690인데 **2720**으로 쓰고 `quality 10.0 / humanify 8.0`, 총점 8.5 → `complete` → 발행 대기. 예시의 숫자를 베낀 것
- **마스터 프롬프트와 무관하다.** 150단어 대 2,000~2,500자. 메타포·정-반-합·실전 경험 섹션·💡·발행 전 체크리스트 15항목·면책 문구 — 전부 없음

### `content-v2-builds.yaml` (#Builds) — 왜 폐기했나

- **검증 불가능한 1인칭 성과 수치를 지어낸다.** `good_example`: *"최근 GitHub Actions + Vercel로 배포 파이프라인 구성. CI 시간 12분→3분으로 단축... turborepo 적용 시 빌드 시간 40% 감소 확인."* constraints는 `Data-backed claims with specific numbers`를 요구하는데 **데이터 소스가 없다**
- 시장 수치보다 위험하다. 코스피 2720은 누구나 틀린 걸 안다. 하지만 *"CI를 12분에서 3분으로 줄였다"*는 **아무도 검증할 수 없고 Chief 이름으로 금융 전문가 채널에 나간다**
- 빌드 메트릭은 검증할 데이터 소스 자체가 없으므로 **어떤 fact_check도 만들 수 없다**
- `seed_text`도 고정된 가짜 문단 — *"Building software is hard..."*
- **길이 규칙이 셋 다 충돌한다:** constraints `110-130 words` / length verifier `target: 65` / quality criteria `under 150 words`

### 블로그·빌드 콘텐츠는 앞으로 이렇게

**자동 발행하지 않는다.** `kk-writing-style`·`paper-to-blog` 스킬이 `Blog/KK-Master-Writing-Prompt.md`를 읽어 적용하고, Chief가 §7 체크리스트로 검토한 뒤 발행한다. 크론이 대신할 수 없는 일이다.

---

## Hermes 아키텍처 (2026-07-26 확인)

### Telegram 구성

| ID | 이름 | 용도 |
|---|---|---|
| `-1004327614242` | **KKnFriends Agents** | 콘텐츠 평면. topic 1=전체 / 23=Markets / 25=Captures / 26=Builds / 27=Blogs / 28=General |
| `-1004486723059` | **KK&Friends Ingest** | **통제 평면.** Chief 의도: 여기서 Agents 그룹을 관리 |
| `217666145` | **KK** | DM |

**봇은 여러 대다.** VPS Docker의 `KK_Hermes_Master_Docker` 외에 `KK_Hermes_Oldest_Lo`(집 PC·서울), `KK_WorkPC_He`, `KK_ObsidianBot`, `KK_Anthropic_`. **각 PC의 로컬 Hermes가 텔레그램에 직접 붙는 별개 인스턴스**이며 VPS Docker를 거치지 않는다. 즉 VPS 설정을 고쳐도 로컬 봇들은 영향받지 않지만, **같은 토픽에 함께 쓴다.**

### config.yaml 핵심 (`/opt/data/config.yaml`, `_config_version: 33`)

**`toolsets: ["hermes-cli", "hermes-telegram", "web"]`** — `hermes-cli`는 번들이며 안에 이만큼 들어 있다:
`browser · code_execution · computer_use · cronjob · delegation · file · image_gen · kanban · memory · session_search · skills · terminal · todo · tts · vision · web`

즉 **Master는 터미널·파일·크론·위임·메모리를 모두 가지고 있다.** 도구 부족이 제약이 아니다. (`plugins.enabled: []`, MCP 미구성)

| 설정 | 값 | 의미 |
|---|---|---|
| `agent.max_turns` | 90 | 봇이 150으로 올리자고 제안한 값 |
| `agent.gateway_timeout` | **1800** (30분) | 크론 타임아웃 걱정 없음 |
| **`terminal.timeout`** | **180** (3분) | ⚠️ 터미널 명령 상한. content LOOP은 6분 걸렸다 — `--loop-until-done`이 회차를 많이 쓰면 여기서 죽는다 |
| `memory.memory_char_limit` | 4000 | provider `honcho` |
| `memory.user_char_limit` | 2500 | |
| `delegation.max_iterations` | 50 | 멀티에이전트 위원회 |
| `context.engine` | compressor | 긴 대화 자동 압축 |
| `session_reset` | idle 1440분 / 매일 4시 | |
| `curator.enabled` | **false** | `Curator Daily Run`이 멈춰 있던 이유 |
| `smart_model_routing` | 160자·28단어 이하 → Flash | |
| **`fallback_providers`** | **`[]`** | ⚠️ OpenRouter가 죽으면 대안 없음. config 하단에 `fallback_model` 템플릿이 주석으로 있다 (예시가 은퇴 모델 `anthropic/claude-sonnet-4`라 오해 소지) |
| `security.tirith_fail_open` | true | 보안 스캐너 실패 시 통과 |
| `approvals.mode` | manual, timeout 60 | |

---

## Hermes Health Check (2026-07-26 신설)

**설계 원칙: 콘텐츠 평면과 통제 평면을 분리한다.** 오늘 Chief가 Weekly Report 실패를 놓친 이유는 실패 알림이 `#General`에 콘텐츠와 섞여 올라갔기 때문이다. 통제 신호가 콘텐츠 더미에 묻히는 구조였다.

**두 번째 원칙: LLM에게 판단을 맡기지 않는다.** 구 `Agents Group Status Check`는 *"Report overall health: cron status"* 라고만 하고 **방법을 주지 않은 채 "문제 없으면 침묵하라"**고 했다. 그래서 항상 침묵했다. 오늘 발견한 모든 사고가 이 구멍을 통과했다.

### 구성

**스크립트:** `/opt/data/scripts/health_check.py` (결정론적, LLM 판단 없음)

| 점검 태그 | 판정 기준 |
|---|---|
| `[FAIL]` | `last_status == "error"` + `last_error` 180자 |
| `[DELIVERY]` | `last_delivery_error` non-null |
| `[UNPINNED]` | `model is None` ← 오늘 사고를 잡는 검사 |
| `[PAUSED]` | `state == "paused"` |
| `[STALE]` | `last_run_at`이 72시간 초과 |
| `[NEVER]` | `last_run_at` 없음 |
| `[FEED-DEAD]` | Blogwatcher `last_scanned` NULL |
| `[FEED-EMPTY]` | 기사 0건 |
| `[LOOP-FACT]` | `state.json`의 `best_scores.fact_check < 9` |

**크론:** `Hermes Health Check` (`e08683edd147`) · `30 13,23 * * *` = **22:30 / 08:30 KST** · deliver `telegram:-1004486723059` (Ingest) · model pin `deepseek/deepseek-v4-flash`

**프롬프트는 얇다.** 스크립트 실행 → 출력 그대로 게시 → 요약·해석·재작성 금지 → 스크립트가 안 돌면 그 사실을 게시하고 상태를 추측하지 않는다.

### 첫 실행 결과 (2026-07-26 12:38 UTC)

`[UNPINNED]` 0 · `[PAUSED]` 0 · `[STALE]` 0 · `[NEVER]` 0 — **오늘 작업을 독립적으로 검증했다.**
`markets-v2: complete, fact_check=10.0` · `content-v2-kk-style: complete, 8.5` · `content-v2-builds: max_iterations, 7.7`

**`content-v2-builds`는 한 번도 목표 점수에 도달한 적이 없었다.** 삭제가 옳았다.

출력이 요약 없이 코드블록에 그대로 전달되는 것도 확인했다.

### 정리 완료 (같은 날)

- **죽은 피드 12개 제거** → 리포트가 **13건 → 1건**. 감시가 잡음이 아니라 신호가 됐다
- **`[FAIL]`에 실패 시각 추가** → `[FAIL] Weekly Performance Report (2026-07-26T11:00) :: ...` 형태. 이미 고친 문제인지 판단 가능

남은 1건은 pin 수정 **이전**의 Weekly Report 기록이다. 다음 일요일 20:00에 정상 실행되면 사라진다.

---

## Blogwatcher (2026-07-26 소스 보강)

**CLI:** `/opt/data/.local/bin/blogwatcher-cli` · **DB:** `/opt/data/.blogwatcher-cli/blogwatcher-cli.db` (SQLite)
**크론:** `Blogwatcher Daily Feed` (`55448b67735a`) · `0 21 * * 1-5` = 06:00 KST 평일 · 배달 `telegram:...:27` · 스킬 `blogwatcher` 부착

**명령:** `add <name> <url> --feed-url <feed>` / `scan` / `articles` / `blogs` / `read` / `import`(OPML)

### ⚠️ 두 가지 함정

1. **기본 DB 경로가 `~/.blogwatcher-cli/`다.** `docker exec`는 root로 실행되니 `~`가 `/root`가 되어 **엉뚱한 DB에 새로 만든다.** 반드시 `--db /opt/data/.blogwatcher-cli/blogwatcher-cli.db`를 명시하고 `-u hermes`로 실행할 것
2. **중복 판정 기준이 `<url>`이지 `--feed-url`이 아니다.** 같은 도메인의 피드 여러 개를 넣으려면 `<url>` 자리에 피드 URL 자체를 넣는다 (표시용 필드라 무해)

### 스키마

`blogs`: id, name, url, feed_url, scrape_selector, last_scanned
`articles`: id, blog_id, title, url, published_date, discovered_date, is_read, categories

**본문이 저장되지 않는다.** 제목·URL만. 블로그 초안을 쓰려면 URL에서 본문을 가져오는 단계를 따로 만들어야 한다.

### 추가한 거시·통화 피드 6개 (전부 작동 확인)

| 소스 | 피드 URL | 첫 스캔 |
|---|---|---|
| BIS Research Papers | `https://www.bis.org/doclist/bis_fsi_publs.rss` | 25건 |
| BIS Central Bankers Speeches | `https://www.bis.org/doclist/cbspeeches.rss` | 25건 |
| BIS Central Bank Research Hub | `https://www.bis.org/doclist/reshub_papers.rss` | 25건 |
| Fed Working Papers | `https://www.federalreserve.gov/feeds/working_papers.xml` | 15건 |
| Fed FEDS Notes | `https://www.federalreserve.gov/feeds/feds_notes.xml` | 15건 |
| Fed Speeches and Testimony | `https://www.federalreserve.gov/feeds/speeches_and_testimony.xml` | 15건 |

URL은 `bis.org/rss/index.htm`과 `federalreserve.gov/feeds/feeds.htm`에서 직접 확인했다. **추측한 URL을 넣으면 조용히 실패하고 `last_scanned: NULL`로 남는다** — 기존 6개가 그렇게 죽어 있었다.

**Central Bank Research Hub**는 각국 중앙은행 신규 연구를 모아주는 피드라 한국은행 것도 걸린다.

### 기존 21개 중 12개가 죽어 있었다 → **전부 제거 (Chief 승인)**

**한 번도 스캔 안 됨 (6):** Anthropic(403), OpenAI(403), Google AI Blog(404 — `feedproxy.google.com`은 폐기된 서비스), Meta AI(301), Clova AI(Naver), IT World Korea(404)
**스캔되지만 0건 (6):** CoinDesk, The Block, Bloomberg Crypto, VentureBeat, ZDNet Korea, AI Business — `feed_url`·`scrape_selector` 둘 다 없어 가져올 대상이 없었다. 스캔은 "성공"으로 기록되므로 겉보기엔 정상이었다

**2026-07-26 12:48에 12개 전부 제거.** 백업: `blogwatcher-cli.db.bak_20260726`. 되살리려면 `blogwatcher-cli add`로 확인된 URL을 넣으면 된다.

**현재 15개** = 오늘 추가한 거시 6개 + 원래 작동하던 9개:
Hugging Face(833) · Hacker News(209) · Wired(151) · TechCrunch(131) · Decrypt(115) · Ars Technica(90) · The Verge(69) · MIT TR(23) · AWS News(21)

**편중 주의:** Hugging Face 혼자 833건으로 전체의 절반이다. Feed 프롬프트 3단 구조의 [3단] 필터(모델 릴리스·제품 뉴스 제외)로 억제하고 있으나, 근본적으로는 제거 검토 대상.

### Feed 프롬프트 3단 구조로 교체

구 프롬프트는 한 줄이었다 — *"blogwatcher-cli scan 후 새 기사 주제별 한국어 요약"*. 하루 신규가 197건이라 우선순위가 없으면 BIS 논문이 묻힌다.

신 구조: **[1단] 거시·통화(BIS·Fed) 전부 필수 → [2단] 디지털자산 전부 → [3단] AI·테크 최대 8건, 모델 릴리스·제품 뉴스 제외.** 분량을 줄여야 하면 3단부터 줄이고, 1·2단은 생략 금지.

### 남은 과제 (Blogwatcher)

1. **IMF·한국은행 피드 미추가.** 공식 RSS URL을 아직 확인하지 못했다. 확인 전에는 넣지 않는다.
2. **죽은 소스 12개 정리.** OpenAI·Anthropic은 403(봇 차단)이라 되살릴 수 있는지 불확실. CoinDesk 등 6개는 `feed_url`을 찾아 넣으면 될 가능성. **삭제는 Chief 허가 필요.**
3. **Hugging Face 편중.** 833건이 DB 절반. 제거하거나 3단 필터로만 억제할지 판단 필요.
4. **첫 실전 확인:** 2026-07-27(월)은 평일이므로 06:00 KST에 새 3단 구조 Feed가 처음 나온다.

---

## 남은 과제 (LOOP v2)

1. **첫 실전 확인 — 2026-07-27(월) 17:00 KST.** LOOP - Markets가 처음으로 정상 경로를 탄다. #Markets에 브리핑이 오면 성공, 보류 통지가 오면 게이트 작동. 아무것도 안 오면 문제.
2. **fact_check 검증 범위가 좁다.** 티커 별칭에 바로 붙은 숫자만 본다. 정확한 수치 6개 중 2~3개만 검증됐다. 누락: `WTI`(별칭이 `wti oil`), 조사 붙은 `코스닥도`, 괄호 형식 `S&P 500(7411.98`. 별칭·구분자 확장 여지.
3. **LLM judge 파싱 실패 폴백이 아직 5.0이다** (`loop.py` 376행). `fact_check`와 달리 조용히 중간 점수를 준다.
4. **`run_with_key.sh`가 `--config examples/content-v2.yaml`을 하드코딩**하고 있다. argparse 최후승 규칙으로 덮여서 우연히 작동한다. 세 크론 모두 명시적으로 `--config`를 넘기므로 지금은 무해하지만 기본값을 지우는 게 안전하다.
5. **`--reset`이 과거 iteration 폴더를 지우지 않는다.** `state/*/iterations/`에 잔여물이 쌓여 회차 수 집계에 쓸 수 없다. 회차 수는 `state.json`의 `current_iteration`으로 봐야 한다.
6. **크론 타임아웃 여유는 미확인이나 위험은 낮아졌다.** 측정치: markets 1~2회 수렴, content 6회·6분 6초(10:50:41→10:56:47, 회차당 약 1분). 오래 걸리는 content LOOP 두 개가 폐기됐으므로 당면 위험은 해소. markets가 회차를 많이 쓰기 시작하면 재검토.
7. **`loop-config.yaml`(템플릿)은 원본 그대로다.** verifier 3개 전부 문체 채점, `name: "my-loop-v2-task"` 같은 미기입 자리표시자. 새 LOOP을 만들 때 이걸 복사하면 팩트체크 없는 설정이 또 생긴다.

---

**설치된 스킬**

| 스킬 | 출처 |
|---|---|
| `kk-writing-style` | KK 전용 (2026-07-26). 마스터 프롬프트를 읽어 적용하는 로더 |
| `paper-to-blog` | KK 전용 (2026-07-26). 페이퍼 → 수치 검증 → 각도 선정 → 문체 적용 |
| `session-audit` | KK 전용 (2026-07-26). 4월 `starter-session-audit.skill`을 한국어·KK 규칙으로 각색 |
| docx / pptx / xlsx / pdf / morning / schedule / skill-creator / setup-cowork | Anthropic 기본 |

---

## 발행 글 기록 (메타포 재탕 방지용)

| 날짜 | 제목 | 닻 메타포 | 카테고리 |
|---|---|---|---|
| 2026-07-22 | 포드가 노동자에게 두 배를 준 이유, AI는 그걸 잊었다 | 포드의 방정식 / 고객을 없애는 기계 | Macro |
| 2026-07-06 | "지우개를 쥔 자" — 화폐의 진화 | 장부와 지우개 | — |
| 2026-07-04 | 지수는 두 배, 엔진은 하나 — 코스피 랠리의 해부 | 단발기 / 엔진 | Equity |
| 2026-06-27 | 한국 디지털자산 규제환경 분석 (딥리서치 산출물, `Research/Digital-Assets/`) | — | Digital |
| 2026-06-21 | Broken Money 서평 | 짜장면 지수 | — |
| 2026-06-20 | 청구서는 아직 도착하지 않았다 | — | — |
| 2026-04-25 | 신현송 신임 한국은행 총재 취임사 읽기 | — | — |
| 2026-07-05 | 커즈와일, 도착 시간을 늘 일찍 부르는 내비게이션 | 내비게이션 | Digital |

*새 글 발행 시 이 표에 한 줄 추가하고, 마스터 프롬프트 §7 하단 "발행 후 등록" 5개 항목을 반드시 수행할 것.*

**2026-07-26 감사에서 드러난 것:** 등록 의무가 어느 문서에도 없어서 "이건 내 해석이지, 공식 전망이 아니다"가 **5편 6회**, "Skin in the Game" 헤더가 **2회** 반복됐다. Chief가 지적한 문제의 원인이 이 구멍이다. v3.3에서 §7에 등록 절을 신설해 막았다.

**Chief 판단 대기:** 2026-07-22(바벨 전략)과 kurzweil_post(자산 희소성)에 투자 면책 문구가 누락돼 있다. 소급 적용 여부.
