#!/usr/bin/env node
// Verifica los redirects de las URLs viejas contra un servidor (staging o producción).
// Uso: node scripts/verify-redirects.mjs <base> [archivo]   (Node >=18, sin dependencias)
//   base     p. ej. https://staging.titamedia.com  (con clave básica: TM_BASIC_AUTH="usuario:clave")
//   archivo  por defecto deploy/urls-viejas.txt (una URL por línea; se usa solo el path)
// Criterio por URL: un solo 301 hacia un destino que responde 200, o 410 (intencional), o 200 directo.
// Falla (exit 1) si hay cadenas de redirects, destinos que no dan 200 o 404/5xx.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) { console.error('Uso: node scripts/verify-redirects.mjs <base> [archivo]'); process.exit(2); }
const file = process.argv[3] || path.join(ROOT, 'deploy/urls-viejas.txt');
const headers = process.env.TM_BASIC_AUTH
  ? { Authorization: 'Basic ' + Buffer.from(process.env.TM_BASIC_AUTH).toString('base64') } : {};

const hit = (u) => fetch(u, { redirect: 'manual', headers });
const paths = (await readFile(file, 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean)
  .map((u) => { try { return new URL(u).pathname + new URL(u).search; } catch { return u; } });

const rows = { ok: [], gone: [], bad: [] };
let i = 0;
async function worker() {
  while (i < paths.length) {
    const p = paths[i++];
    try {
      const r1 = await hit(base + p);
      if (r1.status === 410) { rows.gone.push([p, 410, '']); continue; }
      if (r1.status === 200) { rows.ok.push([p, 200, '(sin redirect)']); continue; }
      if (r1.status !== 301) { rows.bad.push([p, r1.status, 'esperado 301']); continue; }
      const loc = new URL(r1.headers.get('location') || '', base + p);
      const r2 = await hit(loc.href);
      if (r2.status === 200) rows.ok.push([p, 301, loc.pathname]);
      else rows.bad.push([p, `301→${r2.status}`, loc.pathname + (r2.status >= 300 && r2.status < 400 ? ' (cadena)' : '')]);
    } catch (e) { rows.bad.push([p, 'ERR', e.message]); }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

console.log(`OK: ${rows.ok.length} · 410: ${rows.gone.length} · PROBLEMAS: ${rows.bad.length} (de ${paths.length})`);
rows.bad.sort().forEach(([p, s, d]) => console.log(`  ✗ ${s}\t${p}\t${d}`));
process.exit(rows.bad.length ? 1 : 0);
