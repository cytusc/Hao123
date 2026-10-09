#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TASK_LOCAL="$TASK_ROOT/.local"
mkdir -p "$TASK_LOCAL"
chmod 700 "$TASK_LOCAL"
if [[ ! -f "$TASK_LOCAL/backend.env" ]]; then
  umask 077
  TASK_ADMIN_PASSWORD="$(openssl rand -hex 12)"
  cat > "$TASK_LOCAL/backend.env" <<EOF
export DATABASE_URL='postgres://$(id -un)@127.0.0.1:55432/hao123?sslmode=disable'
export ADMIN_EMAIL='admin@hao123.local'
export ADMIN_PASSWORD='$TASK_ADMIN_PASSWORD'
export HTTP_ADDR='127.0.0.1:8080'
EOF
  printf '%s\n' "$TASK_ADMIN_PASSWORD" > "$TASK_LOCAL/admin-password"
fi
if [[ ! -f "$TASK_LOCAL/postgres/PG_VERSION" ]]; then
  "$TASK_PG_BIN/initdb" -D "$TASK_LOCAL/postgres" --auth-local=trust --auth-host=trust > "$TASK_LOCAL/postgres-init.log"
fi
if ! "$TASK_PG_BIN/pg_ctl" -D "$TASK_LOCAL/postgres" status > /dev/null 2>&1; then
  "$TASK_PG_BIN/pg_ctl" -D "$TASK_LOCAL/postgres" -l "$TASK_LOCAL/postgres.log" -o "-p 55432 -h 127.0.0.1 -k $TASK_LOCAL" start
fi
if ! "$TASK_PG_BIN/psql" -h 127.0.0.1 -p 55432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='hao123'" | rg -q 1; then
  "$TASK_PG_BIN/createdb" -h 127.0.0.1 -p 55432 hao123
fi
source "$TASK_LOCAL/backend.env"
cd "$TASK_ROOT/backend"
printf '开发管理员邮箱：admin@hao123.local；密码保存在 .local/admin-password\n'
exec go run .
