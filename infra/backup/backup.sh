#!/usr/bin/env sh
set -eu

# Daily PostgreSQL custom-format dump with 7-daily / 4-weekly retention.
# Run from a host cron; logs filenames, sizes, checksums and status only (never credentials).
#
#   BACKUP_DIR=<host dir> ./infra/backup/backup.sh
#   BACKUP_DIR=<host dir> CRON_DRY_RUN=1 ./infra/backup/backup.sh

cd "$(dirname "$0")/../.."
COMPOSE="docker compose --env-file .env.prod -f infra/docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR must point to a mounted off-host backup directory}"
DRY_RUN="${CRON_DRY_RUN:-0}"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd -P)"
REPOSITORY_DIR="$(pwd -P)"
case "$BACKUP_DIR" in
  "$REPOSITORY_DIR"|"$REPOSITORY_DIR"/*)
    if [ "${BACKUP_ALLOW_LOCAL:-0}" != "1" ]; then
      echo "ERROR: BACKUP_DIR is inside the repository; mount an off-host target or set BACKUP_ALLOW_LOCAL=1 for a local drill" >&2
      exit 1
    fi
    ;;
esac
STAMP="$(date +%Y%m%d_%H%M%S)"
DAY="$(date +%Y%m%d)"
WEEK="$(date +%G-%V)"
LOG="$BACKUP_DIR/backup.log"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG"; }

if [ "$DRY_RUN" = "1" ]; then
  log "backup dry-run: would dump postgres to $BACKUP_DIR/daily/kingdoms_$STAMP.dump"
  exit 0
fi

DAILY_FILE="$BACKUP_DIR/daily/kingdoms_${DAY}.dump"
WEEKLY_FILE="$BACKUP_DIR/weekly/kingdoms_w${WEEK}.dump"

# Dump to a temp file first so a failure never truncates the previous daily.
TMP="$BACKUP_DIR/daily/.tmp_${STAMP}.dump"
trap 'rm -f "$TMP"' EXIT INT TERM
$COMPOSE exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$TMP"
mv "$TMP" "$DAILY_FILE"
trap - EXIT INT TERM

SHA="$(sha256sum "$DAILY_FILE" | awk '{print $1}')"
SIZE="$(wc -c < "$DAILY_FILE")"
log "daily backup OK $DAILY_FILE size=$SIZE sha256=$SHA"

cp "$DAILY_FILE" "$WEEKLY_FILE"
log "weekly backup OK $WEEKLY_FILE"

# Retention: keep the 7 most recent daily and 4 most recent weekly dumps.
find "$BACKUP_DIR/daily" -type f -name 'kingdoms_*.dump' -printf '%T@|%p\n' | sort -rn | tail -n +8 | cut -d'|' -f2- | while IFS= read -r file; do [ -n "$file" ] && rm -f -- "$file"; done
find "$BACKUP_DIR/weekly" -type f -name 'kingdoms_w*.dump' -printf '%T@|%p\n' | sort -rn | tail -n +5 | cut -d'|' -f2- | while IFS= read -r file; do [ -n "$file" ] && rm -f -- "$file"; done
log "retention applied: 7 daily, 4 weekly kept"
