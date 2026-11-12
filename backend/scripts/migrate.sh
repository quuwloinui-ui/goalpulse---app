#!/bin/sh
# Applies committed migrations; falls back to `db push` for the very first deploy.
set -e
PRISMA=./node_modules/.bin/prisma
if [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "[migrate] applying migrations"
  $PRISMA migrate deploy
else
  echo "[migrate] no migrations committed - syncing schema with 'db push'"
  echo "[migrate] (run 'npx prisma migrate dev --name init' locally and commit prisma/migrations)"
  $PRISMA db push --skip-generate
fi
