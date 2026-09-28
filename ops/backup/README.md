# KK&Friends DB 백업

회원 DB(PostgreSQL)와 업로드 이미지를 매일 밤 암호화해 **Google Drive**로 보낸다.
Hermes 백업이 이미 쓰는 rclone 연결(`gdrive:`)을 같이 쓰지만, Hermes 스크립트는 **읽지도 고치지도 않는** 별도 작업이다.

| 언제 (KST) | 무엇 |
|---|---|
| 매일 04:10 | DB 덤프 + 업로드 폴더 → 암호화 → 복호화 왕복 확인 → VPS에 7개 보관 → Drive `srv1619910-backups/kkf-community/`에 30일 보관 |
| 매주 월 04:40 | 가장 최근 백업을 **임시 DB에 실제로 복구**해서 테이블별 행 수가 백업 당시와 같은지 확인 |

실패하면 KK 텔레그램으로 경고가 간다 (브리핑과 같은 봇, `/opt/kk-briefs/ops/briefs/.env`의 값을 읽음).

## 설치 (VPS, 1회)

```sh
cd /opt/kk-briefs && curl -fsSL https://codeload.github.com/KKandFRIENDS/kkandfriends/tar.gz/refs/heads/claude/brave-cannon-lhsdbb | tar xz --strip-components=1
install -m 700 ops/backup/kkf-backup.sh /usr/local/sbin/kkf-backup
kkf-backup --dry-run                                  # 계획만 출력, 아무것도 안 바꿈
kkf-backup --apply                                    # 첫 백업 + 키 생성 + Drive 업로드
kkf-backup --verify "$(ls -1t /var/backups/kkf-community/kkf-*.tar.enc | head -1)"   # 복구 시험
install -m 644 ops/backup/kkf-backup.cron /etc/cron.d/kkf-backup   # 매일 예약 등록
```

## ⚠️ 키를 서버 밖에 보관할 것

첫 `--apply`가 `/root/.kkf-backup.key`를 만든다. **이 키가 없으면 Drive 백업은 열 수 없다.**
서버를 통째로 잃으면 키도 같이 사라지므로, 한 번 꺼내서 PC나 비밀번호 관리자에 둔다.

```sh
cat /root/.kkf-backup.key      # 64자리 글자를 복사해 비밀번호 관리자에 "KKF backup key"로 저장
```

## 복구 (서버를 잃었을 때)

1. Drive `srv1619910-backups/kkf-community/`에서 가장 최근 `kkf-….tar.enc`를 받는다.
2. 키를 파일로 저장한 뒤 복호화: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:키파일 -in kkf-….tar.enc -out set.tar`
3. `tar -xf set.tar` → `sha256sum -c SHA256SUMS` → `db.dump`는 `pg_restore`, `uploads.tar`는 업로드 폴더에 푼다.

## 확인

```sh
tail -20 /var/log/kkf-backup.log
ls -lh /var/backups/kkf-community/
rclone lsf gdrive:srv1619910-backups/kkf-community/
```
