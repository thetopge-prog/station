#!/usr/bin/env bash
# نشر ستيشن على الخادم الخاص. يعمل من cron كل دقيقتين: إن لم يتغيّر main لا يفعل شيئاً.
#   /opt/station/deploy.sh        ← ينشر فقط إن جاءت دفعة جديدة
#   /opt/station/deploy.sh force  ← يعيد البناء والتشغيل الآن
set -euo pipefail
ROOT=/opt/station
REPO=$ROOT/repo
HOST=${STATION_HOST:-stationiraq.com}
# الأسماء القديمة تبقى تعمل: الأجهزة والروابط المطبوعة لا تُكسر
ALT1=${STATION_ALT1:-www.stationiraq.com}
ALT2=${STATION_ALT2:-station-anbar.duckdns.org}
ALT3=${STATION_ALT3:-station.187.124.112.104.sslip.io}
# قفلٌ داخل السكربت لا على المنادي.
#
# كان القفل في سطر cron وحده (`flock -n … deploy.sh`)، فمن نادى السكربت بيده —
# وهو ما يحدث مع كل نشر مستعجل — مرّ بلا قفل بجانب دورة cron جارية. فبنى
# الاثنان، ثم حذف أحدهما الحاوية وأنشأها، فاصطدم الثاني بـ«الاسم مستعمَل»
# وأرسل إنذار فشلٍ عن نشرةٍ كانت ناجحة. القفل هنا يسري على كل نداء.
exec 9>"$ROOT/.lock"
if ! flock -n 9; then
  echo "== $(date -Is) نشرٌ آخر يعمل الآن — تُرك لهُ"
  exit 0
fi

# بناءٌ فاشل كان يخرج بصمت: الحاوية القديمة تبقى تعمل، والموقع يبدو سليماً،
# والدفعة الجديدة ليست عليه — عرفناها بعد يوم بالمصادفة. الآن يصل خبرها.
LOG=$(mktemp)
fail() {
  # هل الموقع واقف أم يعمل بالنسخة السابقة؟ الفرق بين «أصلحه الآن» و«أصلحه
  # صباحاً» — والرسالة بلا هذا السطر تُفزع بلا سبب
  local code alive
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 20 "https://$HOST/" || echo 000)
  if [ "$code" = "200" ]; then alive="الموقع يعمل بالنسخة السابقة ✅"; else alive="⚠️ الموقع لا يستجيب ($code)"; fi
  local msg="ستيشن: فشل نشر $(git -C "$REPO" log -1 --pretty='%h %s' 2>/dev/null)
$alive
$(tail -c 700 "$LOG")"
  local tok ids
  tok=$(grep "^TELEGRAM_BOT_TOKEN=" "$ROOT/.env" | cut -d= -f2- | tr -d "
")
  ids=$(grep "^TG_OWNER_IDS=" "$ROOT/.env" | cut -d= -f2- | tr -d "
")
  for id in ${ids//,/ }; do
    [ -n "$tok" ] && [ -n "$id" ] && curl -sS -m 15 -o /dev/null       --data-urlencode "text=$msg" -d "chat_id=$id"       "https://api.telegram.org/bot$tok/sendMessage" || true
  done
  echo "== FAILED, owner notified"
}
trap 'rc=$?; [ $rc -ne 0 ] && fail; rm -f "$LOG"; exit $rc' EXIT

cd "$REPO"
git fetch -q origin main
if [ "${1:-}" != "force" ] && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then exit 0; fi
git reset -q --hard origin/main
echo "== $(date -Is) deploying $(git log -1 --pretty='%h %s')"
SUPA=$(grep "^NEXT_PUBLIC_SUPABASE_URL=" "$ROOT/.env" | cut -d= -f2- | tr -d "\r")
docker build -q --build-arg "NEXT_PUBLIC_SUPABASE_URL=$SUPA" -t station:latest . 2>&1 | tee -a "$LOG"
[ "${PIPESTATUS[0]}" -eq 0 ]
docker rm -f station >/dev/null 2>&1 || true
docker run -d --name station --restart always --network coolify --env-file "$ROOT/.env" \
  -l traefik.enable=true \
  -l "traefik.http.routers.station-http.rule=Host(\`$HOST\`) || Host(\`$ALT1\`) || Host(\`$ALT2\`) || Host(\`$ALT3\`)" \
  -l traefik.http.routers.station-http.entryPoints=http \
  -l traefik.http.routers.station-http.middlewares=station-https \
  -l traefik.http.middlewares.station-https.redirectscheme.scheme=https \
  -l traefik.http.middlewares.station-https.redirectscheme.permanent=true \
  -l "traefik.http.routers.station-https.rule=Host(\`$HOST\`) || Host(\`$ALT1\`) || Host(\`$ALT2\`) || Host(\`$ALT3\`)" \
  -l traefik.http.routers.station-https.entryPoints=https \
  -l traefik.http.routers.station-https.tls.certresolver=letsencrypt \
  -l traefik.http.services.station-svc.loadbalancer.server.port=3000 \
  station:latest >/dev/null
docker image prune -f >/dev/null
# السكربت نفسه يأتي من المستودع: نسخةٌ واحدة تُعدَّل، لا نسختان تفترقان.
#
# ونقلٌ ذرّي لا كتابةٌ فوق الملفّ: bash يقرأ سكربته على دفعات وهو يشتغل، فالكتابة
# فوق الملفّ الجاري تنفيذه تجعله يُكمل القراءة من موضعٍ في نصٍّ جديد — وهو عطلٌ
# لا يظهر إلا حين يتغيّر طول الملفّ. و`mv` يستبدل الاسم ويترك العقدة القديمة
# حيّةً للعملية الجارية.
install -m 755 "$REPO/deploy/vps.sh" "$ROOT/deploy.sh.new" && mv -f "$ROOT/deploy.sh.new" "$ROOT/deploy.sh"
echo "== up: https://$HOST"
