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

**크론 21개** — Markets 4 / Blogs 2 / Builds 3 / Captures 1 / General 3 / DM 5 / 내부 3. `Curator Daily`만 중단 상태, 나머지 정상.

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

### 남은 과제

1. **cron이 낮은 점수로 발행을 막는지 미확인.** `loop.py`는 점수만 계산하고 `state`를 JSON으로 내보낼 뿐 차단하지 않는다(813~818행). 차단 여부는 Hermes cron 프롬프트에 달려 있다. **여기가 뚫려 있으면 오늘 조인 점수는 기록용에 그친다.**
2. **fact_check 검증 범위가 좁다.** 티커 별칭 목록에 붙은 숫자만 본다. 위 산출물에서 정확한 수치 6개 중 2개만 검증됐다. `WTI`(별칭이 `wti oil`), 조사가 붙은 `코스닥도`, 괄호 형식 `S&P 500(7411.98` 등이 누락. 별칭·구분자 확장 여지.
3. **`content-v2.yaml`(블로그)·`content-v2-builds.yaml`은 손대지 않았다.** `loop-config.yaml`(템플릿)도 원본 그대로 — verifier 3개 전부 문체 채점이고 팩트체크가 없다.
4. `run_with_key.sh`가 매 실행마다 API 키 길이·앞 10자를 stdout에 출력한다. 로그에 키 흔적이 남는 원인.
5. LLM judge의 파싱 실패 폴백이 아직 5.0이다(376행). `fact_check`와 달리 조용히 중간 점수를 준다.

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
