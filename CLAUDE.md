# CLAUDE.md — kkandfriends 작업 기준

> 새 세션은 백지에서 시작한다. 매번 다시 물어보지 않도록 확인된 사실만 여기 적는다.
> 추측은 넣지 말 것. 확인 안 된 항목은 "확인 필요"로 표시한다.

## 환경

- KK는 **Windows + Android** 사용. macOS/iOS 아님 — 경로·명령어 안내는 항상 Windows 기준으로.
- Obsidian 볼트 루트: `C:\KK`
  - KK Master Writing Prompt 원본: `C:\KK\2 Area\Personal\PROMPTS\KK Master Writing Prompt - Blog.md`
  - OneDrive 마스터: `C:\Users\<계정>\OneDrive\KK&FRIENDS\_KK_Persona_Master\`
- 이 레포가 도는 곳은 원격 컨테이너다. KK님 로컬 `C:\` 드라이브에는 접근할 수 없다.
- **KK에게 답할 때는 항상 존댓말.** 불릿 끝도 "~다"가 아니라 "~입니다/~합니다"로 쓴다
  (2026-10-02 KK 지적). 이 파일의 "~다" 문체는 메모용이고 답변 문체가 아니다.

## 금지 문장 (2026-10-14 KK 지시, 예외 없음)

- **"이건 내 해석이지, 공식 전망이 아니다"와 그 변형은 어떤 글에도 쓰지 않는다.** 반복돼서 KK가 무조건 빼라고 했다.
  KK Original·THOUGHTS·라운지·KK Daily/Weekly·브리핑·루틴 초안·LinkedIn 글 모두 해당한다.
- KK 개인 선호(claude.ai), kk-writing-engine·kk-humanizer 스킬, 볼트의 KK Master Writing Prompt 체크리스트에 이 장치가 "최소 1회"로 남아 있어도 **이 규칙이 이긴다.**
  해석과 사실을 가를 필요가 있으면 문장 안에서 "~로 본다", "~라면" 정도로 처리한다. 별도 고지 문장은 만들지 않는다.
- 코드 쪽은 이미 막혀 있다: `research-lab/src/constants.js` `BANNED_LITERAL_PHRASES`, `lib/briefs/*.js`(지시문 금지 + 출력에서 줄 삭제).
- 발행된 옛 글(`posts/` 13편 등)에 남은 문장은 KK가 따로 지시하기 전까지 그대로 둔다.

## KK 글쓰기 절차 (2026-10-19 KK 지시, 모든 KK 목소리 글)

- **쓰기 전에 두 스킬을 실제로 불러 읽는다:** `anthropic-skills:kk-writing-engine`(목소리·채널 규격·사실 규율·리스크 게이트) → 초안 → `humanizer`(레포 `.claude/skills/humanizer/SKILL.md`)로 최종 다듬기.
  기억이나 claude.ai 개인 선호의 옛 템플릿으로 대신 쓰지 않는다. KK가 "왜 스킬 안 쓰냐"고 지적했다(10/19, 디지털자산기본법 글).
- **정반합 템플릿을 겉으로 드러내지 않는다.** 개인 선호의 "정→반→합" 조리법은 옛 방식이다. 엔진 기준으로 흐름은 뼈대로만 두고,
  "시장은 이렇게 본다 → 이 말은 절반만 맞다 → 흉터·면역·진화로 재프레이밍" 같은 단계가 읽히면 실패다. 매 글 "흉터가 면역이 된다" 류 결론도 반복 금지.
- 블로그(KK Original) 분량은 **기호·공백 제외 2,000~2,500자**(장문 3,000). 출처·확인 메모는 본문 밖.
- 메타포는 1개, `posts/` 아카이브에 이미 쓴 단어인지 grep으로 확인한다(예: "공회전"은 이미 씀).
- 마무리는 두 줄 대비형과 열린 질문을 글마다 번갈아 쓴다. 💡 1회, Bottom line 1회.
- 1인칭 경험은 엔진의 화이트리스트(JPM·BofA·ANZ 재직, 1999 홍콩, 2008 GFC, ESG 사이클, Bitplanet BTC treasury) 안에서만. 그 밖의 장면은 KK에게 묻는다.
- 면책 문구는 엔진 원문 그대로: "본 자료는 정보 제공 목적이며 특정 자산의 매수·매도 권유가 아닙니다. 모든 투자 판단과 책임은 투자자 본인에게 있습니다."
- 이해상충 대상(Bitplanet·CROWDY·JB금융·부산시) 주제는 초안 끝에 `HUMAN APPROVAL REQUIRED`를 달고 KK에게 따로 알린다.

## kk-master-writing 스킬

- **Claude 계정에 업로드된 커스텀 스킬**이다 (`source: custom`, `skillId: skill_013CsGsP8rWuHXnY4RoGVgD2`).
  로컬 파일(`~/.claude/skills/`)은 존재하지 않는다.
- 세션 시작 시 계정 → 컨테이너로 내려받는다. **컨테이너 사본을 고쳐봐야 세션이 끝나면 사라진다.**
  영구 반영하려면 claude.ai → 설정 → Skills 에서 재업로드해야 한다.
- 진짜 원본은 볼트 파일이다. 스킬은 사본 — 충돌하면 볼트가 이긴다.
- **알려진 결함:** 패키지에 `SKILL.md`만 있고 `references/` 폴더가 빠져 있다.
  §10이 참조하는 `metaphor-dictionary.md`(이미 쓴 메타포 장부)와 `forbidden-patterns.md`가 없어서,
  메타포 재탕 방지 장치가 작동하지 않는다. 글 쓸 때 `posts/` 아카이브를 직접 대조할 것.

## 뉴스레터·외부 채널

- **Stibee는 2026-09-26 KK 결정으로 중단.** 구독 해지, 남은 구독자는 KK 본인뿐. 사이트의 Stibee 폼·연동은 전부 제거했다.
  `privacy.html`에서도 뉴스레터 수집 항목·보유기간·스티비 위탁 행을 삭제했다 (KK 승인, Version 1.2, 2026-09-26).
- 독자 확보 주 채널은 **LinkedIn 회사 페이지** https://www.linkedin.com/company/kkandfriends (2026-09-26 개설).
  글은 페이지에 올리고 KK 개인 계정은 공유만 한다.
  디지털 자산 글에는 "필자는 디지털 자산 관련 상장사에 재직 중입니다" 공개 문구를 붙인다.
- **자동 공유 (2026-10-06 KK 결정):** 새 공개 글(KK ORIGINAL·THOUGHTS)이 발행될 때마다 회사 페이지에 **글마다 1개씩 자동 게시**한다.
  같은 날 구조 변경으로 KK Daily·Weekly는 멤버 전용이 되어 피드에서 빠졌고, Daily Markets도 넣지 않는다(KK 요청 없음, 하루 2편이라 페이지를 덮음).
  예전 "초안까지만 에이전트, 게시는 KK" 규칙은 이 자동 공유에 한해 바뀌었다. 라운지 글은 **제외**(멤버 전용·다른 회원 글).
  - 구조: `/linkedin.xml`(`api/desk.js` `view=linkedin`, `lib/feeds.js` `linkedinItems`) → Zapier Zap「RSS by Zapier: New Item in Feed」→「LinkedIn: Create Company Update」.
    Zap은 KK의 Zapier 계정에 있다(에이전트가 Zap을 만들 수 없음). 이름「RSS to LinkedIn KK Company Update」, 계정 `LinkedIn KK FRIENDS #2`, company_id `143920689`.
    **2026-10-09 썸네일 카드 게시 확인(KK).** LinkedIn 단계 칸: Update Content=Description · Image Type=`preview_thumbnail` · Media URL=Link ·
    Image=`https://www.kkandfriends.com/og-image.png`(고정 주소 직접 입력) · Preview - Title=Title · Preview - Description=Description.
    Zap을 고칠 때 Test step은 실제 게시된다 — 중복을 원치 않으면 Skip test 후 Publish.
  - 피드가 편집을 대신한다: `LINKEDIN_SINCE`(2026-10-06 00:00 KST) 이후 발행분만, "제목:/요약:" 라벨 제거,
    디지털 자산 글(분류 또는 제목·요약의 비트코인·스테이블코인 등)에 공개 문구 자동 추가.
  - **썸네일 (2026-10-08):** LinkedIn API는 웹 공유창과 달리 페이지의 og:image를 읽지 않는다 → 이미지 주소를 안 넘기면 글자만 올라간다.
    피드 항목마다 `<enclosure>`·`<media:content>`로 `/og-image.png`를 넣었다(`LINKEDIN_IMAGE`). Zap의 이미지 칸에 이 값을 연결해야 한다.
  - 저장소를 못 읽으면 `/linkedin.xml`은 **503**을 낸다(부분 피드 금지). 부분 피드 후 전체 피드가 오면 Zapier가 옛 글을 새 글로 보고 재게시하기 때문.
  - 발행 후 LinkedIn까지 최대 ~20분(Zapier 무료 폴링 15분 + 피드 캐시 5분). 수정·발행 취소 후 재발행은 다시 올라가지 않는다(같은 주소).

- **Instagram 자동 공유 (2026-10-09 KK 결정):** LinkedIn과 같은 글(KK ORIGINAL·THOUGHTS, `LINKEDIN_SINCE` 이후)을 KK&FRIENDS 전용 Instagram 비즈니스 계정에 글마다 1개씩.
  - 구조: `/instagram.xml`(`view=instagram`, `lib/feeds.js` `instagramItems`) → Zapier「RSS by Zapier」→「Instagram for Business: Publish Photo」. Zap은 KK가 만든다.
    Zapier 연결은 `Instagram for Business kiseok.kim.1969@gmail.com` (#1·#2, 2025-03 생성) — 어느 쪽이 KK&FRIENDS 계정인지 확인 필요.
  - 이미지: 글마다 1080×1350 **JPEG** 제목 카드 `/card/<original|posts>/<slug>.jpg` (`lib/ig-card.js`, resvg + jpeg-js, CDN 하루 캐시).
    Instagram API는 JPEG만 받는다. 한글 글꼴은 `fonts/Pretendard-*.otf`(OFL)를 `vercel.json` `includeFiles`로 함수에 싣는다 — 시스템 글꼴 없음.
  - 캡션: 제목 / 요약 / (디지털 자산이면 공개 문구) / "전문은 프로필 링크 kkandfriends.com 에서" / 해시태그. 줄바꿈 유지(`keepLines`). 캡션 링크는 눌리지 않는다.
  - **2026-10-10 Zap 시험 게시 성공(KK).** 칸: Media=Enclosure Url, Caption=Description, 계정 KK&FRIENDS. 프로필 웹사이트 칸에 kkandfriends.com 필요.
  - 계정: **kk_n_friends**, Instagram 비즈니스 ID `17841470883958323`(Facebook 페이지「KK & Friends」`248786668312403`에 연결). Zap 이름「RSS to Instagram Photo Post」.
  - **에이전트 점검 도구 (2026-10-11 KK 승인, 켜 둠):** 에이전트 Zapier MCP에 Instagram for Business가 켜져 있다.
    `make_api_get_request`로 `GET /17841470883958323/media?fields=id,timestamp,permalink,caption`(최근 게시물),
    `/content_publishing_limit?fields=quota_usage`(24시간 API 게시 수)를 조회할 수 있다. **게시(`publish_media_v2`)는 KK 승인 후에만.**
  - 2026-10-11 사고: Zap은 Weekly 맛보기를 정상 게시했는데 KK가 테스트 중복분을 지우다 같이 지움(quota_usage 3건으로 확인) → 에이전트가 KK 승인 후 재게시.
    교훈: Zap 수정 화면에서 Test step = 실제 게시. 중복을 지울 땐 게시 시각부터 확인.
- **Facebook 페이지 자동 공유 (2026-10-10 KK 요청):** 코드 변경 없이 `/linkedin.xml`을 그대로 쓴다(같은 글·같은 공개 문구).
  Zapier「RSS by Zapier」→「Facebook Pages: Create Page Post」, Message=Description, Link URL=Link. Facebook은 링크의 og:image를 스스로 읽어 카드를 만든다.
  Zapier 연결 `Facebook Pages kiseok.kim.1969@gmail.com`(2025-05 생성). **2026-10-10 Zap 시험 게시 성공(KK).** Photo 칸은 비워 둔다(비워야 링크 카드).
  **공식 페이지는「KK & Friends」(띄어 씀) ID `248786668312403`** (2026-10-10 KK 확인). 목록의「KK&Friends」(붙여 씀, `649048678290175`)는 다른 페이지 — 고르지 말 것.
  이 Facebook 연결을 쓰는 다른 Zap이 1개 있다("Used in 1 Zap") — 같은 페이지에 올리는 것이면 중복 게시 위험, 확인 필요.
  Zap 3개(LinkedIn·Instagram·Facebook)가 글 1편당 작업 3건을 쓴다 — Zapier 무료 한도(월 100건)라면 한 달 약 33편까지. KK 요금제 확인 필요.
- **KK Weekly 맛보기 공유 (2026-10-11 KK 결정, ② 안):** Weekly는 멤버 전용 그대로, 새 Weekly가 발행되면 세 채널에 **잠금 맛보기**로 올라간다. KK Daily는 올리지 않는다(주 6편이 채널을 잠긴 글로 덮음).
  - `/linkedin.xml`·`/instagram.xml`에 `editorial_drafts`의 발행된 `*-weekly`만 추가(`api/desk.js` `weeklyItems`, 내부 토큰으로 읽음 — VPS 변경 없음).
    제목 `🔒 KK Weekly · 제목`, 본문 = 요약 + `WEEKLY_TEASER_NOTE` + 가입 신청 링크(`/join`). Instagram은 `/card/weekly/<slug>.jpg`(MEMBERS ONLY 카드) + `#KKWeekly`.
  - Weekly를 못 읽으면 공유 피드 전체가 503(부분 피드 금지 원칙 그대로).
  - 비멤버가 `/desk/<날짜>-weekly`를 열면 **200 + noindex**로 제목·요약·가입 안내를 보여준다(Facebook은 403 페이지로 카드를 못 만든다). Daily는 그대로 403.
- **og-image.png (2026-10-10 다시 만듦, KK 지시):** 예전 파일은 원본이 없고 한글 줄이 네모(□)로 깨졌으며 "200+ Founding Members" 등 사실과 다른 숫자 칸이 있었다.
  숫자 칸을 빼고 한글 줄을 "경험 많은 금융 전문가의 동료 토론과 공개정보 기반 시장 관점."으로 넣었다. 다시 만들 땐 `node scripts/build-og-image.mjs`.
  카카오톡·LinkedIn은 미리보기를 캐시하므로 예전에 공유된 링크는 한동안 옛 이미지로 보일 수 있다.

- **라운지 글 공유 미리보기 (2026-10-19 KK 지적):** 라운지 글(`/voices?id=…`)의 Share → LinkedIn이 "Cannot display preview"였다.
  원인: `robots.txt`가 `/voices`를 막아 LinkedIn 미리보기 봇이 못 읽었고, `voices.html`에 og 태그가 없었다.
  수정: `robots.txt`에 미리보기 봇 전용 그룹(LinkedInBot·facebookexternalhit·Twitterbot·kakaotalk-scrap 등)을 두고 `/voices`·`/desk` 등을 허용, 검색엔진 규칙은 그대로.
  `voices.html`에 **일반 카드**(「KK & Friends · 멤버 라운지 글」 + og-image) — 글 제목은 넣지 않는다(멤버 전용·다른 회원 글). 페이지는 계속 noindex.
  LinkedIn은 미리보기를 캐시하므로 이미 실패한 주소는 https://www.linkedin.com/post-inspector/ 에서 다시 읽혀야 한다.

## 검색엔진 등록 (2026-09-26)

- 도메인 DNS는 **Hostinger**(hPanel → 도메인 → kkandfriends.com → DNS)에서 관리. `www` CNAME → Vercel, Resend·Hostinger 메일 기록이 있다. 기존 기록은 건드리지 말 것.
- **Google Search Console**: 도메인 속성, DNS TXT로 인증 완료. sitemap 제출함 (첫 상태 "Couldn't fetch" — 재확인 필요).
- **네이버 서치어드바이저**: `index.html`의 `naver-site-verification` 메타 태그로 인증. 지우지 말 것.

## VPS 운영 (2026-09-28 기준, 확인된 사실)

- 서버: Hostinger VPS `srv1619910`. SSH는 **Tailscale로만** 열려 있다(공개 22번 포트 없음, 키 로그인만).
  이 원격 컨테이너에서는 VPS·`api.kkandfriends.com`·Supabase 모두 접속이 막혀 있다 →
  VPS 작업은 **명령을 만들어 KK가 붙여넣게** 하고, 결과를 받아 판독한다.
- VPS에는 레포 git 사본이 없다. 배포는 GitHub tarball을 받아 푼다 (레포는 public).
- 운영 스택 (이름은 staging이지만 **운영**이다):
  - API + PostgreSQL + Caddy: `/opt/kkf-community-staging`, `compose.staging.yaml`, 프로젝트명 `kkf-staging`,
    env는 `.env.staging`. API만 재시작: `docker compose -f compose.staging.yaml up -d --no-deps --force-recreate api`
  - 라운지 자동화 컨테이너: `/opt/kk-briefs/ops/briefs` (`ops/briefs/README.md`)
    — 평일 07:00 오늘의 시작(07:20 재시도), 17:30 오늘의 마감(17:50 재시도), 월 09:00 주간 다이제스트 이메일.
    **휴장일 (2026-10-13~):** 오늘의 마감은 코스피의 마지막 거래일(`sessionDate`, Yahoo `regularMarketTime`)이 오늘이 아니면 발행하지 않는다(잠금 해제, `skipped: 'market closed'`).
    10/9 한글날에 10/8 숫자를 "오늘"로 쓴 마감이 발행된 뒤 넣었다. 오늘의 시작(미국 휴장) 쪽 검사는 아직 없다.
    다이제스트(2026-10-06~): 라운지 기준이라 Daily Markets 브리핑은 빼고, 그 주 발행된 KK Daily·Weekly를 맨 위에 싣는다(`digestContext`의 `editions`).
    글쓰기 모델은 OpenRouter 순서대로 `deepseek/deepseek-v4.1-flash`(2026-09-10 등록, 확인 시점 최신) → `deepseek/deepseek-v4-flash-0731:nitro`(Desk와 같음) → `z-ai/glm-5.3-flash`.
    GLM은 2026-09-28 한국 마감 지시문에서 3회 연속 빈 답(`finish_reason: length`)을 내서 마지막 예비로 내림. 한 편당 비용 약 $0.001. 실패·설정 누락은 KK 텔레그램으로 경고.
  - Editorial Desk: `/opt/kk-editorial` (별도 컨테이너, 06:00~08:00 KST). 브리핑과 섞지 말 것.
    **2026-10-12 KK 결정으로 중단. 2026-10-13 `kk-editorial-runner-v11`(`kk-editorial:20261011-voice`) stop·restart=no 확인(삭제 아님, 옛 v2~v9 컨테이너는 이미 없음).** 같은 날짜 초안 충돌로 초안이 제대로 올라가지 않아,
    요일별 초안은 Claude Code 루틴 「KK Daily·Weekly 초안 → 텔레그램」(`trig_01Vx8uKhoDwxcUR7ZvjA3has`, 매일 06:47 KST)으로 바꿨다.
    루틴은 텔레그램으로 제목·요약 / 본문 / 출처·검토 메모 3개를 보내고, KK가 `/write-desk`에 복붙·수정·발행한다. 사이트에 직접 올리지 않는다.
    **인포그래픽 (2026-10-19 KK 요청):** 초안마다 PNG 한 장을 `scripts/desk-infographic.mjs`(JSON 명세 → 1080폭 PNG, resvg + Pretendard)로 만들어 텔레그램 파일로 함께 보낸다. KK가 `/write-desk` 첨부 파일로 올린다(본문엔 URL 불가).
    `--body body.txt`가 본문에 없는 숫자가 카드에 있으면 거절한다(31 이하 정수는 날짜·개수라 통과). 높이 1,350px를 넘으면 거절 → 항목을 줄여 다시. 카드 생성이 실패해도 초안 발송은 막지 않고 검토 메모에 "인포그래픽: 생략(사유)"를 적는다.
    아래 Desk 기록은 되살릴 때를 위한 옛 기록이다.
    실행 컨테이너는 compose가 아니라 `docker run`으로 띄운 `kk-editorial-runner-vN`이다. **현재 이름은 매번 확인할 것:**
    `docker ps -a --filter name=kk-editorial-runner --format '{{.Names}} | {{.Image}} | {{.Status}}'` (Up 하나, 나머지는 멈춘 예전 버전, restart=no).
    공통 옵션: `--restart unless-stopped --env-file /opt/kk-editorial/editorial.env -e TZ=UTC -v kk-editorial-state:/state`.
    2026-10-05 이력: v2-old(`recovery-20260927-v5`) → v3(`20261005-humanizer`) → v4(`-hostrule`) → v5(`-plain`) → v6(`-feeds`, 출처 확대) → v7(`-retry`, 후보 재시도) → v8(`-review`, 검수 판정·DeepSeek) → 2026-10-08 v9(`20261008-length`, Daily 자동 초안 1,500~2,000자). 현재 Up은 v9.
    한 단계 되돌리기: 새 컨테이너 stop → 직전 컨테이너 `docker update --restart=unless-stopped` 후 start.
    운영 DB를 건드리지 않는 시험 실행: `docker exec -e DESK_STATE_DIR=/tmp/desk-test -e DESK_NOTIFY_FAILURE=false <컨테이너> sh -c 'for s in scan rank research write; do node /app/research-lab/deploy/launch.mjs $s || exit 1; done'`
    (edit 단계는 빼야 한다 — 등록·텔레그램 단계다. 실패 시 실패 기록이 운영 DB에 한 번 시도되지만 완료된 날짜는 거절된다.)
    다시 배포할 때: main tarball → `docker build -t kk-editorial:<날짜-이름> -f research-lab/deploy/Dockerfile .` → 같은 옵션으로 새 이름의 컨테이너.
    옛 이미지 안의 파일은 CRLF 줄바꿈이었다(비교할 땐 `diff --strip-trailing-cr`).
    **2026-10-05 확인: 9/27 복구 때 서버에서 직접 고친 8개 파일이 레포에 없었다.** 같은 날 레포로 옮겼다(core.js의 옛 경험 검사는 제외).
    서버에서 코드를 직접 고치지 말 것 — 레포에 먼저 넣고 이미지로 배포한다.
    출처(2026-10-05 KK 지시로 확대, `research-lab/config/desk-feeds.json`): 원자료 Fed·BIS·한국은행·SEC·ECB·BEA·AI 4사,
    보조 근거(뉴스) CNBC·연합뉴스·한국경제·매일경제. 뉴스 도메인은 정책 파일의 `signalOnlyDomains`에 있지만 실제로는 `secondary` 근거로 분류된다.
    "원자료 1개 이상 + 서로 다른 사이트 2곳 이상" 규칙은 그대로다. 유료벽 매체(WSJ·FT·Economist·WaPo·MarketWatch)는 본문을 못 읽어 근거로 못 쓴다.
    VPS에서 막힌 피드(IMF·OECD 403, BLS 본문 실패, MarketWatch 401)는 `disabled`로 남겨 두었다.
    Desk 모델(2026-10-05 KK 결정): 네 단계 모두 `deepseek/deepseek-v4-flash-0731:nitro`. 같은 출처 시험에서 GLM 후보 선정은 3번 중 2번 실패,
    DeepSeek는 첫 시도에 통과해 discovery·research를 GLM에서 바꿨다(원본 `/opt/kk-editorial/editorial.env.before-deepseek-20261005`).
    편집 검수 판정은 `passed`로 정한다(2026-10-05). 합격 초안에 남은 지적은 메모로 저장되고 텔레그램에 "편집 검수 메모 N건"으로 표시된다.
  - Hermes 에이전트: `/opt/hermes-ops`. **건드리지 말 것.**
- **Vercel은 정적 사이트만 서빙한다. 예약 작업(cron)은 0개.** 다시 추가하지 말 것.
- 외부 생존 감시: GitHub Actions `.github/workflows/uptime.yml` — 15분마다 `api.kkandfriends.com/health`와
  `www.kkandfriends.com` 확인, **상태가 바뀔 때만**(다운/복구) KK 텔레그램 알림. 공개 레포라 무료.
  필요한 GitHub 시크릿: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. (UptimeRobot 등 외부 가입 서비스는 KK가 원치 않음 — 비용·계정 추가 회피)
- 백업: `/usr/local/sbin/kkf-backup` (`ops/backup/README.md`). 매일 04:10 KST DB+업로드 → 암호화 →
  Google Drive `srv1619910-backups/kkf-community/` (30일), 매주 월 04:40 임시 DB 복구 시험.
  복호화 키 `/root/.kkf-backup.key`는 KK가 서버 밖에 따로 보관 중(2026-09-28 확인).
- **로그인 유지 (2026-10-07 수정·VPS 반영):** 회원이 새로고침마다 로그인 화면을 보던 원인은 API의 분당 120회 요청 제한이었다.
  Fastify가 Caddy의 X-Forwarded-For를 믿지 않아 회원·검색엔진·Vercel 페이지 생성이 **한도 하나를 같이 썼고**, 한도가 차면 로그인 확인이 429로 거절됐다.
  `server/src/app.js`에 `trustProxy: ['loopback', 'uniquelocal']`(안쪽 프록시만 신뢰)을 넣어 방문자별로 센다. 지우지 말 것.
  로그인 유지는 30일(하루 1회 이상 방문 시 연장, `server/src/auth.js` `session`), 브라우저는 확인 실패 시 2번 더 시도한다(`js/auth-vps.js`).
  이전 파일 백업 `/opt/kkf-community-staging/src/{app,auth}.js.bak-20261007`.
- **홈 화면 로그인 표시 (2026-10-13 KK 지적):** 홈은 성능 때문에 세션 확인을 load 후 4초에 한다 → 그동안 회원에게도 "가입 신청"이 보여 로그아웃된 것처럼 읽혔다. `index.html`이 브라우저에 기억해 둔 마지막 상태(`localStorage kkf-home-cta`: approved·pending)를 **즉시** 그리고, 4초 뒤 실제 확인으로 바로잡는다(로그아웃 확인되면 기억 삭제). 4초 지연은 성능 테스트가 고정하므로 줄이지 말 것.
- 메일: Resend (`noreply@kkandfriends.com`). 키는 API 서버와 브리핑 컨테이너 env에 있다.
- 교훈: 예전 코드는 설정이 빠지면 "skipped"를 **성공**으로 보고했다. 새 자동화는 반드시 실패로 처리하고 경고를 보낸다.
- Supabase: 2026-09-25부터 사용 안 함. **2026-09-28 최종 백업 후 프로젝트 일시정지** (KK 실행).
  대시보드에서 **2027-11-02까지 재개 가능**, 이후에도 백업 다운로드는 가능하다고 Supabase가 안내함.
  최종 백업: `/var/backups/kkf-community/supabase-final-20260928.tar.enc` (백업 키로 열림, 회원 62·글 89 — VPS 전환 기록과 일치).
  레포의 `config.js`에서 Supabase 주소·anon 키, 미사용 `js/auth.js`를 제거했다. 다시 넣지 말 것.
  마이그레이션 때 남은 평문 사본(`migration/`, `backups/`)은 2026-09-28 암호화 후 삭제 →
  `/var/backups/kkf-community/migration-archive-20260925.tar.enc` (백업 키로 열림). Supabase 종료 때 함께 삭제 여부 결정.
  설정 파일 백업본(`/opt/kkf-community-staging/*.bak-*`, `.before-publish-*`, `ops/briefs/.env.bak-*`)은 ~10/5 정리 예정.
  레포의 Supabase 관련 문서(`SETUP.md`, `DAILY_BRIEF_SETUP.md`, `EMAIL_DIGEST_SETUP.md`, `db/migrations/`)는 옛 기록이다.

## humanizer 스킬 (2026-10-04 KK 지시)

- **모든 루틴은 발행·발송 전 최종 글에 humanizer 스킬을 적용한다.** 원문: 레포 `.claude/skills/humanizer/SKILL.md` (v3.1.0, KK 업로드본과 동일).
  예전 루틴 프롬프트의 "`.claude/skills/humanizer/`는 삭제됐다, 찾지 말 것" 문구는 폐기됐다 — 파일은 레포에 있다.
- 숫자·날짜·고유명사·인용·출처는 바꾸지 않는다. 다듬기 전후 숫자가 다르면 다듬기 결과를 버리고 원본을 쓴다.
- Editorial Desk는 코드로 강제한다 (`research-lab/src/desk/stages.js` `humanizeDesk`). Claude Code 루틴 4개는 각 프롬프트에 단계로 넣었다.
- VPS 라운지 브리핑(07:00·17:30)은 `lib/briefs/humanize.js`로 코드에서 강제한다 (2026-10-05). 숫자·소제목·💡·→가 바뀌면 원문으로 발행하고 KK에게 알린다.
  2026-10-05 VPS 반영 완료(연습 실행 `applied: true`). 이전 코드 백업 `/root/kk-briefs-code-bak-20261005.tgz`.
- **단정 표현 차단 (2026-10-05 KK 지시):** 10/5 한국 마감이 "코스피 사상 첫 7,000대 진입"이라고 썼으나 9/23에 이미 7,080.92였다.
  원인: 모델은 오늘 종가·등락만 받았고, "사상/처음" 금지는 지시문 한 줄뿐이라 검사하는 코드가 없었다.
  이제 `lib/briefs/claims.js`가 humanizer 뒤·발행 전에 "사상 첫/최고, 역대, 처음으로, 최초, 유일, 신고가(52주 없이), 첫 ○○선 돌파"를 찾아
  같은 모델로 한 번 고치게 하고, 남거나 숫자가 바뀌면 **발행하지 않고** 실패 처리(잠금 해제 + KK 텔레그램, 17:50/07:20 재시도가 새로 쓴다).
  지수에는 1년치 종가로 계산한 "52주 종가 최고/최저" 줄을 넘긴다(`lib/market-sources.js` `yearRecord`). "52주 신고가"만 근거가 있다. 사상 최고는 데이터로 확인할 수 없다.

## 다섯 스트림

`#macro` 거시 · `#AI` 인공지능 · `#equity` 전통 주식 · `#digital-assets` 디지털 자산 · `#korea` 한국 경제의 구조적 모순

- 2026-08-02에 `#geopolitics` → `#AI`로 교체됨.
- 발행된 매니페스토(`posts/20260723_after_the_close.html`)에는 아직 `#geopolitics`가 남아 있다. 의도적으로 그대로 둔 것.

## 공개 / 멤버 구분 (2026-10-06 KK 결정)

- **밖(공개)에는 둘:** KK Original(`/original/:slug`, THOUGHTS `posts/`) · **Daily Markets**(`/markets/<날짜>-start|close`).
  목록은 `/thoughts?series=Daily%20Markets`(`/markets`는 거기로 넘김). 지난 브리핑까지 전부 공개.
  카드와 글 상단에 날짜와 함께 **서울 발행 시각**(07:02, 17:30)을 표시한다(2026-10-13 KK 요청, 날짜만 있어서 순서가 꼬여 보였다).
  THOUGHTS `All`에는 Daily Markets를 섞지 않는다(KK 결정 2026-10-06, 하루 2편이 KK Original을 덮음). `Daily Markets` 탭에서만 보인다.
- **Daily Markets** = 자동 브리핑 두 개. 제목은 코드가 고정: `오늘의 시작 (10/6 화)`(07:00, 옛 글로벌 마켓 브리핑),
  `오늘의 마감 (10/6 화)`(17:30, 옛 한국 금융시장 종합). 모델이 쓴 TITLE은 버린다(`lib/briefs/*.js`, humanizer·단정 표현 검사도 제목을 못 바꿈).
  저장은 그대로 `member_posts` + `daily_briefs`. 공개 조회는 VPS `GET /api/v1/markets`, `/api/v1/markets/:slug`(`server/src/routes/markets.js`),
  라운지 목록(`/api/v1/posts`)에서만 빠진다. 댓글은 라운지 때 키(`member:<post id>`) 그대로라 옛 댓글이 이어지고, 이 글들만 비멤버도 읽는다.
  옛 링크 `/voices?id=<브리핑 id>`는 `/markets/...`로 넘어간다. 텔레그램 티저 링크도 `/markets/...`.
  사이트맵·RSS에 들어간다. LinkedIn 피드에는 없다.
- **홈 "어떻게 읽을까요?"의 라운지 카드 (2026-10-19 KK 제안):** 라운지가 있는 줄 모르는 방문자를 위해 Daily Markets · KK Original 옆에 세 번째 카드(`#home-lounge-card`)를 둔다. 링크는 기억된 회원 상태를 따른다(`index.html` `applyMemberCtas`): 승인 멤버 `/voices` "라운지 들어가기", 심사 중 `/me` "심사 상태 보기", 그 외 `/community` "라운지 알아보기". 폰은 한 줄(세로)이다. 공개 시리즈는 여전히 둘이고 카드 수 검사는 3(`tests/home-lounge-card.test.mjs`).
- **요약문에서 마이너스 부호 보존 (2026-10-22 사이트 점검):** `js/markdown.js` `excerpt()`가 모든 `-`를 공백으로 바꿔서 Daily Markets 카드·메타 설명이 "코스피 5,552.74( 3.73%)"처럼 하락이 상승처럼 보였다. 이제 줄 맨 앞 목록·구분선의 `-`만 지우고 숫자 안의 `-`와 날짜는 둔다(`tests/excerpt-minus.test.mjs`).
- **안(라운지, 멤버 전용):** KK Daily · KK Weekly. 라운지 `전체`에 섞이고 `KK Daily · Weekly` 탭(`/voices?tab=desk`)이 따로 있다.
  `/desk/:slug`는 Vercel이 독자 쿠키를 VPS `GET /api/v1/desk/:id`(승인 멤버만)에 넘겨 확인한다 → 비멤버는 403 "멤버 전용 글" 화면, CDN 캐시 없음, noindex.
  사이트맵·RSS에서 빠졌다. LinkedIn·Instagram·Facebook에는 **Weekly만 잠금 맛보기로** 나간다(2026-10-11, 위 "KK Weekly 맛보기 공유"). 공개 JSON `/api/desk`는 410. `/desk`는 라운지로 넘긴다(옛 `?slug=` 링크는 `/desk/<slug>`로).
  `robots.txt`에서 `/desk`를 막지 말 것 — 이미 색인된 글이 403/noindex를 봐야 검색에서 빠진다.
- **오늘의 시작 읽는 순서 (2026-10-15 KK 요청):** 공개 글이라 일반 독자가 처음 읽어도 "무슨 일 → 왜 → 오늘 뭘 보나"로 이어지게 섹션을 `## 간밤에 있었던 일` · `## 숫자 뒤에 있는 것` · `## 오늘 한국 시장에서 볼 것` · 💡 한 줄로 정했다(예전 `## 숫자`·`## 이면`). 길이 700~1,200자. 💡 예시 문장을 진짜 문장으로 두면 모델이 매일 베끼므로 형식 설명만 둔다(`tests/briefs-start-format.test.mjs`). 오늘의 마감(`korea-close.js`)도 같은 순서다: `## 오늘 있었던 일` · `## 숫자 뒤에 있는 것` · `## 내일 볼 것` · 💡.
- **기간 비교·원인 단정 보강 (2026-10-15):** 마감 미리보기에서 "6개월 만의 최저"가 근거 없이 나왔고 단정 표현 검사를 통과했다. `claims.js`에 "N개월·N년·N주·N일 만의/만에 (최저·최고…)" 패턴을 추가했고, 시작·마감 지시문에 "화살표 뒤 풀이는 숫자의 뜻만, 원인·돈의 이동은 헤드라인 근거가 있을 때만 '~로 보인다'"와 "제공되지 않은 기간 비교 금지"를 넣었다(`tests/briefs-claims-period.test.mjs`). 하루 등락("하루 만에")과 52주 표현은 허용한다.
- **결론 한 줄 보강 (2026-10-15):** 미리보기에서 맨 앞 결론이 "돈이 AI에서 빠져 헬스케어와 채권, 금으로 옮겨 갔다"를 헤지 없이 단정했다(헬스케어는 시세 데이터에 없음). 시작·마감 지시문에 "결론 한 줄도 숫자로 확인되는 사실만, 이유·돈의 이동·매도 주체는 `## 숫자 뒤에 있는 것`에서 근거와 함께"와 "'~라는 신호다'처럼 해석을 사실처럼 끝맺는 문장도 같은 규칙"을 넣었다. 코드로 막는 것은 아니고 지시문뿐이므로 발행된 글을 보며 확인할 것.
- **줄표 금지 (2026-10-15 KK 지시):** 시작·마감 브리핑에는 em dash(—)와 띄어 쓴 en dash( – )를 쓰지 않는다. 지시문에 금지 규칙이 있고, 발행 직전 `lib/briefs/dashes.js` `stripDashes`가 코드로 쉼표로 바꾼다(숫자 사이 범위 `3.75–4.00%`, 마이너스 `−`, 코드, 링크는 그대로). humanizer가 실패해 원문이 나가도 걸러진다. `tests/briefs-dashes.test.mjs`.
- 브리핑 지시문은 **가볍게 풀기**(2026-10-06 KK 결정): 독자는 프로+일반. 약자·업계 용어는 처음 나올 때만 한 구절로 뜻을 푼다(숫자·일상 예시 없이), 분량·형식은 그대로.
  10/6 연습 실행에서 bp·신용스프레드·순환매가 그대로 새서 **필수 풀이 목록**을 지시문에 넣었다: bp, 스프레드, 순환매, 듀레이션, 멀티플, 밸류에이션, ERP, 실질금리, 디레이팅, 차익 실현.

## 라운지 (Friends' Voices, `/voices`)

- **레포에 커밋되는 파일이 아니다.** VPS PostgreSQL `member_posts` 테이블의 행이다
  (2026-09-25 Supabase → VPS 전환. 읽기·쓰기는 `api.kkandfriends.com`의 `/api/v1/posts`).
- 쓰기는 로그인 세션 + 승인 멤버(`status='approved'`)만 된다 (`server/src/routes/posts.js`, `server/src/access.js`).
  자동 브리핑만 VPS 내부 토큰(`EDITORIAL_INTERNAL_TOKEN`)으로 KK 명의 발행을 한다 — 이 토큰은 VPS에만 있다.
  → **에이전트(이 세션)는 라운지에 발행할 수 없다. 초안까지만 만들고 발행 버튼은 KK가 누른다.**
- 작성 화면: https://www.kkandfriends.com/write — 칸은 제목 / 카테고리 / 본문 셋뿐.
- 카테고리 고정값: `시장/매크로` · `크립토/디지털자산` · `정책/규제` · `커리어` · `자유` (`js/auth.js`)
- 본문 마크다운 렌더러는 `js/markdown.js`. 지원: `# ## ###`, `**굵게**`, `*기울임*`,
  `` `코드` ``, ```` ``` ````, `>` 인용, `-`/`1.` 목록, `---`, 링크, 이미지.
  **표(table)는 지원하지 않는다** — 초안에 표를 넣지 말 것.
  연속된 줄은 `<br>`로 이어지므로 `→` 화살표 줄들은 의도대로 줄바꿈된다.
- KK는 라운지에 **필명**으로 올린다. 초안에 `By KK · Chief of KKandFriends` 바이라인을 붙이지 말 것.
  실무 경험을 인용할 때도 회사명(JP Morgan, BofA 등)은 빼고 "딜링룸에서" 정도로 둔다.

## 관리자 페이지 입구 (2026-10-13 KK 요청)

- **허브 `/admin-home`**(`admin-home.html`, noindex): 회원 심사·신고·추천·분석, KK Original/Daily/Weekly·라운지 글쓰기, 내 프로필·알림·모임·대기자 명단(`/admin`, 예전 토큰 방식).
  회원 심사 대기 수와 미처리 신고 수를 옆에 보여준다. 주인(`ADMIN_UID`)이 아니면 "관리자가 아닙니다". 실제 권한은 API가 매번 확인한다(화면은 바로가기일 뿐).
- **주 메뉴의 "관리자" 링크**(`js/admin-link.js`): 주인 브라우저에만 보인다. `isAdmin()`이 주인을 알아보면 `js/admin-hint.js`가 localStorage에 힌트를 남기고,
  힌트가 있을 때만 메뉴에 링크를 넣고 세션을 다시 확인한다(주인이 아니면 힌트 삭제, 로그아웃하면 삭제). **힌트가 없는 방문자는 요청이 하나도 늘지 않는다.**
  `js/site-nav.js`(글·원문·브리핑 페이지)와 자체 메뉴를 가진 페이지(`<script type="module" src="/js/admin-link.js">`)에서 불러온다. 새 페이지에 메뉴를 만들면 같은 줄을 넣을 것.
- **폰 (2026-10-13):** 회원 페이지는 폰에서 `.nav-right`를 숨기고 햄버거도 없다 → `admin-link.js`가 로고 옆에 작은 "관리자" 링크(`.admin-link-phone`, 700px 이하만)를 따로 넣는다. 관리자 화면 4개는 폰에서도 첫 링크 "관리자 홈"만 남긴다.
- 각 관리자 화면 위쪽에 "관리자 홈" 링크, `/me`의 주인 버튼 줄 맨 앞에 "관리자 페이지" 버튼이 있다.
- 아직 없는 것: 사이트 설정을 바꾸는 화면(설정은 VPS·Vercel·Zapier에 있다). 허브의 "설정 · 계정"은 계정 관련 바로가기다.

## 블로그 (THOUGHTS, `posts/`)

- 이쪽은 정적 HTML로 레포에 커밋된다. 라운지와 다른 채널이다.
- 2026-09-24 이후 새 KK ORIGINAL은 Chief 전용 `/write-original`에서도 작성할 수 있다.
  VPS PostgreSQL `kk_original_posts`에 초안/발행 상태로 저장되며 공개 URL은 `/original/:slug`다
  (`server/src/routes/original.js`). 브라우저의 관리자 표시는 편의 기능일 뿐이며
  실제 쓰기 권한은 API 서버의 관리자 확인(`ADMIN_USER_ID`)이 강제한다.
  삭제 기능은 두지 않는다. 공개 중단은 `발행 취소`로 처리한다.
- **수정 (2026-10-03, PR #21):** 발행된 `/original/:slug` 바이라인 옆에 Chief에게만 `✏️ 이 글 수정`이 보인다
  (`js/original-edit-link.js`, 세션이 관리자일 때만). 누르면 `/write-original?slug=…`로 그 글이 열린다.
  발행된 글에는 `변경 사항 저장`·`발행 취소`만 있고 `임시 저장`은 없다 — `임시 저장`은 draft로 저장해서 글을 내려버리기 때문.
  공개 화면은 CDN 캐시(`s-maxage=300`) 때문에 독자에게 최대 5분 늦게 바뀐다. 확인할 땐 주소 끝에 `?v=1`.
- **간격은 쓴 그대로 (2026-10-03, PR #23, KK 지시):** KK ORIGINAL만 `renderMarkdown(body, { preserveSpacing: true })` +
  `.rendered.as-written`. 덩어리(문단·목록·소제목) 사이 자동 여백 없음, **빈 줄 하나 = 한 줄 간격**(`.md-gap`), 두 줄이면 두 줄.
  공개 화면(`lib/original-render.js`)과 작성 미리보기(`js/original-editor.js`, `write-original.html`)가 같은 규칙이어야 한다.
  라운지(`/write`, `/voices`)는 기본 렌더러(옵션 꺼짐) 그대로 — 섞지 말 것.
  배경: `member.css`가 `* { margin:0; padding:0 }`로 초기화하므로, 새 화면에서 목록 간격을 따로 안 주면 불릿 앞뒤 간격이 사라진다.
- **KK ORIGINAL 분야는 일곱 개 (2026-10-13):** Macro · Korea · Equity · Digital Assets · **AI** · Global · Manifesto. 네 곳이 같아야 한다: `js/original-editor.js`, `server/src/routes/original.js`, DB 검사(`server/db/005_original_category_ai.sql` — VPS에서 따로 실행해야 반영), `thoughts.html` 필터. 기존 글은 분류를 옮기지 않았다(KK 선택 필요).
- **AI 분야로 옮긴 옛 글 7편 (2026-10-14 KK 결정):** 725배, 선순위, 프랜차이징, 싸진 건 연료, hyperscaler-capex, ai_capex_risk, ai_infra_korea. 글의 분류는 세 곳에 적혀 있다 — 글 자체(`article:section`·JSON-LD·`article-tag`), THOUGHTS 카드(`data-category`·`post-category`), `lib/post-index.js` `section`. 분류를 바꿀 땐 세 곳을 같이 고칠 것(`tests/ai-posts.test.mjs`). 걸쳐 있는 6편(흘수선, 광부, Valor SPV, 삼성 마진콜, Kurzweil 2편)은 그대로 두었다.
- 파일명 규칙: `YYYYMMDD_slug.html`
- 새 글 쓰기 전 **기존 아카이브를 반드시 훑을 것.** 각도가 겹치면 다시 잡는다.
  (예: AI capex는 `20260614`, `20260620`에서 이미 두 번 다뤘다)

## KK Daily · KK Weekly · KK ORIGINAL (2026-10-02 KK 결정)

> 2026-10-06부터 KK Daily · KK Weekly는 **라운지 안(멤버 전용)**이다. 위 "공개 / 멤버 구분" 참조. 아래 작성·발행 규칙은 그대로다.

세 시리즈의 역할이 다르다. 글을 어디에 쓸지 헷갈리면 이 기준을 따른다.

| 시리즈 | 성격 | 작성 화면 | 분량 | 출처 |
|---|---|---|---|---|
| KK Daily | 월~토, 요일마다 다른 주제의 짧은 업데이트(뉴스형) | `/write-desk?series=daily` | 300~10,000자 (2026-10-07 상향: 2,500 → 10,000, **VPS API 반영 2026-10-13 확인**, 백업 `src/{app.js,routes/uploads.js,routes/editorial.js}.bak-20261013`). 자동 초안은 1,500~2,000자 (2026-10-08 KK 지시, `core.js` `FREE_LENGTH`) | `제목 \| https://주소` 1줄 이상 |
| KK Weekly | 일요일, 그 주 Daily를 정리 | `/write-desk?series=weekly` | 600~10,000자 (2026-10-07 상향, VPS API 반영 2026-10-13). 자동 초안은 600~6,000자 | 같음 |
| KK ORIGINAL | 깊은 글, 형식 자유 | `/write-original` | 제한 없음 | 자유 |

- **분량 상한 1만 자 (2026-10-07 KK 지시):** Daily·Weekly 작성 칸은 공백 포함 최대 10,000자(`server/src/routes/editorial.js` `FREE_LENGTH`,
  `js/desk-editor.js` `rangeFor`). 라운지(`/write`)·KK ORIGINAL은 원래 100,000자라 그대로다.
  아침 자동 초안의 자체 검사(`research-lab/src/desk/core.js`, Daily 1,500~2,000·Weekly 6,000)는 일부러 두었다 — 넘치면 줄여 쓰는 장치라서.
- **파일 첨부 (2026-10-07 KK 지시):** 모든 글쓰기 화면에서 PDF·워드·엑셀·파워포인트·한글(HWP/HWPX) 20MB, 이미지 5MB.
  공통 모듈 `js/attachments.js` → VPS `POST /api/v1/uploads`(`server/src/routes/uploads.js`, 파일 서명 검사, 원래 파일명 유지
  `/uploads/연/월/<uuid>/<이름>.<확장자>`). HTML·SVG·텍스트는 받지 않는다(API 주소에서 페이지로 열릴 수 있음).
  라운지·ORIGINAL은 본문에 `[📎 이름 (크기)](주소)` 링크로 들어간다. Daily·Weekly는 본문에 URL을 못 넣으므로
  `content.attachments`(최대 10개, `api.kkandfriends.com/uploads/`만)로 저장되고 공개 글 하단 **첨부 파일**에 표시된다.
- 요일 주제는 기준일로 자동 결정된다: 월 MACRO · 화 MARKETS · 수 BITCOIN · 목 AI · 금 SIGNAL · 토 KOREA · 일 WEEKLY.
- Daily·Weekly는 **소제목 없는 자유 본문**이다(`format: 'free'`). 예전 고정 목차(핵심 판단/확인된 사실/…)는
  KK 직접 작성 글에는 더 이상 쓰지 않는다. 아침 자동 초안(Editorial Desk)도 2026-10-04 코드부터 같은 자유 형식이다
  (VPS 반영 2026-10-05, 첫 실행 10/6 화). 고정 목차 검증 코드는 옛 초안용으로만 남아 있다.
- Weekly 작성 화면의 "이번 주 Daily 불러오기"는 그 주 월~토에 **발행된** Daily의 제목·요약을 본문에 넣고,
  공개 글 하단 "이번 주 Daily"에 링크로 붙인다.
- 본문에 URL, `[확인 필요]`, `<`+영문(태그로 읽힘)은 넣을 수 없다. 출처는 출처 칸에만.
- 본인 경험 문장("나는 … 경험", "내가 … 근무", "제가 … 경험", "내 경험상")은 서버가 막는다.
  필드별·문장 안에서만 검사한다(2026-10-02 오탐 수정).
- **같은 날짜에는 초안이 하나만** 들어간다(ID `날짜-요일데스크`). 자동 초안이 먼저 있으면 새로 만들 수 없고,
  `/write-desk`가 그 초안을 열어 고쳐서 발행한다.
- **발행은 `/write-desk`에서 바로 (2026-10-05 KK 지시):** 별도 검토 화면 `/admin-editorial`은 없앴다. 그 주소는 `/write-desk?id=…`로 넘겨준다
  (텔레그램·옛 링크 호환). 맨 아래 확인란 체크 → `발행` 한 번이면 저장(create/revise) → 승인 → 발행이 이어서 실행되고 공개 글로 이동한다. `초안만 저장`도 있다.
  기준일에 이미 초안(아침 자동 초안 포함)이 있으면 그 초안이 편집기에 열린다. 옛 고정 목차 초안은 소제목을 빼고 문단만 합쳐 자유 형식으로 저장된다.
  편집 검수 메모는 편집기 위 안내 상자에 보인다. 초안 삭제 기능은 없다.
- **저장된 초안도 전부 바꿀 수 있다 (2026-10-05 KK 지시, VPS editorial.js 필요):** 제목·요약·본문·출처·(Weekly) 이번 주 Daily 링크.
  `revise` + `format: 'free'`이면 서버가 새 출처로 payload를 다시 만든다(옛 근거 인용 `evidence`는 비움, 검수 메모는 유지).
  **발행된 글**은 `update` 액션으로 같은 주소에서 바로 고친다(발행 상태 유지, `editorial_events`에 `update_published` 기록). 버튼 이름이 `변경 사항 저장`으로 바뀐다.
  `/desk/:slug`는 멤버 확인 때문에 캐시하지 않는다(2026-10-06부터) — 고치면 바로 보인다.
  VPS 반영 2026-10-05 (PR #36). 이전 파일 백업 `/opt/kkf-community-staging/src/routes/editorial.js.bak-20261005`.
- **공개 글에서 바로 수정 (2026-10-05):** 발행된 `/desk/:slug` 맨 위 `← 전체 글` 옆에 Chief에게만 `✏️ 이 글 수정`이 보인다
  (KK ORIGINAL과 같은 `js/original-edit-link.js`, `data-desk-edit` 슬롯). 누르면 `/write-desk?id=…`로 그 글이 열리고 `변경 사항 저장`으로 고친다.
- **버그 기록 (2026-10-05):** `edition_date`는 DATE 열이라 node-postgres가 JS Date로 돌려준다. 예전 서버는 이걸 `deskFor()`에 그대로 넣어
  **저장된 초안 수정(revise)이 전부 `400 Invalid date`로 실패**했다. `editionDay()`로 고쳤다. 새 서버 코드에서 날짜를 다룰 땐 이 함수를 쓸 것.
- 공개 화면 `/desk/:slug`(`lib/desk-render.js`) 하단에 THOUGHTS·ORIGINAL과 같은 좋아요·공유·댓글(`blog/discussion.js`)이 있다
  (2026-10-03, PR #24). 댓글 키는 에디션 ID(예: `2026-10-03-korea`). VPS 댓글 API는 아무 슬러그나 받으므로 서버 변경 없이 붙었다.
  에이전트는 초안 문안까지만 만든다. 제출·승인·발행은 KK가 한다.
- 검증 규칙은 VPS API `server/src/routes/editorial.js`에 있다(`FREE_LENGTH`, `validateFreeContent`).
  이 파일을 바꾸면 Vercel merge만으로는 반영되지 않는다 → VPS 재배포 필요(아래).

### VPS API 재배포 절차 (2026-10-02 실행해 성공)

`/opt/kkf-community-staging`의 이미지에 코드가 구워져 있으므로 `--build`가 필요하다.
서버 변경이 새 프론트엔드와 짝을 이루면 **VPS 배포를 먼저, merge는 나중에** 한다.

```bash
set -e
rm -rf /tmp/kkf-src && mkdir /tmp/kkf-src && cd /tmp/kkf-src
curl -fsSL https://github.com/KKandFRIENDS/kkandfriends/archive/refs/heads/<브랜치>.tar.gz | tar xz --strip-components=1
cd /opt/kkf-community-staging
cp src/routes/<파일>.js src/routes/<파일>.js.bak-<날짜>
cp /tmp/kkf-src/server/src/routes/<파일>.js src/routes/<파일>.js
docker compose -f compose.staging.yaml up -d --no-deps --build api
sleep 30 && docker compose -f compose.staging.yaml ps api && curl -fsS https://api.kkandfriends.com/health
```

- 2026-10-02 백업: `/opt/kkf-community-staging/src/routes/editorial.js.bak-20261002` (자유 형식 이전 버전).

## 사이트 글꼴 기준 (2026-10-13 KK 결정)

- **읽는 글·버튼·입력창은 Pretendard 하나**(`var(--font-sans)`, `typography.css`). **제목만** Playfair Display + 한글은 Noto Serif KR(`var(--font-serif)`). Source Serif 4는 퇴역 — 다시 넣지 말 것(`tests/typography.test.mjs`가 막는다).
- Pretendard는 `typography.css` 한 곳에서만, **버전을 고정**해 불러온다(`jsdelivr npm/pretendard@1.3.9`). 글 페이지에서 따로 `<link>`로 또 불러오지 말 것.
- **홈은 Noto Serif KR을 받지 않는다.** 한글 제목은 Pretendard로 나온다(늦게 받아 글꼴이 바뀌며 흔들리던 현상 제거). 글 페이지·멤버 화면의 한글 제목은 Noto Serif KR.
- 새 화면을 만들면 `typography.css`를 마지막 쪽에서 불러오고, 글꼴은 `var(--font-sans)`·`var(--font-serif)`만 쓴다. 이름 있는 글꼴을 직접 적지 말 것.

## 풀어쓰기 (2026-08-24 KK 지시)

독자는 **현업 프로 + 일반인 둘 다**다. 라운지(멤버 전용, 전부 현업)와 다르다.
전문용어를 그냥 쓰면 절반이 떨어져 나간다.

- **약자는 최초 등장 시 풀어쓴다.** 철자만 풀지 말고 **그게 왜 그런 말인지**까지 한 줄.
  - 나쁨: "그게 TINA다"
  - 좋음: "TINA — There Is No Alternative, 대안이 없다. 주식이 좋아서 산 게 아니라
    달리 둘 데가 없어서 샀다는 뜻이다. 칭찬이 아니라 자조에 가까운 말이었다."
- **업계 용어는 이름 대신 동작으로 쓴다.** 용어를 쓰고 괄호로 설명하는 것보다,
  무슨 일이 벌어지는지를 문장으로 쓰는 쪽이 낫다.
  - "자사주 매입" → "회사가 시장에서 자기 주식을 사서 없애면, 남은 주식 한 장의 몫이 커진다"
  - "멀티플 축소" → "같은 이익에 시장이 매기는 값이 낮아진다"
- **발행 전 본문을 훑어 걸러낼 것** (자주 새는 것들):
  `배당성향` `잉여현금흐름` `멀티플` `실질금리` `밸류에이션` `ERP` `디레이팅` `언번들링`
  `스프레드` `듀레이션` `캐리` — 없앨 수 있으면 없애고, 꼭 필요하면 한 줄 풀어준다.
- 다만 **영어 그대로 두는 것들**은 KK 문체다: Fed, risk-off, curve, dovish, carry,
  Bottom line. 이건 풀지 않는다. 푸는 대상은 *설명이 필요한 개념*이지 *호흡을 만드는 단어*가 아니다.
- 숫자도 풀어쓴다. **퍼센트보다 개수가 먼저 꽂힌다.**
  - "3.85%" → "500개 중 19개" (`20260824_from_317_to_19` 참조)
- **일상 예시를 넣는다** (2026-09-25 KK 지시). 개념마다 일반인이 1초에 그릴 수 있는 장면 하나.
  - 법이 병목 → "아파트를 토큰 100개로 쪼개 1개를 샀는데 세입자가 월세를 안 내면 누가 소송하나"
  - 재담보 → "빌려준 자전거가 세 번 건너가 지금 누구 집 마당에 있는지 모른다"
  - 참조: `20260925_everything_will_be_a_token`
- **불릿은 유지한다.** KK는 ①②③④ + 짧은 불릿 형식을 좋아한다. 딱딱해지는 원인은 불릿이 아니라
  설명 없는 용어다 → 불릿은 두되, 불릿 안의 말을 풀어 쓴다.

## 홈페이지 창업자 경력 표기 (2026-10-13 KK 결정)

- `index.html` 창업자 섹션은 **같은 형식(연도 / 기관명 / 역할) 5줄**이다: JP Morgan → Bank of America → **ANZ Group** → **CROWDY Inc.**(Founder & Managing Partner · Entrepreneur) → **JB Financial Group**(2024 – Present, Independent Director · Risk Committee).
  사진 아래 경력 띠는 JP Morgan · Bank of America · ANZ Group 세 줄. ANZ를 줄이거나 빼지 않는다(3년 넘게 재직한 곳).
- **Bitplanet은 쓰지 않는다**(2026-10 말 사직, KK 판단: 이력으로 내세울 자리가 아님).
- 8월 30일의 "회사명 제거" 결정은 이 날짜로 바뀌었다. 자동 검사(`tests/coi-positioning.test.mjs`)도 같은 규칙으로 고쳤다:
  회사명은 타임라인 항목으로만 허용하고, "Current Roles" 같은 역할 배너·칩은 금지한다. 개인 자격 운영 고지문은 그대로 둔다.
- JB금융지주 사외이사는 2024년부터(KK 확인 2026-10-13). CROWDY 직함은 Founder & Managing Partner(KK 확인 2026-10-13).
- 타임라인 아래 세 상자(Looking Ahead · Independent capacity · In KK’s words)는 **한 부품 `.founder-box`**다: 파란 라벨 11px(대문자) + 본문 Pretendard 14px/1.8, **본문색 전부 `--text-secondary`**, 이탤릭·굵은 머리말 없음. 라벨 색은 섹션 전체(방장 눈썹, 연도, 사진 아래 연도, 상자 라벨)가 `--gold-light` 하나. 따로 꾸미지 말 것.
- 남은 Bitplanet 문구(사직 후 수정 대상): `lib/feeds.js` `DIGITAL_ASSET_DISCLOSURE`("재직 중"), `lib/briefs/global.js`·`korea-close.js` 시스템 프롬프트의 경력 나열.

## 매일 아침 루틴 (08:00 KST)

라운지 초안 3편을 준비한다. 발행은 하지 않는다.

1. **오늘의 구조** — 그날 시장에서 남들이 안 짚는 각도. 속보가 아니라 그 밑의 구조.
2. **뒤늦게 읽는 것** — 3~5일 전 뉴스인데 지금 보면 의미가 달라진 것.
3. **로테이션 한 편** — 다섯 스트림 중 아카이브에서 얇은 쪽을 채운다.

### 거르는 기준 (매니페스토에서 그대로)

> 속보를 다루지 않는다. 종목을 찍지 않는다. 확신을 팔지 않는다.

### 숫자 규칙

- 실증 수치 2~3개를 반드시 넣되, **교차 확인되지 않은 값은 "확인 필요"로 표시한다.**
- 지어내지 않는다. 모르면 모른다고 쓴다.
- 초안 하단에 출처 링크와, 원문과 어긋난 사실이 있으면 정정 표를 따로 붙인다(본문 밖).
