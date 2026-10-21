# 공식 통계 연결 VPS 반영 순서 (2026-10-22)

대상: `/opt/kk-briefs/ops/briefs` 브리핑 컨테이너. VPS에는 레포 git 사본이 없으므로 GitHub tarball로 받는다(레포는 public).
VPS는 Tailscale로만 열려 있어서 이 명령은 KK가 SSH 접속 후 직접 실행한다. **키 값은 채팅에 붙여넣지 않는다.**

원칙: 코드를 먼저 넣고 플래그는 **꺼 둔 채로** 기존 동작을 확인한 뒤에 켠다. 문제가 생기면 `STATS_IN_BRIEFS`를 지우는 것만으로 이전 동작으로 돌아간다.

`REF`는 병합 전에는 작업 브랜치, 병합 뒤에는 `main`으로 바꾼다.

## 1. 백업과 새 코드 받기

```sh
set -e
REF=claude/bold-hopper-3jiepc
rm -rf /tmp/kkf-src && mkdir /tmp/kkf-src && cd /tmp/kkf-src
curl -fsSL https://github.com/KKandFRIENDS/kkandfriends/archive/refs/heads/$REF.tar.gz | tar xz --strip-components=1
tar czf /root/kk-briefs-code-bak-$(date +%Y%m%d).tgz -C /opt kk-briefs
ls -l /root/kk-briefs-code-bak-*.tgz | tail -1
```

## 2. 무엇이 달라지는지 먼저 본다 (아직 아무것도 바꾸지 않는다)

```sh
cd /opt/kk-briefs
for p in lib/briefs lib/stats lib/ecos.js lib/market-sources.js lib/community-internal.js .claude/skills/humanizer ops/briefs/Dockerfile ops/briefs/compose.yaml ops/briefs/run.mjs ops/briefs/save-env.mjs ops/briefs/law-watch.mjs ops/briefs/start.sh ops/briefs/briefs.cron ops/briefs/package.json ops/briefs/package-lock.json ops/briefs/env.example; do
  diff -rq /tmp/kkf-src/$p /opt/kk-briefs/$p 2>&1 | sed 's/^/  /'
done
```

예상되는 차이는 다음뿐이다.

- `lib/briefs/korea-close.js`가 다르다
- `lib/stats`가 VPS에 없다
- `ops/briefs/Dockerfile`, `save-env.mjs`, `env.example`이 다르다
- `ops/briefs/law-watch.mjs`가 VPS에 없다

이 밖의 줄이 나오면(예: `lib/briefs/claims.js`) **복사하지 말고 출력을 Claude에게 보여 준다.** 서버에서 직접 고친 파일이거나 마지막 배포 뒤에 레포가 바뀐 것이다.

## 3. 필요한 파일만 복사한다

```sh
cd /opt/kk-briefs
cp -a /tmp/kkf-src/lib/stats lib/
cp /tmp/kkf-src/lib/briefs/korea-close.js lib/briefs/
cp /tmp/kkf-src/ops/briefs/Dockerfile /tmp/kkf-src/ops/briefs/save-env.mjs /tmp/kkf-src/ops/briefs/law-watch.mjs /tmp/kkf-src/ops/briefs/env.example ops/briefs/
```

## 4. 키 두 개 넣기 (`STATS_IN_BRIEFS`는 아직 넣지 않는다)

```sh
cd /opt/kk-briefs/ops/briefs
cp .env .env.bak-$(date +%Y%m%d)
nano .env
```

맨 아래에 두 줄을 추가하고 저장한다(Ctrl+O, Enter, Ctrl+X). 값은 claude.ai 환경 설정에서 복사해 직접 붙여넣는다.

```
DART_API_KEY=여기에붙여넣기
OPENLAW_OC=여기에붙여넣기
```

값을 보이지 않고 들어갔는지만 센다(결과가 각각 1이어야 한다).

```sh
grep -c '^DART_API_KEY=.' .env
grep -c '^OPENLAW_OC=.' .env
```

## 5. VPS에서 두 사이트에 닿는지 확인

```sh
curl -sS -m 15 -o /dev/null -w "law.go.kr https: %{http_code}\n" "https://www.law.go.kr/DRF/lawSearch.do?OC=test&target=law&type=JSON&query=a"
curl -sS -m 15 -o /dev/null -w "opendart https: %{http_code}\n" "https://opendart.fss.or.kr/api/list.json?crtfc_key=test"
```

둘 다 `200`이면 된다. `law.go.kr`가 `000`이거나 실패하면 `.env`에 `OPENLAW_BASE=http://www.law.go.kr` 한 줄을 추가한다.

## 6. 이미지를 다시 만들고, 플래그가 꺼진 채로 기존 동작을 확인한다

```sh
cd /opt/kk-briefs/ops/briefs
docker compose up -d --build
docker compose logs --tail=15 briefs
docker compose exec briefs node /app/ops/briefs/run.mjs korea-close --dry
```

결과 JSON에서 `"ok": true`이고 `"official": []`(비어 있음)이면 정상이다. 주말·휴장일이라 `skipped: market closed`가 나오면 `--dry --force`로 다시 한다. `--dry`는 발행도 잠금도 하지 않는다(모델 호출 비용만 약 $0.001).

## 7. 플래그를 켜고 미리보기로 결과를 본다

```sh
cd /opt/kk-briefs/ops/briefs
echo 'STATS_IN_BRIEFS=1' >> .env
docker compose up -d --force-recreate
docker compose exec briefs node /app/ops/briefs/run.mjs korea-close --dry
```

결과의 `official` 배열에 공시 건수와 법령 줄이 들어갔는지, `body`에 기업 이름이 없고 숫자에 기준 시점이 붙었는지 본다. 이상하면 `official`과 `body`를 Claude에게 보여 준다. 괜찮으면 그대로 두면 다음 17:30 실행부터 반영된다.

## 8. 법령 감시 (예약은 하지 않는다)

```sh
docker compose exec briefs node /app/ops/briefs/law-watch.mjs --dry
docker compose exec briefs node /app/ops/briefs/law-watch.mjs
```

첫 번째는 읽기만 한다. 두 번째는 기준선을 저장한다(알림은 가지 않는다). 이후 개정이 생기면 텔레그램으로 알린다. 매일 돌리려면 `briefs.cron`에 한 줄을 추가해야 하고, 이건 따로 결정한다.

## 되돌리기

- **기능만 끄기:** `.env`에서 `STATS_IN_BRIEFS=` 줄을 지우고 `docker compose up -d --force-recreate`. 코드는 남아 있어도 아무 일도 하지 않는다.
- **코드까지 되돌리기:** `cd /opt && tar xzf /root/kk-briefs-code-bak-<날짜>.tgz` 뒤 `cd /opt/kk-briefs/ops/briefs && docker compose up -d --build`. `.env`는 백업 `.env.bak-<날짜>`로 되돌릴 수 있다.
- 정리: `.env.bak-*`와 `/root/kk-briefs-code-bak-*.tgz`는 며칠 뒤 확인하고 지운다(키가 들어 있다).
