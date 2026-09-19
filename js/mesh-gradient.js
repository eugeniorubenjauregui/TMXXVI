/* mesh-gradient.js — malla de color de fondo, en CSS.
   Capas de radial-gradient desenfocadas que derivan solas y se inclinan hacia el
   cursor. Sin WebGL a propósito: los heros ya cargan un contexto 3D cada uno y
   sumar otro cuesta memoria de GPU sin ganar nada — un mesh gradient es color
   difuso, no geometría.

   Un tono por página: la malla se construye alrededor de ese tono más el acento
   secundario, así cada solución tiene identidad sin salirse de la paleta.
   Intensidad media: las manchas se ven, pero el gráfico de arriba sigue mandando. */

const TONES = {
  inicio:   { a: '#80E593', b: '#52C7CF' },   // verde de marca
  strategy: { a: '#52C7CF', b: '#80E593' },   // cian
  ai:       { a: '#6FDCB0', b: '#80E593' },   // verde agua
  commerce: { a: '#9BE07A', b: '#52C7CF' },   // verde lima
  growth:   { a: '#58D9A8', b: '#9BE07A' },   // esmeralda
  cloud:    { a: '#4FB6D9', b: '#52C7CF' }    // azul cian
};

const hexRgb = h => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => {
  const [r, g, b] = hexRgb(hex);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
};
/* tono intermedio entre los dos del par: da el escalón que hace leer la malla */
const mixHex = (h1, h2) => {
  const a = hexRgb(h1), b = hexRgb(h2);
  const m = a.map((v, i) => Math.round((v + b[i]) / 2));
  return '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
};

/* cada mancha: posición base, tamaño, color y cuánto la arrastra el cursor */
const BLOBS = [
  { x: 10, y: 26, s: 48, c: 'a', o: 0.56, pull: 0.6 },
  { x: 42, y: 14, s: 38, c: 'c', o: 0.4, pull: -0.3 },
  { x: 76, y: 30, s: 44, c: 'b', o: 0.5, pull: -0.45 },
  { x: 98, y: 58, s: 34, c: 'c', o: 0.34, pull: 0.5 },
  { x: 62, y: 84, s: 52, c: 'a', o: 0.36, pull: 0.35 },
  { x: 24, y: 92, s: 42, c: 'b', o: 0.3, pull: -0.55 }
];

export function initMeshGradient(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const tone = TONES[opts.tone] || TONES.inicio;
  const scale = opts.intensity != null ? opts.intensity : 1;

  const section = host.closest('section') || host.parentElement;
  if (section && getComputedStyle(section).position === 'static') section.style.position = 'relative';
  if (section) section.style.overflow = section.style.overflow || 'hidden';

  const full = opts.spread === 'full';
  host.style.cssText = 'position:absolute;left:-7%;right:-7%;top:-14%;' +
    (full ? 'bottom:-14%;' : 'height:min(132%,1060px);') +
    'z-index:0;pointer-events:none;filter:blur(52px) saturate(124%);will-change:transform';

  const mid = mixHex(tone.a, tone.b);
  const nodes = BLOBS.map(b => {
    const d = document.createElement('i');
    const col = b.c === 'a' ? tone.a : (b.c === 'b' ? tone.b : mid);
    d.style.cssText = 'position:absolute;display:block;border-radius:50%;' +
      'left:' + b.x + '%;top:' + b.y + '%;width:' + b.s + '%;' +
      'aspect-ratio:1;transform:translate(-50%,-50%);' +
      'background:radial-gradient(circle at 50% 50%,' + rgba(col, b.o * scale) + ' 0%,' +
      rgba(col, b.o * scale * 0.45) + ' 42%,rgba(0,0,0,0) 72%)';
    host.appendChild(d);
    return { b, d, x: 0, y: 0 };
  });

  if (still) return () => { host.innerHTML = ''; };

  let raf = 0, tx = 0, ty = 0, killed = false;
  const onMove = e => {
    const r = (section || host).getBoundingClientRect();
    tx = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
    ty = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
  };
  window.addEventListener('mousemove', onMove, { passive: true });

  const t0 = performance.now();
  const loop = now => {
    raf = requestAnimationFrame(loop);
    const r = (section || host).getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.bottom < -100 || r.top > vh + 100) return;      // fuera de pantalla: no anima
    const t = (now - t0) / 1000;
    nodes.forEach((n, i) => {
      // deriva lenta propia + inclinación hacia el cursor
      const dx = Math.sin(t * 0.11 + i * 1.7) * 3.2 + tx * 100 * n.b.pull * 0.12;
      const dy = Math.cos(t * 0.09 + i * 2.3) * 2.6 + ty * 100 * n.b.pull * 0.1;
      n.x += (dx - n.x) * 0.045;
      n.y += (dy - n.y) * 0.045;
      n.d.style.transform = 'translate(-50%,-50%) translate(' + n.x.toFixed(2) + '%,' + n.y.toFixed(2) + '%)';
    });
  };
  raf = requestAnimationFrame(loop);

  return () => {
    killed = true;
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove);
    host.innerHTML = '';
  };
}

/* resplandor de borde: el color vive en el filo del bloque, no detrás del texto,
   así el formulario se mantiene legible sobre su fondo plano */
export function initEdgeGlow(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const tone = TONES[opts.tone] || TONES.inicio;

  const block = host.parentElement;
  if (block && getComputedStyle(block).position === 'static') block.style.position = 'relative';

  const ring = (a) => 'conic-gradient(from ' + a.toFixed(1) + 'deg,' +
      rgba(tone.a, 0.95) + ',' + rgba(tone.b, 0.6) + ',rgba(255,255,255,.12),' +
      rgba(tone.b, 0.65) + ',' + rgba(tone.a, 0.95) + ')';
  host.style.cssText = 'position:absolute;inset:-2.5px;z-index:0;pointer-events:none;' +
    'background:' + ring(0) + ';opacity:.85;transition:opacity .4s';

  // halo difuso por fuera del filo: el resplandor de la referencia
  const halo = document.createElement('i');
  halo.style.cssText = 'position:absolute;inset:-30px;z-index:-1;display:block;' +
    'background:radial-gradient(60% 80% at 12% 8%,' + rgba(tone.a, 0.3) + ' 0%,rgba(0,0,0,0) 62%),' +
    'radial-gradient(56% 74% at 92% 96%,' + rgba(tone.b, 0.24) + ' 0%,rgba(0,0,0,0) 60%);' +
    'filter:blur(30px)';
  host.appendChild(halo);

  if (still) return () => { host.innerHTML = ''; host.removeAttribute('style'); };

  let raf = 0, ang = 0, tgt = 0;
  const onMove = e => {
    const r = (block || host).getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    tgt = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    const inside = e.clientX > r.left - 120 && e.clientX < r.right + 120 &&
                   e.clientY > r.top - 120 && e.clientY < r.bottom + 120;
    host.style.opacity = inside ? '1' : '0.85';
  };
  window.addEventListener('mousemove', onMove, { passive: true });

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const r = (block || host).getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (r.bottom < -100 || r.top > vh + 100) return;
    let d = tgt - ang;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    ang += d * 0.05;
    host.style.background = ring(ang);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove);
    host.innerHTML = '';
    host.removeAttribute('style');
  };
}
