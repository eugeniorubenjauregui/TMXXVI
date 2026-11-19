#!/usr/bin/env bash
# Valida (solo lectura) el directorio de titamedia.com en el servidor y dice qué poner en DEPLOY_DIR.
# Uso:  deploy/validar-docroot.sh usuario@host [/ruta/docroot]
#   Sin ruta: busca carpetas de ~ que tengan wp-config.php y las valida una por una.
# No escribe nada en el servidor; solo prueba si la carpeta es escribible con `test -w`.
set -euo pipefail

TARGET="${1:?Uso: $0 usuario@host [/ruta/docroot]}"
DIR="${2:-}"

ssh -o ConnectTimeout=15 "$TARGET" 'bash -s' -- "$DIR" <<'REMOTE'
DIR="$1"
if [ -n "$DIR" ]; then
  CANDS="$DIR"
else
  CANDS=$(for d in "$HOME"/*/; do [ -f "${d}wp-config.php" ] && echo "${d%/}"; done)
fi
[ -n "$CANDS" ] || { echo "✗ No encontré ninguna carpeta con wp-config.php bajo $HOME"; exit 1; }

ok=0
for d in $CANDS; do
  echo "== $d"
  chk() { if eval "$2"; then echo "  ✓ $1"; else echo "  ✗ $1"; return 1; fi; }
  fallo=0
  chk "existe y es carpeta"                    "[ -d '$d' ]"                     || fallo=1
  chk "tiene wp-config.php (es WordPress)"     "[ -f '$d/wp-config.php' ]"       || fallo=1
  chk "tiene .htaccess"                        "[ -f '$d/.htaccess' ]"           || fallo=1
  chk "tiene index.html (front estático)"      "[ -f '$d/index.html' ]"          || fallo=1
  chk "tiene noticias.html y noticias/"        "[ -f '$d/noticias.html' ] && [ -d '$d/noticias' ]" || fallo=1
  chk "tiene wp-content/"                      "[ -d '$d/wp-content' ]"          || fallo=1
  chk "noticias/ es escribible por este usuario" "[ -w '$d/noticias' ]"          || fallo=1
  chk "noticias.html es escribible"            "[ -w '$d/noticias.html' ]"       || fallo=1
  case "$d" in *xxvi*|*staging*|*dev*) echo "  ⚠ el nombre parece staging/dev, confirma que es producción";; esac
  if [ "$fallo" = 0 ]; then echo "  → VÁLIDA. DEPLOY_DIR = $(cd "$d" && pwd -P)"; ok=$((ok+1)); fi
done
[ "$ok" -ge 1 ] || { echo; echo "✗ Ninguna carpeta pasó todas las comprobaciones"; exit 1; }
[ "$ok" -eq 1 ] || echo "⚠ Hay $ok carpetas válidas: elige la de titamedia.com (no la de staging)."
REMOTE
