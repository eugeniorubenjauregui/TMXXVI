# Runbook: corte del front nuevo en el VPS (Apache, mismo docroot que WordPress)

Placeholders: `<DOCROOT>` (carpeta de titamedia.com en el VPS, la que contiene `wp-config.php`), `<REPO>` (checkout local del repo en la rama a desplegar). No pegar credenciales aquí: usar `~/.my.cnf` o variables de entorno.

## 0. Antes (sin tocar el sitio)
1. En WP admin → Herramientas → **Redirection** → Import/Export: exportar los redirects actuales (JSON) y revisarlos; los útiles se añaden a `scripts/redirects-manual.json` (el bloque nuevo los deja de ejecutar).
2. Confirmar que el plugin de leads está instalado: `curl -s https://titamedia.com/wp-json/ | grep -o '"tita/v1"'` (hoy aparece) y que `wp-content/mu-plugins/tita-leads.php` es la versión de este repo (copiar la nueva si no: trae el reCAPTCHA). Constantes en `wp-config.php`: `TITA_HUBSPOT_TOKEN`, `TITA_HUBSPOT_PORTAL_ID`, `TITA_HUBSPOT_FORM_GUID` y, al activar reCAPTCHA, `TITA_RECAPTCHA_SECRET`.
3. Regenerar y revisar: `node scripts/generate-blog.mjs && node scripts/generate-redirects.mjs && git status`.
4. (Recomendado) Probar en un subdominio gratuito del panel de DreamHost (`staging.titamedia.com`, directorio propio, con `noindex` y clave básica): copiar allí los archivos del paso 3 de abajo, un `.htaccess` con el bloque generado y correr `TM_BASIC_AUTH=usuario:clave node scripts/verify-redirects.mjs https://staging.titamedia.com`.

## 1. Respaldo (obligatorio)
```bash
ssh <usuario>@<host>
cd <DOCROOT>/..
tar czf ~/backup-titamedia-$(date +%F).tgz <carpeta-docroot>          # archivos
mysqldump -h <HOST_DB> -u <USUARIO_DB> -p <NOMBRE_DB> > ~/backup-titamedia-$(date +%F).sql   # pide la clave
cp <DOCROOT>/.htaccess ~/htaccess.bak-$(date +%F)
```
(También sirve All-in-One WP Migration, ya instalado, para una copia completa.)

## 2. Corte (ventana de poco tráfico)
Desde `<REPO>`, subir solo lo público (no `scripts/`, `deploy/`, `wp/`, `.git`, `CLAUDE.md`, `dev.sh`):
```bash
rsync -av --itemize-changes \
  --include='*.html' --include='support.js' --include='favicon.ico' --include='robots.txt' --include='sitemap.xml' \
  --include='js/***' --include='images/***' --include='noticias/***' \
  --exclude='*' ./ <usuario>@<host>:<DOCROOT>/
```
Luego, **una sola vez**, anteponer el bloque al `.htaccess` (conserva lo existente: WordPress, Wordfence):
```bash
cd <DOCROOT>
if grep -q 'BEGIN titamedia-front' .htaccess; then
  echo "YA APLICADO, no repetir"
else
  cat ~/deploy-htaccess-titamedia .htaccess > .htaccess.new && mv .htaccess.new .htaccess
fi
```
(`deploy/htaccess-titamedia` se sube antes a `~/deploy-htaccess-titamedia`.) Si el sitio da 500: ver el error log de DreamHost, o restaurar al instante: `cp ~/htaccess.bak-<fecha> <DOCROOT>/.htaccess`.

## 3. Verificar (inmediato)
```bash
node scripts/verify-redirects.mjs https://titamedia.com        # todas las URLs viejas: un solo 301 → 200, o 410
curl -sI https://titamedia.com/ | head -3                       # home nueva (index.html)
curl -sI https://titamedia.com/wp-json/wp/v2/users              # 403 sin sesión
curl -s  https://titamedia.com/wp-json/wp/v2/posts?per_page=1 | head -c 100   # sigue funcionando
```
Y a mano: enviar el formulario (llega a MySQL y HubSpot), abrir un post con imágenes, entrar a `/wp-admin` con tu usuario, GTM disparando (Tag Assistant). Si usas un plugin de caché de WP o caché de DreamHost, vaciarlo.

## 4. Después
- GSC (cuando haya acceso): enviar `https://titamedia.com/sitemap.xml`, inspeccionar home y 3-5 posts.
- Vigilar 4-8 semanas: 404 (logs de Apache), cobertura en GSC, sesiones en GA4 vs. el mismo periodo previo.
- Mantener los redirects al menos 12 meses.

## Rollback (segundos)
```bash
cp ~/htaccess.bak-<fecha> <DOCROOT>/.htaccess     # quita redirects y el 404 propio
rm <DOCROOT>/index.html                           # la home vuelve a ser la de WP (index.php)
```
Los demás archivos nuevos (`nosotros.html`, `noticias/`, etc.) no estorban a WP. Para volver al estado exacto: restaurar el `.tgz`.
