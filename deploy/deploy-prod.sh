#!/usr/bin/env bash
# Despliega el front nuevo en PRODUCCIÓN (mismo docroot que WordPress, Apache/DreamHost).
# Uso:  deploy/deploy-prod.sh usuario@host /ruta/docroot            -> ENSAYO (no escribe nada)
#       APPLY=1 deploy/deploy-prod.sh usuario@host /ruta/docroot    -> aplica
#       deploy/deploy-prod.sh rollback usuario@host /ruta/docroot <sello>   -> deshace un despliegue
#
# Al aplicar: (1) comprueba que el docroot es el de WordPress (wp-config.php), (2) guarda en
# ~/backups-prod/<sello>/ el .htaccess, cada archivo que se vaya a SOBRESCRIBIR y la lista de archivos NUEVOS,
# (3) sube solo lo público (sin borrar nada), (4) reemplaza/antepone el bloque titamedia-front en .htaccess
# (conserva WordPress y Wordfence). No toca la base de datos, plugins, temas ni wp-content.
set -euo pipefail

SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=/tmp/tm-cm-%C" -o ControlPersist=10m)   # una sola contraseña
rssh() { ssh "${SSH_OPTS[@]}" "$@"; }

if [ "${1:-}" = "rollback" ]; then
  TARGET="${2:?usuario@host}"; DOCROOT="${3:?docroot}"; STAMP="${4:?sello (carpeta en ~/backups-prod)}"
  echo ">> Rollback del despliegue $STAMP en $DOCROOT"
  rssh "$TARGET" "set -e; B=\$HOME/backups-prod/$STAMP; test -d \"\$B\" || { echo 'No existe '\$B; exit 1; }
    cp \"\$B/htaccess.antes\" '$DOCROOT/.htaccess'
    [ -d \"\$B/files\" ] && cp -a \"\$B/files/.\" '$DOCROOT/'
    [ -s \"\$B/new-files.txt\" ] && while IFS= read -r f; do rm -f -- '$DOCROOT'/\"\$f\"; done < \"\$B/new-files.txt\"
    echo 'Rollback aplicado: .htaccess y archivos restaurados; archivos nuevos eliminados.'"
  exit 0
fi

TARGET="${1:?Falta usuario@host}"; DOCROOT="${2:?Falta la ruta del docroot de titamedia.com}"
case "$DOCROOT" in *xxvi*|"/"|"~"|"") echo "Docroot no válido (¿es el de producción, no el de staging?)"; exit 1;; esac

cd "$(dirname "$0")/.."
[ -z "$(git status --porcelain)" ] || { echo "Hay cambios sin commit: despliega solo desde un árbol limpio."; exit 1; }
node scripts/generate-redirects.mjs >/dev/null
[ -z "$(git status --porcelain)" ] || { echo "deploy/htaccess-titamedia no coincide con el commit (corre generate-redirects y haz commit)."; exit 1; }

INCLUDES=(--include='*.html' --include='support.js' --include='favicon.ico' --include='llms.txt'
          --include='robots.txt' --include='sitemap.xml' --include='js/***' --include='images/***'
          --include='noticias/***' --exclude='*')

echo ">> Comprobando que $DOCROOT es WordPress"
rssh "$TARGET" "test -f '$DOCROOT/wp-config.php' && test -f '$DOCROOT/.htaccess'" \
  || { echo "No hay wp-config.php/.htaccess en $DOCROOT: ruta incorrecta."; exit 1; }

echo ">> ENSAYO: archivos que se subirían (+++++++ = nuevo; el resto SOBRESCRIBE algo existente)"
PLAN="$(rsync -a -n --itemize-changes -e "ssh ${SSH_OPTS[*]}" "${INCLUDES[@]}" ./ "$TARGET:$DOCROOT/" | grep '^<f' || true)"
NEW="$(printf '%s\n' "$PLAN" | grep '^<f+++++++' | sed 's/^<f+++++++ //' || true)"
OVER="$(printf '%s\n' "$PLAN" | grep -v '^<f+++++++' | grep . | sed 's/^<f[^ ]* //' || true)"
echo "   nuevos: $(printf '%s\n' "$NEW" | grep -c . || true) | sobrescritos: $(printf '%s\n' "$OVER" | grep -c . || true)"
echo "   --- sobrescritos que NO son de noticias/ (revisar):"
printf '%s\n' "$OVER" | grep -v '^noticias/' | sed 's/^/     /' || true
echo "   --- nuevos en la raíz:"
printf '%s\n' "$NEW" | grep -v '/' | sed 's/^/     /' || true

if [ "${APPLY:-0}" != "1" ]; then
  echo ">> ENSAYO terminado. Nada se escribió. Para aplicar: APPLY=1 $0 $TARGET $DOCROOT"; exit 0
fi

STAMP="$(date +%F-%H%M)"
echo ">> APLICANDO (sello $STAMP). Respaldos en ~/backups-prod/$STAMP"
rssh "$TARGET" "set -e; B=\$HOME/backups-prod/$STAMP; mkdir -p \"\$B/files\"; cp -p '$DOCROOT/.htaccess' \"\$B/htaccess.antes\""
printf '%s\n' "$NEW" | rssh "$TARGET" "cat > \$HOME/backups-prod/$STAMP/new-files.txt"
rsync -a --itemize-changes --backup --backup-dir="/home/${TARGET%@*}/backups-prod/$STAMP/files" \
  -e "ssh ${SSH_OPTS[*]}" "${INCLUDES[@]}" ./ "$TARGET:$DOCROOT/" | grep '^<f' | wc -l | xargs echo "   archivos subidos:"

echo ">> .htaccess: instalando bloque titamedia-front al principio"
rssh "$TARGET" "cat > /tmp/tm-block.$STAMP" < deploy/htaccess-titamedia
rssh "$TARGET" "set -e; cd '$DOCROOT'
  awk '/^# BEGIN titamedia-front/{s=1} !s{print} /^# END titamedia-front/{s=0}' .htaccess > /tmp/tm-rest.$STAMP
  cat /tmp/tm-block.$STAMP /tmp/tm-rest.$STAMP > .htaccess.new && mv .htaccess.new .htaccess
  rm -f /tmp/tm-block.$STAMP /tmp/tm-rest.$STAMP"

cat <<MSG
>> Aplicado. Verifica YA:
   curl -sI https://titamedia.com/ | head -3
   node scripts/verify-redirects.mjs https://titamedia.com
   Si algo está mal:  $0 rollback $TARGET $DOCROOT $STAMP
MSG
