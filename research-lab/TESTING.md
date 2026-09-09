# Research Lab Test Strategy

## 현재 자동화된 범위

### Unit

- 점수 clamp와 가중합
- 다섯 스트림 계약과 threshold
- primary source·중복·이해상충 탈락
- dossier의 사실·수치·source ID 연결
- JSON fence·주변 문장·문자열 내부 괄호 추출
- 경험 deny-by-default
- 금지 표현·메타포 재탕·면책·byline·길이 검사
- 본문에 없는 수치·경험 metadata 차단
- 반복 문장·중복 문단 차단
- URL canonicalization과 private-network 차단
- 승인 token hash·만료·본문 hash·이중 클릭 차단

### Integration

- discovery → research → writer → deterministic QA → 주간 package
- 첫 모델 실패 후 다음 모델 fallback
- 서로 다른 스트림 2개를 Saturday/Sunday slot에 배정
- 한 원고라도 QA에 실패하면 전체 package를 BLOCKED 처리

### Adversarial fixtures

- 모델이 allowlist 밖 source ID를 생성
- 모델이 승인되지 않은 1인칭 성과를 생성
- metadata에만 수치·경험을 적고 본문에서는 누락
- 금지된 경험 header와 재사용 metaphor 삽입
- 승인 요청 뒤 원고 변경
- 만료 토큰, 재클릭, 다른 publish attempt의 완료 요청

## 적용 전에 남은 외부 검증

- 실제 source collector의 HTTP timeout·rate limit·본문 추출
- 실제 모델별 JSON 준수율과 fallback 비용
- 실제 Master Prompt 전체 길이에서 provider token limit
- Telegram URL button과 실제 개인 chat 제한
- 임시 DB에서 동시 update 경합
- GitHub test branch commit과 Vercel Preview
- 기존 site template에 대한 visual regression
- Saturday/Sunday 09:00 KST의 timezone test

외부 검증은 키와 test target이 준비된 뒤 실행한다. 실패 시 core gate를 약화시키지 않고 adapter를 수정한다.
