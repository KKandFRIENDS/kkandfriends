#!/usr/bin/env bash
# kkf-backup.sh — nightly encrypted backup of the KK & Friends community stack:
# the PostgreSQL database (members, lounge, comments, notifications, editorial
# state) and the uploads folder, mirrored to Google Drive through the rclone
# remote the Hermes off-site job already uses. Independent of the Hermes
# scripts: it neither reads nor edits them.
#
#   kkf-backup.sh --apply              make, verify, keep 7 locally, push, prune remote >30d
#   kkf-backup.sh --dry-run            print the plan, change nothing (default)
#   kkf-backup.sh --verify FILE.enc    restore FILE into a throwaway PostgreSQL and
#                                      compare row counts with its manifest
#
# The archive key lives at $KEY_FILE (created on first --apply). Copy it OFF this
# server once — without it, the Drive copies cannot be opened.
set -Eeuo pipefail
umask 077

PROJECT="${KKF_COMPOSE_PROJECT:-kkf-staging}"
PG_USER="${KKF_PG_USER:-kkf}"
PG_DB="${KKF_PG_DB:-kkf}"
UPLOADS_DIR="${KKF_UPLOADS_DIR:-/opt/kkf-community-staging/data/uploads}"
DEST_DIR="${KKF_BACKUP_DIR:-/var/backups/kkf-community}"
KEY_FILE="${KKF_BACKUP_KEY:-/root/.kkf-backup.key}"
REMOTE="${KKF_OFFSITE_REMOTE:-gdrive:}"
REMOTE_PATH="${KKF_OFFSITE_PATH:-srv1619910-backups/kkf-community}"
ALERT_ENV="${KKF_ALERT_ENV:-/opt/kk-briefs/ops/briefs/.env}"
RESTORE_IMAGE="${KKF_RESTORE_IMAGE:-postgres:17-alpine}"
KEEP=7
REMOTE_KEEP=30
# Tables whose row counts go into the manifest and are checked on --verify.
TABLES=(profiles member_posts comments post_likes comment_likes notifications events event_rsvps
        reports nominations daily_briefs editorial_runs editorial_drafts editorial_events kk_original_posts '"user"' account)

MODE=dry-run
VERIFY_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) MODE=apply ;;
    --dry-run) MODE=dry-run ;;
    --verify) MODE=verify; VERIFY_FILE="${2:-}"; shift ;;
    --keep) KEEP="$2"; shift ;;
    --remote-keep) REMOTE_KEEP="$2"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

log() { echo "[kkf-backup] $(date -u +%FT%TZ) $*"; }

alert() {
  # KK's own Telegram chat, same bot as the briefs. Values are read from the
  # briefs env file without sourcing it (no shell evaluation of its contents).
  local token chat
  [ -r "$ALERT_ENV" ] || return 0
  token="$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$ALERT_ENV" | cut -d= -f2- || true)"
  chat="$(grep -m1 '^TELEGRAM_CHAT_ID=' "$ALERT_ENV" | cut -d= -f2- || true)"
  [ -n "$token" ] && [ -n "$chat" ] || return 0
  curl -fsS -m 15 -o /dev/null "https://api.telegram.org/bot${token}/sendMessage" \
    --data-urlencode "chat_id=${chat}" --data-urlencode "text=$1" || true
}

WORK=""
cleanup() { [ -n "$WORK" ] && rm -rf "$WORK"; docker rm -f kkf-restore-test >/dev/null 2>&1 || true; }
on_error() {
  local line="$1"
  log "FAILED at line $line"
  if [ "$MODE" != dry-run ]; then alert "⚠️ KK&Friends DB 백업 실패 ($MODE, $(date -u +%F), line $line) — /var/log/kkf-backup.log 확인"; fi
}
trap 'on_error $LINENO' ERR
trap cleanup EXIT

pg_container() {
  local id
  id="$(docker ps -q --filter "label=com.docker.compose.project=${PROJECT}" \
                      --filter "label=com.docker.compose.service=postgres" | head -1)"
  [ -n "$id" ] || { log "no running postgres container for compose project '${PROJECT}'"; return 1; }
  echo "$id"
}

count_sql() {
  # Tables missing from this schema are skipped, not fatal: the manifest lists
  # exactly what was counted and --verify compares the same list.
  local names="" t
  for t in "${TABLES[@]}"; do names+="${names:+,}'${t}'"; done
  cat <<SQL
select replace(n, '"', ''),
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', n), false, true, '')))[1]::text
  from unnest(array[${names}]) as n
 where to_regclass(n) is not null
SQL
}

encrypt() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass "file:${KEY_FILE}" -in "$1" -out "$2"; }
decrypt() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass "file:${KEY_FILE}" -in "$1" -out "$2"; }

