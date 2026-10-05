#!/usr/bin/env node
// Genera el bloque de .htaccess (Apache) con los redirects 301 de las URLs viejas de WordPress.
// Uso: node scripts/generate-redirects.mjs   (Node >=18, sin dependencias)
//
// Entradas:
//   - noticias/*.html               -> slugs de posts y archivos de categoría que existen de verdad
//   - scripts/redirects-manual.json -> mapeos manuales (revisión humana, ver _nota)
// Salida (GENERADA, no editar a mano):
//   - deploy/htaccess-titamedia     -> pegar AL PRINCIPIO del .htaccess del docroot (antes de "# BEGIN WordPress")
//
// Qué cubre automáticamente:
//   /{categoria}/{slug}/               -> /noticias/{slug}.html        (solo si el slug existe)
//   /category/{x}/ y /page/N/          -> /noticias/categoria-{x}[-pagina-N].html (solo si existe)
// El resto del bloque (www→apex, https, 404 propio, protección de /wp-json/wp/v2/users) es fijo.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTICIAS_DIR = path.join(ROOT, 'noticias');
const OUT = path.join(ROOT, 'deploy/htaccess-titamedia');

// Categorías con posts en el WP actual (permalink /{categoria}/{slug}/).
const POST_CATEGORIES = [
  'agentes-ia', 'casos-de-exito', 'cro', 'ecommerce', 'estrategias-de-ventas-ecommerce',
  'expertos-ecommerce', 'ia', 'ia-retail', 'implementaciones', 'informativo',
  'plataformas-ecommerce', 'seo-ia', 'sin-categoria', 'tips', 'tita-news'
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const strip = (p) => p.replace(/^\//, '');                       // en .htaccess el patrón no lleva "/" inicial
const exact = (p) => `^${esc(strip(p).replace(/\/$/, ''))}/?$`;
const prefix = (p) => `^${esc(strip(p))}`;

const files = (await readdir(NOTICIAS_DIR)).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
const categoryFiles = files.filter((f) => f.startsWith('categoria-'));
const listingPages = files.filter((f) => /^pagina-\d+$/.test(f));
const postSlugs = files.filter((f) => !f.startsWith('categoria-') && !listingPages.includes(f)).sort();

const manual = JSON.parse(await readFile(path.join(ROOT, 'scripts/redirects-manual.json'), 'utf8'));
const rules = [];   // [patrón, destino|'410', comentario?]
const add = (pat, to, note) => rules.push([pat, to, note]);

for (const p of manual.gone) add(exact(p), '410');                                   // 1) Gone
for (const { from, to } of manual.exact) add(exact(from), to);                        // 2) Exactos manuales

const catSlugs = new Set(categoryFiles.map((f) => f.replace(/^categoria-/, '').replace(/-pagina-\d+$/, '')));
for (const c of [...catSlugs].sort()) {                                               // 3) Categorías
  add(`^category/${esc(c)}/page/(\\d+)/?$`, `/noticias/categoria-${c}-pagina-$1.html`);
  add(exact(`/category/${c}`), `/noticias/categoria-${c}.html`);
}

for (const { from, to } of manual.prefix) add(prefix(from), to);                      // 4) Prefijos manuales

// 4b) Títulos de posts usados como ruta (/Título del post), vistos en el log de 404 de WP (Redirection).
//     scripts/redirects-titulos.json: { "/Título": "slug-del-post" }; se ignora si el slug ya no existe.
const titulos = JSON.parse(await readFile(path.join(ROOT, 'scripts/redirects-titulos.json'), 'utf8'));
let nTitulos = 0;
for (const [from, slug] of Object.entries(titulos)) {
  if (!postSlugs.includes(slug)) continue;
  add(exact(from), `/noticias/${slug}.html`, 'titulo'); nTitulos++;
}

const alt = postSlugs.map(esc).join('|');                                             // 5) Posts (solo slugs reales)
add(`^(?:${POST_CATEGORIES.map(esc).join('|')})/+(${alt})/?$`, '/noticias/$1.html', `${postSlugs.length} posts`);

const rule = ([pat, to, note]) => {
  const p = pat.replace(/ /g, '\\ ');                       // los espacios separan argumentos en RewriteRule
  const nc = note === 'titulo' ? 'NC,' : '';                  // títulos de posts usados como ruta: sin distinguir mayúsculas
  return (note && note !== 'titulo' ? `# ${note}\n` : '') +
    (to === '410' ? `RewriteRule ${p} - [G,L]` : `RewriteRule ${p} ${to} [${nc}R=301,L]`);
};

const out = `# BEGIN titamedia-front
# GENERADO por scripts/generate-redirects.mjs — no editar a mano. Pegar al PRINCIPIO del .htaccess,
# antes de "# BEGIN WordPress". Respaldar el .htaccess actual antes de tocarlo.
DirectoryIndex index.html index.php
ErrorDocument 404 /404.html
ErrorDocument 410 /404.html

<IfModule mod_rewrite.c>
RewriteEngine On

# www -> apex y http -> https (apex es el canónico)
RewriteCond %{HTTP_HOST} ^www\\. [NC]
RewriteRule ^ https://titamedia.com%{REQUEST_URI} [R=301,L]
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://titamedia.com%{REQUEST_URI} [R=301,L]

# La carpeta /noticias/ no tiene índice: el listado es noticias.html
RewriteRule ^noticias/?$ /noticias.html [R=301,L]

# --- Redirects de URLs viejas de WordPress ---
${rules.map(rule).join('\n')}

# Enumeración de usuarios por la REST API (sin sesión de WP). El editor de WP, con sesión, no se afecta.
RewriteCond %{HTTP_COOKIE} !wordpress_logged_in_ [NC]
RewriteRule ^wp-json/wp/v2/users - [F,L]
RewriteCond %{HTTP_COOKIE} !wordpress_logged_in_ [NC]
RewriteCond %{QUERY_STRING} rest_route=/?wp/v2/users [NC]
RewriteRule ^ - [F,L]
# Opcional (descomentar solo si nada usa XML-RPC: app móvil de WP, Jetpack):
# RewriteRule ^xmlrpc\\.php$ - [F,L]

# Todo lo que no sea archivo/carpeta real ni ruta de WordPress -> 404 propio (no el tema de WP)
RewriteCond %{REQUEST_URI} !^/(wp-json|wp-admin|wp-content|wp-includes|wp-login\\.php|wp-cron\\.php|xmlrpc\\.php)
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ - [R=404,L]
</IfModule>
# END titamedia-front
`;
await writeFile(OUT, out);
console.log(`OK: ${path.relative(ROOT, OUT)} (${postSlugs.length} posts, ${catSlugs.size} categorías, ${manual.exact.length} exactos, ${manual.prefix.length} prefijos, ${nTitulos} títulos)`);
