> Production editorial worker: see [EDITORIAL_DESK.md](../EDITORIAL_DESK.md). The prototype below remains for standalone research testing.

# KKandFriends Research Lab — Local Prototype

Production에 연결되지 않은 Weekly Editorial Package Generator다. 현재 코드는 Vercel cron, Supabase, Telegram, GitHub main branch를 호출하지 않는다.

## 현재 구현 범위

- 다섯 스트림 후보 계약 검증
- 코드 기반 가중 점수와 70점 gate
- 스트림별 최고 후보 1개와 서로 다른 상위 2개 선정
- primary source, 8주 중복, 이해상충 gate
- dossier의 검증 사실·수치 2–3개·반론·반증 조건 검사
- 승인 경험 deny-by-default
- Master Prompt → Universal Router → Writing OS 순서의 writer prompt 조립
- KK 원고의 결정론적 QA
- Saturday/Sunday Weekly Editorial Package Markdown 생성
- discovery → research → writer 모델 chain orchestration과 단계별 fallback audit
- source URL allowlist, stale signal, tracking URL, 중복, private-network 차단
- 128-bit 1회용 승인 토큰과 draft hash 기반 상태 전이

## 실행

PowerShell의 npm script policy와 무관하게 Node로 직접 실행할 수 있다.

```powershell
node --test
node .\bin\dry-run.js
node .\bin\collect-signals.js
node .\bin\live-dry-run.js
```

fixture는 `example.test`를 사용하는 합성 데이터다. 실제 뉴스나 기존 글의 품질을 주장하지 않는다.

## 아직 의도적으로 연결하지 않은 것

- web search와 source ingestion
- LLM provider API
- DB migration
- Telegram 승인 UI
- GitHub commit과 Vercel deploy
- 실제 사이트 HTML renderer

다음 단계는 외부 adapter를 인터페이스 뒤에 붙이는 것이다. core pipeline 테스트가 계속 통과해야 adapter를 활성화할 수 있다.

## Production 연결 조건

다음 항목은 core 바깥의 adapter로만 구현한다.

1. source collector는 raw signal만 반환하고 신뢰등급은 `src/signals.js`가 다시 계산한다.
2. model provider는 `invoke({ stage, model, prompt, candidateId })` 계약만 구현한다.
3. DB는 `src/approval.js`의 상태 전이를 조건부 update로 보존해야 한다.
4. site publisher는 canonical article을 기존 site template에 맞추되, main branch write는 별도 feature flag가 없으면 거부해야 한다.
5. Telegram은 token 원문을 로그에 남기지 않고 URL에만 전달한다.

실제 키를 연결하기 전까지 모든 실행은 synthetic fixture 또는 mock adapter만 사용한다.

`live-dry-run.js`도 웹사이트·DB·Telegram·GitHub에는 쓰지 않는다. 공식 feed를 읽고 모델을 호출한 뒤 결과를 stdout으로만 출력한다. 필요한 환경변수 형식은 `.env.example`에 있으며 실제 key 파일은 만들지 않는다.
