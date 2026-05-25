#!/usr/bin/env bash
# Run ON the EC2 instance (Ubuntu) after cloning SchoolTime and creating .env
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ ! -f .env ]]; then
  echo "Create .env first (see docs/AWS_FREE_TIER_SETUP.md Part 4.4)"
  exit 1
fi
docker build -t schooltime-api .
docker rm -f schooltime-api 2>/dev/null || true
docker run -d --name schooltime-api --restart unless-stopped \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  schooltime-api
echo "API listening on 127.0.0.1:8787 — put Caddy in front for HTTPS."
docker logs --tail 30 schooltime-api
