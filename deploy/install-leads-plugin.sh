#!/usr/bin/env bash
# Instala/actualiza el mu-plugin de leads (wp/tita-leads.php) en el WordPress de producción.
# Uso: deploy/install-leads-plugin.sh usuario@host /ruta/docroot-de-wordpress
# Hace: respaldo del plugin actual en ~/backups-prod/, muestra el diff contra el del repo,
# pide confirmación y copia. NO define secretos: TITA_RECAPTCHA_SECRET y las constantes de HubSpot
# se escriben a mano en wp-config.php (nunca en el repo ni en este script).
set -euo pipefail

TARGET="${1:?Falta usuario@host}"; DOCROOT="${2:?Falta la ruta del docroot de WordPress}"
cd "$(dirname "$0")/.."
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=/tmp/tm-cm-%C" -o ControlPersist=10m)   # una sola contraseña
rssh() { ssh "${SSH_OPTS[@]}" "$@"; }
DEST="$DOCROOT/wp-content/mu-plugins/tita-leads.php"

rssh "$TARGET" "test -f '$DOCROOT/wp-config.php'" || { echo "No hay wp-config.php en $DOCROOT"; exit 1; }

if rssh "$TARGET" "test -f '$DEST'"; then
  echo ">> Plugin actual encontrado. Diferencias (- = servidor, + = repo):"
  rssh "$TARGET" "cat '$DEST'" | diff -u --label servidor --label repo - wp/tita-leads.php || true
else
  echo ">> No hay plugin instalado en $DEST (instalación nueva)."
  echo "   Recuerda: sin TITA_HUBSPOT_* en wp-config.php los leads se guardan pero no llegan a HubSpot."
fi

read -r -p ">> ¿Copiar la versión del repo al servidor? [s/N] " ok
[ "$ok" = "s" ] || { echo "Cancelado, no se cambió nada."; exit 0; }

STAMP="$(date +%F-%H%M)"
rssh "$TARGET" "set -e; mkdir -p \$HOME/backups-prod/plugin-$STAMP '$DOCROOT/wp-content/mu-plugins'
  [ -f '$DEST' ] && cp -p '$DEST' \$HOME/backups-prod/plugin-$STAMP/tita-leads.php || true"
scp -o "ControlPath=/tmp/tm-cm-%C" wp/tita-leads.php "$TARGET:$DEST"
rssh "$TARGET" "php -l '$DEST' 2>&1 || true"
cat <<MSG
>> Listo. Respaldo en ~/backups-prod/plugin-$STAMP/ (si había plugin previo).
   Restaurar:  ssh $TARGET 'cp ~/backups-prod/plugin-$STAMP/tita-leads.php $DEST'
   Siguiente:  definir TITA_RECAPTCHA_SECRET en wp-config.php y probar el formulario.
MSG
