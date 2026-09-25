# KK ORIGINAL 편집실

## 상태

로컬 구현 완료. 배포와 데이터베이스 마이그레이션은 별도 운영 승인 전에는 실행하지 않는다.

## 최초 설정

1. Supabase SQL Editor에서 `db/migrations/017_kk_original_posts.sql`을 실행한다.
2. 애플리케이션을 배포한다.
3. Chief 계정으로 로그인한 뒤 `/me`의 `＋ KK ORIGINAL 글쓰기` 또는 `/write-original`을 연다.

마이그레이션을 먼저 적용해야 한다. 코드를 먼저 배포하더라도 기존 정적 THOUGHTS와 DAILY DESK는 유지되지만 새 편집실은 테이블이 없다는 안내를 표시한다.

## 사용법

- `임시저장`: 공개하지 않고 편집실에 보관한다.
- `발행하기`: `/original/:slug`, THOUGHTS 목록, RSS, 사이트맵에 노출한다.
- `발행 업데이트`: 발행일과 공개 주소를 유지하면서 본문과 메타데이터를 갱신한다.
- `발행 취소`: 글을 삭제하지 않고 비공개 초안으로 되돌린다.
- 이미지: 버튼, 끌어놓기, 붙여넣기로 5MB 이하 이미지를 `post-images` 버킷에 업로드한다.

## 보안 및 데이터

- `kk_original_posts`는 `member_posts`와 분리된다.
- 공개 사용자는 `published` 행만 읽을 수 있다.
- 삽입과 수정은 데이터베이스의 `is_admin()` 정책이 Chief 계정에만 허용한다.
- 원문 HTML은 저장하지 않는다. Markdown을 HTML escape 후 렌더링한다.
- 영구 삭제 UI와 DELETE 권한은 제공하지 않는다.