# ── verify: restore into a disposable, network-less PostgreSQL ──────────────
if [ "$MODE" = verify ]; then
  [ -f "$VERIFY_FILE" ] || { echo "usage: $0 --verify /var/backups/kkf-community/kkf-….tar.enc" >&2; exit 2; }
  WORK="$(mktemp -d)"
  decrypt "$VERIFY_FILE" "$WORK/set.tar"
  tar -xf "$WORK/set.tar" -C "$WORK"
  log "archive opens; contents: $(tar -tf "$WORK/set.tar" | tr '\n' ' ')"
  # CBC decryption does not detect corruption by itself; the inner checksums do.
  (cd "$WORK" && sha256sum --quiet -c SHA256SUMS) || { log "checksum mismatch — archive is corrupt"; false; }
  log "checksums OK"
  docker run -d --rm --name kkf-restore-test --network none \
    -e POSTGRES_USER="$PG_USER" -e POSTGRES_DB="$PG_DB" -e POSTGRES_PASSWORD=restore-test \
    "$RESTORE_IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    docker exec kkf-restore-test pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1 && break
    sleep 1
  done
  # The image's init script restarts the server once; wait for a stable ready state.
  sleep 3
  docker exec kkf-restore-test pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null
  docker exec -i kkf-restore-test pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges --exit-on-error < "$WORK/db.dump"
  docker exec kkf-restore-test psql -U "$PG_USER" -d "$PG_DB" -At -F ' ' -c "$(count_sql)" | sort > "$WORK/restored.txt"
  sort "$WORK/manifest.txt" > "$WORK/expected.txt"
  if diff -u "$WORK/expected.txt" "$WORK/restored.txt"; then
    log "VERIFIED — every table count matches the manifest:"
    sed 's/^/    /' "$WORK/restored.txt"
    uploads_files="$(tar -tf "$WORK/uploads.tar" | grep -vc '/$' || true)"
    log "uploads archive holds ${uploads_files} file(s)"
  else
    log "MISMATCH between manifest and restored database"; false
  fi
  exit 0
fi

# ── plan / apply ─────────────────────────────────────────────────────────────
log "mode=$MODE project=$PROJECT db=$PG_DB uploads=$UPLOADS_DIR dest=$DEST_DIR remote=$REMOTE$REMOTE_PATH"
command -v openssl >/dev/null || { log "openssl missing"; false; }
command -v rclone  >/dev/null || { log "rclone missing"; false; }
PG="$(pg_container)"
log "postgres container: $(docker inspect -f '{{.Name}}' "$PG" | sed 's#^/##')"
[ -d "$UPLOADS_DIR" ] || { log "uploads dir not found: $UPLOADS_DIR"; false; }
rclone listremotes 2>/dev/null | grep -qx "$REMOTE" || { log "rclone remote '$REMOTE' not configured"; false; }

if [ "$MODE" = dry-run ]; then
  log "dry-run: would dump '$PG_DB', tar $UPLOADS_DIR, encrypt with $KEY_FILE, keep $KEEP locally, push to $REMOTE$REMOTE_PATH, prune remote >${REMOTE_KEEP}d"
  [ -f "$KEY_FILE" ] || log "dry-run: key file does not exist yet — the first --apply creates it"
  exit 0
fi

if [ ! -f "$KEY_FILE" ]; then
  openssl rand -hex 32 > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  log "created new archive key $KEY_FILE — COPY IT OFF THIS SERVER (see ops/backup/README.md)"
  alert "🔑 KK&Friends 백업 키가 새로 만들어졌습니다: ${KEY_FILE} — 서버 밖(PC·비밀번호 관리자)에 한 번 복사해 두세요. 이 키가 없으면 Google Drive 백업을 열 수 없습니다."
fi

mkdir -p "$DEST_DIR"; chmod 700 "$DEST_DIR"
WORK="$(mktemp -d)"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
OUT="$DEST_DIR/kkf-${STAMP}.tar.enc"

# One transaction-consistent snapshot; custom format so pg_restore can check it.
docker exec "$PG" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner > "$WORK/db.dump"
docker exec -i "$PG" pg_restore --list < "$WORK/db.dump" > /dev/null   # the dump is readable
docker exec "$PG" psql -U "$PG_USER" -d "$PG_DB" -At -F ' ' -c "$(count_sql)" > "$WORK/manifest.txt"
tar -cf "$WORK/uploads.tar" -C "$UPLOADS_DIR" .
(cd "$WORK" && sha256sum db.dump manifest.txt uploads.tar > SHA256SUMS)
tar -cf "$WORK/set.tar" -C "$WORK" db.dump manifest.txt uploads.tar SHA256SUMS
encrypt "$WORK/set.tar" "$OUT.part"

# Round trip before we call it a backup: decrypt and list what came back.
decrypt "$OUT.part" "$WORK/check.tar"
cmp -s "$WORK/set.tar" "$WORK/check.tar" || { log "encrypted archive does not round-trip"; false; }
mv "$OUT.part" "$OUT"
log "archive $(basename "$OUT") $(du -h "$OUT" | cut -f1); rows: $(tr '\n' ' ' < "$WORK/manifest.txt")"

# Local retention.
mapfile -t old < <(ls -1t "$DEST_DIR"/kkf-*.tar.enc 2>/dev/null | tail -n +"$((KEEP + 1))")
if [ "${#old[@]}" -gt 0 ]; then rm -f -- "${old[@]}"; log "pruned ${#old[@]} local archive(s), keeping $KEEP"; fi

# Off-site: copy, confirm the size landed, prune remote copies older than REMOTE_KEEP days.
DST="$REMOTE$REMOTE_PATH"
timeout 300 rclone copy "$OUT" "$DST" --include '*.enc'
local_bytes="$(stat -c %s "$OUT")"
remote_bytes="$(rclone size "$DST/$(basename "$OUT")" --json 2>/dev/null | grep -oE '"bytes":[0-9]+' | cut -d: -f2)"
[ "$remote_bytes" = "$local_bytes" ] || { log "remote size ${remote_bytes:-?} != local $local_bytes"; false; }
rclone delete "$DST" --include '*.enc' --min-age "${REMOTE_KEEP}d" 2>/dev/null || true
log "off-site OK: $DST/$(basename "$OUT") ($(rclone lsf "$DST" 2>/dev/null | wc -l) remote archive(s))"
log "done. Verify with: $0 --verify $OUT"
