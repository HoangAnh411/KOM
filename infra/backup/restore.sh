#!/usr/bin/env sh
set -eu

# Restore drill: restore one dump into a fresh database, verify schema with the
# migration runner (db:migrate:check) and smoke-check the state table loads.
# Run before the closed beta and monthly afterwards; record the result in the operations runbook.
#
#   TEST_DATABASE_URL=postgres://kingdoms:kingdoms@postgres:5432/kingdoms_restore_test \
#   ./infra/backup/restore.sh backups/daily/kingdoms_20260824.dump
#
# Requires the prod compose stack to be up (postgres reachable inside the docker network).

cd "$(dirname "$0")/../.."
DUMP="${1:?usage: restore.sh <dumpfile>}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:?TEST_DATABASE_URL is required}"

case "$TEST_DATABASE_URL" in
  *_test) ;;
  *) echo "ERROR: restore target must be a dedicated *_test database (got $TEST_DATABASE_URL)" >&2; exit 1 ;;
esac

set -a; . ./.env.prod; set +a
if [ ! -f "$DUMP" ]; then echo "ERROR: dump not found: $DUMP" >&2; exit 1; fi
COMPOSE="docker compose --env-file .env.prod -f infra/docker-compose.prod.yml"
DB_NAME="$(echo "$TEST_DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')"

echo "[restore] creating fresh database $DB_NAME"
$COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -qc "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)"
$COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -qc "CREATE DATABASE \"$DB_NAME\""

echo "[restore] restoring $DUMP"
cat "$DUMP" | $COMPOSE exec -T postgres pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$DB_NAME"
echo "[restore] restore complete; verifying migration checksums"
RUN_DB="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$DB_NAME"
$COMPOSE run --rm --no-deps -e DATABASE_URL="$RUN_DB" game node apps/server/dist/migrate.js check

echo "[restore] smoke check: game state and auth tables load"
$COMPOSE run --rm --no-deps -e DATABASE_URL="$RUN_DB" game node --input-type=module -e "
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const state = await pool.query(\"SELECT count(*)::int AS n FROM game_state WHERE state_key='kingdom'\");
const users = await pool.query('SELECT count(*)::int AS n FROM users');
const backlog = await pool.query('SELECT count(*)::int AS n FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL');
if (state.rows[0].n < 1) throw new Error('game_state kingdom row missing');
console.log('smoke OK: game_state=' + state.rows[0].n + ' users=' + users.rows[0].n + ' outbox_backlog=' + backlog.rows[0].n);
await pool.end();
"
echo "[restore] restore drill succeeded: $(basename "$DUMP") (UTC $(date -uIs))"
