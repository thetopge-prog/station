#!/usr/bin/env bash
# نشر ستيشن على الخادم الخاص. يعمل من cron كل دقيقتين: إن لم يتغيّر main لا يفعل شيئاً.
#   /opt/station/deploy.sh        ← ينشر فقط إن جاءت دفعة جديدة
#   /opt/station/deploy.sh force  ← يعيد البناء والتشغيل الآن
set -euo pipefail
ROOT=/opt/station
REPO=$ROOT/repo
HOST=${STATION_HOST:-station-anbar.duckdns.org}
ALT_HOST=${STATION_ALT_HOST:-station.187.124.112.104.sslip.io}
cd "$REPO"
git fetch -q origin main
if [ "${1:-}" != "force" ] && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then exit 0; fi
git reset -q --hard origin/main
echo "== $(date -Is) deploying $(git log -1 --pretty='%h %s')"
SUPA=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "$ROOT/.env" | cut -d= -f2- | tr -d "\r")
docker build -q --build-arg "NEXT_PUBLIC_SUPABASE_URL=$SUPA" -t station:latest .
docker rm -f station >/dev/null 2>&1 || true
docker run -d --name station --restart always --network coolify --env-file "$ROOT/.env" \
  -l traefik.enable=true \
  -l "traefik.http.routers.station-http.rule=Host(\`$HOST\`) || Host(\`$ALT_HOST\`)" \
  -l traefik.http.routers.station-http.entryPoints=http \
  -l traefik.http.routers.station-http.middlewares=station-https \
  -l traefik.http.middlewares.station-https.redirectscheme.scheme=https \
  -l traefik.http.middlewares.station-https.redirectscheme.permanent=true \
  -l "traefik.http.routers.station-https.rule=Host(\`$HOST\`) || Host(\`$ALT_HOST\`)" \
  -l traefik.http.routers.station-https.entryPoints=https \
  -l traefik.http.routers.station-https.tls.certresolver=letsencrypt \
  -l traefik.http.services.station-svc.loadbalancer.server.port=3000 \
  station:latest >/dev/null
docker image prune -f >/dev/null
echo "== up: https://$HOST"
