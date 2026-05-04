#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest..."
git pull --ff-only

echo "==> Installing dependencies..."
npm ci

echo "==> Generating Prisma client..."
npx prisma generate

echo "==> Running database migrations..."
npx prisma migrate deploy

echo "==> Building..."
npm run build

echo "==> Restarting kalenjin service..."
sudo systemctl restart kalenjin

echo "==> Deploy complete."
