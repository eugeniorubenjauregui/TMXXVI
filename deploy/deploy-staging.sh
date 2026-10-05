#!/usr/bin/env bash
# Despliega el front en el staging (xxvi.titamedia.xyz, DreamHost/Apache) por SSH + rsync.
# Uso:    deploy/deploy-staging.sh usuario@host /ruta/al/docroot-de-xxvi.titamedia.xyz
# Opciones por variable de entorno: DRY_RUN=1 (solo muestra qué subiría), DELETE=1 (borra lo que no esté en el repo).
# Qué hace: respalda el docroot remoto, sube solo lo público, escribe un .htaccess de staging
# (bloque de redirects + noindex) y un robots.txt que bloquea buscadores. NO toca WordPress ni producción.
# Después:  node scripts/verify-redirects.mjs https://xxvi.titamedia.xyz
set -euo pipefail

TARGET="${1:?Falta usuario@host}"
DOCROOT="${2:?Falta la ruta del docroot de staging}"
case "$DOCROOT" in *wp-config*|"/"|"~"|"") echo "Ruta de docroot no válida"; exit 1;; esac

cd "$(dirname "$0")/.."
node scripts/generate-redirects.mjs

RSYNC_OPTS=(-av --itemize-changes)
[ "${DRY_RUN:-0}" = "1" ] && RSYNC_OPTS+=(--dry-run)
[ "${DELETE:-0}" = "1" ] && RSYNC_OPTS+=(--delete)

STAMP="$(date +%F-%H%M)"
if [ "${DRY_RUN:-0}" != "1" ]; then
  echo ">> Respaldo remoto: ~/backups-staging/staging-$STAMP.tgz"
  ssh "$TARGET" "mkdir -p ~/backups-staging && tar czf ~/backups-staging/staging-$STAMP.tgz -C '$DOCROOT' ."
fi

echo ">> Subiendo archivos públicos"
rsync "${RSYNC_OPTS[@]}" \
  --include='*.html' --include='support.js' --include='favicon.ico' --include='llms.txt' \
  --include='sitemap.xml' --include='js/***' --include='images/***' --include='noticias/***' \
  --exclude='*' ./ "$TARGET:$DOCROOT/"

[ "${DRY_RUN:-0}" = "1" ] && { echo ">> DRY_RUN: no se escribió .htaccess ni robots.txt"; exit 0; }

echo ">> .htaccess de staging (redirects + noindex) y robots.txt restrictivo"
{
  cat deploy/htaccess-titamedia
  printf '\n# Staging: que no se indexe\n<IfModule mod_headers.c>\nHeader set X-Robots-Tag "noindex, nofollow"\n</IfModule>\n'
} | ssh "$TARGET" "cat > '$DOCROOT/.htaccess' && printf 'User-agent: *\nDisallow: /\n' > '$DOCROOT/robots.txt'"

echo ">> Listo. Verifica con: node scripts/verify-redirects.mjs https://xxvi.titamedia.xyz"
