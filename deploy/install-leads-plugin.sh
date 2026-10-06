#!/usr/bin/env bash
# Actualiza el plugin de leads (wp/tita-leads.php) en el WordPress de producción SIN crear duplicados.
# Uso:   deploy/install-leads-plugin.sh usuario@host /ruta/docroot-de-wordpress
#        deploy/install-leads-plugin.sh local /ruta/docroot-de-pruebas      (modo prueba, sin SSH)
#        INSTALL_NEW=plugin|mu ...    solo si NO existe ninguna copia y quieres instalarlo por primera vez
#        HEALTH_URL=https://titamedia.com/wp-login.php (por defecto)
#
# Qué hace, en orden:
#  1. Busca TODAS las copias de tita-leads.php en wp-content/plugins y wp-content/mu-plugins.
#     - 0 copias: se detiene (salvo INSTALL_NEW). - 2 o más: se detiene (PHP se cae con "Cannot redeclare").
#  2. Muestra el diff contra la del repo y pide confirmación.
#  3. Respalda la actual en ~/backups-prod/plugin-<sello>/, sube la nueva a un archivo temporal, la valida
#     con `php -l` (si hay php en el servidor) y solo entonces la mueve a su sitio.
#  4. Comprueba que el sitio responde (HEALTH_URL). Si no responde con 200/301/302, RESTAURA la anterior sola.
# NO define secretos: TITA_RECAPTCHA_SECRET y las constantes de HubSpot se escriben a mano en wp-config.php.
set -euo pipefail

TARGET="${1:?Falta usuario@host (o 'local')}"; DOCROOT="${2:?Falta la ruta del docroot de WordPress}"
HEALTH_URL="${HEALTH_URL:-https://titamedia.com/wp-login.php}"
cd "$(dirname "$0")/.."
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=/tmp/tm-cm-%C" -o ControlPersist=10m)   # una sola contraseña

run() { if [ "$TARGET" = "local" ]; then bash -c "$1"; else ssh "${SSH_OPTS[@]}" "$TARGET" "$1"; fi; }
put() { if [ "$TARGET" = "local" ]; then cp "$1" "$2"; else scp -q -o "ControlPath=/tmp/tm-cm-%C" "$1" "$TARGET:$2"; fi; }
health() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$HEALTH_URL" || true; }

run "test -f '$DOCROOT/wp-config.php'" || { echo "No hay wp-config.php en $DOCROOT"; exit 1; }

echo ">> Buscando copias de tita-leads.php…"
FOUND="$(run "find '$DOCROOT/wp-content/plugins' '$DOCROOT/wp-content/mu-plugins' -name tita-leads.php -type f 2>/dev/null | sort" || true)"
N="$(printf '%s\n' "$FOUND" | grep -c . || true)"
printf '%s\n' "$FOUND" | sed 's/^/   /'

if [ "$N" -ge 2 ]; then
  echo "!! Hay $N copias: cargarlas juntas tira WordPress (Cannot redeclare tita_leads_conf). No se cambia nada."
  echo "   Deja UNA (normalmente la de plugins/) moviendo las demás, p. ej.: mv <copia> ~/tita-leads.off"
  exit 1
elif [ "$N" -eq 1 ]; then
  DEST="$FOUND"
else
  case "${INSTALL_NEW:-}" in
    plugin) DEST="$DOCROOT/wp-content/plugins/wp/tita-leads.php" ;;
    mu)     DEST="$DOCROOT/wp-content/mu-plugins/tita-leads.php" ;;
    *) echo "!! No hay ninguna copia instalada. Si de verdad es una instalación nueva: INSTALL_NEW=plugin (o mu) $0 $TARGET $DOCROOT"; exit 1 ;;
  esac
fi
echo ">> Destino: $DEST"

if [ "$N" -eq 1 ]; then
  echo ">> Diferencias (- = servidor, + = repo):"
  run "cat '$DEST'" | diff -u --label servidor --label repo - wp/tita-leads.php || true
fi
read -r -p ">> ¿Reemplazar por la versión del repo? [s/N] " ok
[ "$ok" = "s" ] || { echo "Cancelado, no se cambió nada."; exit 0; }

STAMP="$(date +%F-%H%M)"; TMP="$DEST.new.$STAMP"
run "set -e; mkdir -p \"\$HOME/backups-prod/plugin-$STAMP\" \"\$(dirname '$DEST')\"
     [ -f '$DEST' ] && cp -p '$DEST' \"\$HOME/backups-prod/plugin-$STAMP/tita-leads.php\" || true"
put wp/tita-leads.php "$TMP"

if run "command -v php >/dev/null"; then
  run "php -l '$TMP'" || { run "rm -f '$TMP'"; echo "!! La versión nueva tiene errores de sintaxis. No se instaló."; exit 1; }
else
  echo "   (sin php en el servidor: no se pudo validar la sintaxis; la comprobación de salud lo cubrirá)"
fi

run "mv -f '$TMP' '$DEST'"
echo ">> Instalada. Comprobando el sitio ($HEALTH_URL)…"; sleep 2
CODE="$(health)"
case "$CODE" in
  200|301|302) echo ">> OK ($CODE). Respaldo en ~/backups-prod/plugin-$STAMP/" ;;
  *) echo "!! El sitio respondió '$CODE'. Restaurando la versión anterior…"
     if run "test -f \"\$HOME/backups-prod/plugin-$STAMP/tita-leads.php\""; then
       run "cp -p \"\$HOME/backups-prod/plugin-$STAMP/tita-leads.php\" '$DEST'"
     else run "rm -f '$DEST'"; fi
     sleep 2; echo ">> Tras restaurar, el sitio responde: $(health)"; exit 1 ;;
esac
cat <<MSG
   Siguiente: definir TITA_RECAPTCHA_SECRET en wp-config.php (sin ella reCAPTCHA no verifica nada) y probar el formulario.
   Restaurar a mano:  ssh $TARGET 'cp ~/backups-prod/plugin-$STAMP/tita-leads.php $DEST'
MSG
