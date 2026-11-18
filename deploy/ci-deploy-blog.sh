#!/usr/bin/env bash
# Sube SOLO el blog generado (noticias/, noticias.html, sitemap.xml) al docroot de producción, desde GitHub Actions.
# Nunca borra nada remoto y nunca toca .htaccess, wp-*, js/ ni el resto del front (eso se despliega a mano).
# Entorno (secretos del environment "production" de GitHub):
#   DEPLOY_PROTO   sftp | ftps | ftp        DEPLOY_HOST    host            DEPLOY_PORT (opcional)
#   DEPLOY_USER    usuario                  DEPLOY_PASS    contraseña      DEPLOY_DIR  docroot remoto
#   DEPLOY_KNOWN_HOSTS  (solo sftp) salida de `ssh-keyscan host`            DEPLOY_DRY_RUN=1 solo lista
set -euo pipefail

: "${DEPLOY_PROTO:?}" "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${DEPLOY_PASS:?}" "${DEPLOY_DIR:?}"
case "$DEPLOY_PROTO" in sftp|ftps|ftp) ;; *) echo "DEPLOY_PROTO inválido"; exit 1;; esac
case "$DEPLOY_DIR" in ""|"/"|"~") echo "DEPLOY_DIR no válido"; exit 1;; esac
cd "$(dirname "$0")/.."
[ -f noticias.html ] && [ -f sitemap.xml ] && [ -d noticias ] || { echo "Faltan noticias.html, sitemap.xml o noticias/"; exit 1; }

LFTP_CFG=$(mktemp); trap 'rm -f "$LFTP_CFG"' EXIT
{
  echo "set cmd:fail-exit yes; set net:max-retries 3; set net:timeout 30"
  if [ "$DEPLOY_PROTO" = sftp ]; then
    : "${DEPLOY_KNOWN_HOSTS:?sftp requiere DEPLOY_KNOWN_HOSTS (ssh-keyscan host)}"
    mkdir -p ~/.ssh && printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
    echo 'set sftp:connect-program "ssh -a -x -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts"'
  else
    echo "set ftp:ssl-force $([ "$DEPLOY_PROTO" = ftps ] && echo yes || echo no)"
    echo "set ssl:verify-certificate yes"
  fi
  echo "open -u \"$DEPLOY_USER\",\"$DEPLOY_PASS\" ${DEPLOY_PROTO/ftps/ftp}://$DEPLOY_HOST${DEPLOY_PORT:+:$DEPLOY_PORT}"
  echo "cd \"$DEPLOY_DIR\""
} > "$LFTP_CFG"

MIRROR_OPTS="--reverse --parallel=4 --no-perms --no-umask --verbose"
[ "${DEPLOY_DRY_RUN:-}" = 1 ] && MIRROR_OPTS="$MIRROR_OPTS --dry-run" && echo ">> DRY RUN: no se sube nada"

# Respaldo de lo que hay en producción (para rollback vía artifact)
if [ "${DEPLOY_DRY_RUN:-}" != 1 ]; then
  mkdir -p backup/noticias
  lftp -f <(cat "$LFTP_CFG"; echo "mirror --parallel=4 noticias backup/noticias; mget -O backup noticias.html sitemap.xml || true; bye") >/dev/null || echo "(aviso) respaldo incompleto"
fi

{
  cat "$LFTP_CFG"
  echo "mirror $MIRROR_OPTS noticias noticias"
  [ "${DEPLOY_DRY_RUN:-}" = 1 ] || echo "mput -O . noticias.html sitemap.xml"
  echo "bye"
} > "$LFTP_CFG.run"; trap 'rm -f "$LFTP_CFG" "$LFTP_CFG.run"' EXIT
lftp -f "$LFTP_CFG.run"
echo ">> Subida terminada"
