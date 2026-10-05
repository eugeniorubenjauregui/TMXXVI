#!/usr/bin/env node
// Genera el mapa de redirects 301 (URLs viejas de WordPress -> sitio nuevo) para Nginx.
// Uso: node scripts/generate-redirects.mjs   (Node >=18, sin dependencias)
//
// Entradas:
//   - noticias/*.html          -> slugs de posts y archivos de categoría que existen de verdad
//   - scripts/redirects-manual.json -> mapeos manuales (revisión humana, ver _nota)
// Salida (GENERADA, no editar a mano):
//   - redirects.nginx.map      -> incluir dentro de http { } y usar con las reglas de
//                                 `deploy/nginx-redirects-snippet.conf`
//
// Qué cubre automáticamente:
//   /{categoria}/{slug}/               -> /noticias/{slug}.html        (solo si el slug existe)
//   /category/{x}/ y /page/N/          -> /noticias/categoria-{x}[-pagina-N].html (solo si existe)

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTICIAS_DIR = path.join(ROOT, 'noticias');
const OUT = path.join(ROOT, 'redirects.nginx.map');

// Categorías con posts en el WP actual (permalink /{categoria}/{slug}/).
const POST_CATEGORIES = [
  'agentes-ia', 'casos-de-exito', 'cro', 'ecommerce', 'estrategias-de-ventas-ecommerce',
  'expertos-ecommerce', 'ia', 'ia-retail', 'implementaciones', 'informativo',
  'plataformas-ecommerce', 'seo-ia', 'sin-categoria', 'tips', 'tita-news'
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactRe = (p) => `~^${esc(p.replace(/\/$/, ''))}/?$`;
const prefixRe = (p) => `~^${esc(p)}`;

const files = (await readdir(NOTICIAS_DIR)).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
const categoryFiles = files.filter((f) => f.startsWith('categoria-'));
const listingPages = files.filter((f) => /^pagina-\d+$/.test(f));
const postSlugs = files.filter((f) => !f.startsWith('categoria-') && !listingPages.includes(f)).sort();

const manual = JSON.parse(await readFile(path.join(ROOT, 'scripts/redirects-manual.json'), 'utf8'));
const lines = [];
const add = (key, value, comment) => lines.push(`${comment ? `# ${comment}\n` : ''}${key} ${value};`);

lines.push('# GENERADO por scripts/generate-redirects.mjs — no editar a mano.');
lines.push('# Valor numérico 410 = Gone; cualquier otro valor = destino del 301.');

// 1) Gone
for (const p of manual.gone) add(exactRe(p), '410');

// 2) Exactos manuales
for (const { from, to } of manual.exact) add(exactRe(from), to);

// 3) Paginación de categorías /category/{x}/page/N/ y /category/{x}/
const catSlugs = new Set(categoryFiles.map((f) => f.replace(/^categoria-/, '').replace(/-pagina-\d+$/, '')));
for (const c of [...catSlugs].sort()) {
  add(`~^/category/${esc(c)}/page/(?<n>\\d+)/?$`, `/noticias/categoria-${c}-pagina-$n.html`);
  add(exactRe(`/category/${c}`), `/noticias/categoria-${c}.html`);
}

// 4) Prefijos manuales (después de los exactos para que gane lo específico)
for (const { from, to } of manual.prefix) add(prefixRe(from), to);

// 5) Posts: una sola regex con los slugs reales (evita redirigir a archivos inexistentes)
const alt = postSlugs.map(esc).join('|');
add(`~^/(?:${POST_CATEGORIES.map(esc).join('|')})/(?<s>${alt})/?$`, '/noticias/$s.html',
  `${postSlugs.length} posts`);

await writeFile(OUT, lines.join('\n') + '\n');
console.log(`OK: ${path.relative(ROOT, OUT)} (${postSlugs.length} posts, ${catSlugs.size} categorías, ${manual.exact.length} exactos, ${manual.prefix.length} prefijos)`);
