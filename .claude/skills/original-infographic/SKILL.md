---
name: original-infographic
description: |
  KK Original 글에 붙일 인포그래픽(PNG 한 장)을 만든다. KK Original 초안이 끝난 뒤,
  또는 KK가 "Original 인포그래픽", "원문 카드", "이 글 인포그래픽 만들어줘"라고 할 때 쓴다.
  Daily·Weekly용은 별도 루틴이 있으니 이 스킬이 아니다.
---

# KK Original 인포그래픽 절차 (2026-11-04)

도구는 `scripts/desk-infographic.mjs` 하나다. 새 렌더러를 만들지 않는다.
Original은 Daily·Weekly와 달리 **이미지를 본문에 직접 넣을 수 있다**(`/write-original`, `js/attachments.js`: `![이미지](주소)`, 이미지 5MB).

## 0. 전제

- 글(본문)이 먼저 끝나 있어야 한다. `kk-writing-engine` → `kk-humanizer` + `humanizer`를 거친 최종본을 기준으로 한다.
- **카드는 글을 요약하는 것이 아니라 글의 닻 숫자를 한 장에 모으는 것**이다. 본문에 없는 숫자, 새 주장, 새 해석은 넣지 않는다.
- 답변과 카드 문구는 존댓말·한국어, em dash(—) 0개, 날짜는 서울시간(KST).

## 1. 무엇을 담을지 정한다 (KK에게 되묻지 않고 초안부터)

1. 본문에서 출처·시점이 붙은 핵심 수치 2~3개를 고른다 → `stats` 칸(2~3개).
2. 수치가 시간 순서나 단계면 `list`(최대 6줄), 비교면 `bars`(2개 이상)를 **하나만** 더한다.
3. `title`은 본문 제목의 강한 비유를 그대로(재작성 금지), `subtitle`은 "누가 이득이고 누가 대가를 치르는지" 한 줄을 본문과 같은 표현으로.
4. `eyebrow`는 `KK ORIGINAL · <분야>` (분야는 Macro·Korea·Equity·Digital Assets·AI·Global·Manifesto 중 글의 분야).
5. `sources`는 본문 하단 출처와 같은 곳, `asOf`는 숫자의 기준일(YYYY-MM-DD, 서울 기준).
6. 디지털 자산 글이면 `"digitalAsset": true`(공개 문구가 카드에 자동으로 붙는다). 투자 면책은 DISCLAIMER가 자동으로 붙는다.
7. 한국 물가·인구·가계부채·금리·공시 숫자는 먼저 `NODE_USE_ENV_PROXY=1 OPENLAW_BASE=http://www.law.go.kr node scripts/stats-card.mjs`의 값을 쓴다. 두 출처가 "일치"인 값만 확정 숫자로, "확인 필요"는 카드에 넣지 않는다.
8. 이해상충 주제(JB금융·부산시·Bitplanet·CROWDY)면 카드에도 중립 분석가 시점만 쓰고, 끝에 `HUMAN APPROVAL REQUIRED`를 KK에게 알린다.

## 2. 명세 작성과 생성

명세는 스크래치 폴더에 둔다(레포에 커밋하지 않는다).

```bash
node scripts/desk-infographic.mjs spec.json out.png --body body.txt
```

- `body.txt`는 최종 본문 전체. 카드의 숫자가 본문에 없으면 스크립트가 거절한다(31 이하 정수는 날짜·개수로 통과). **거절되면 카드를 고치지 말고 본문에 그 숫자가 왜 없는지부터 확인**한다. 본문에 없는 숫자는 카드에도 못 쓴다.
- 높이 1,350px 초과면 거절한다 → 항목을 줄이거나 문구를 줄여 다시.
- 생성된 PNG는 `Read`로 열어 눈으로 확인한다: 글자 잘림, 네모(□) 깨짐, 숫자 오탈자, 단위·부호(마이너스) 누락.
- 실패해도 글 작성은 막지 않는다. 검토 메모에 "인포그래픽: 생략(사유)"만 적는다.

## 3. 전달

- 에이전트는 **발행·업로드를 하지 않는다.** PNG와 명세 JSON, 한 줄 검증 메모(어느 본문 문장에서 어느 숫자를 가져왔는지)를 KK에게 전달한다.
- KK가 `/write-original`의 첨부(이미지)로 올리면 본문에 `![이미지](주소)`가 들어가고, 글 안 원하는 자리에 둔다. 이미지 5MB 이하, PNG가 커지면 JPEG로 변환한다.
- 본문에는 이미지 아래 한 줄 캡션(출처·기준일)을 둔다. 대체 텍스트는 카드 제목으로.
- Instagram 제목 카드(`/card/original/<slug>.jpg`)는 자동이고 이 인포그래픽과 별개다.

## 4. 하지 않는 것

- 카드에 새 해석·전망·종목 추천 넣기, 본문에 없는 숫자 넣기.
- 이미 쓴 메타포와 다른 비유를 카드에서 새로 만들기.
- `scripts/desk-infographic.mjs`의 색·글꼴·폭을 글마다 바꾸기(사이트 카드와 같은 룩 유지).
