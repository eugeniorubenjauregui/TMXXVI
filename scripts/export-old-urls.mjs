#!/usr/bin/env node
// Exporta las URLs del sitio WordPress actual (sitemaps de Yoast) a deploy/urls-viejas.txt.
// Uso: node scripts/export-old-urls.mjs [origen]   (Node >=18, sin dependencias)
// Sirve de entrada a la verificación de redirects (ver CLAUDE.md, "Despliegue a producción").
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = process.argv[2] || 'https://titamedia.com';
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

async function get(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} en ${url}`);
  return res.text();
}

const index = locs(await get(`${ORIGIN}/sitemap_index.xml`));
const urls = new Set();
for (const sm of index) {
  const found = locs(await get(sm));
  console.log(`${String(found.length).padStart(4)}  ${sm}`);
  found.forEach((u) => urls.add(u));
}
const out = [...urls].sort();
await writeFile(path.join(ROOT, 'deploy/urls-viejas.txt'), out.join('\n') + '\n');
console.log(`OK: ${out.length} URLs únicas → deploy/urls-viejas.txt`);
