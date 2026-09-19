/* Un pedido, muchos caminos — la misma red de operación, tres rutas según el canal
   por el que entra el pedido. Reacciona al cursor; si nadie interactúa, cicla sola.
   Todo por requestAnimationFrame, con respaldo si el contexto no anima. */

const NS = 'http://www.w3.org/2000/svg';
const W = 560, H = 470;

const NODES = [
  { x: 58, y: 72, l: 'ECOMMERCE', entry: 1 },
  { x: 58, y: 205, l: 'MARKETPLACE', entry: 1 },
  { x: 58, y: 338, l: 'TIENDA', entry: 1 },
  { x: 196, y: 205, l: 'PEDIDO', hub: 1 },
  { x: 332, y: 88, l: 'ERP' },
  { x: 332, y: 205, l: 'INVENTARIO' },
  { x: 332, y: 322, l: 'PAGOS' },
  { x: 452, y: 112, l: 'FULFILLMENT' },
  { x: 452, y: 300, l: 'DESDE TIENDA' },
  { x: 522, y: 205, l: 'ENTREGA' }
];

const ROUTES = [
  { from: 0, path: [0, 3, 5, 6, 7, 9] },
  { from: 1, path: [1, 3, 4, 5, 7, 9] },
  { from: 2, path: [2, 3, 6, 5, 8, 9] }
];

const el = (tag, a) => {
  const n = document.createElementNS(NS, tag);
  for (const k in a) n.setAttribute(k, a[k]);
  return n;
};

export function initCommerceFlow(svg, opts = {}) {
  if (!svg) return () => {};
  const accent = opts.accent || '#80E593';
  const accent2 = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const gBase = el('g', { fill: 'none', stroke: 'rgba(255,255,255,.13)', 'stroke-width': 1 });
  const gLive = el('g', { fill: 'none' });
  const gNodes = el('g', {});
  svg.appendChild(gBase); svg.appendChild(gLive); svg.appendChild(gNodes);

  // red completa (unión de las tres rutas)
  const seen = {};
  ROUTES.forEach(r => {
    for (let i = 1; i < r.path.length; i++) {
      const a = r.path[i - 1], b = r.path[i];
      const key = Math.min(a, b) + '-' + Math.max(a, b);
      if (seen[key]) continue;
      seen[key] = 1;
      gBase.appendChild(el('line', {
        x1: NODES[a].x, y1: NODES[a].y, x2: NODES[b].x, y2: NODES[b].y
      }));
    }
  });

  const live = el('polyline', {
    stroke: accent, 'stroke-width': 1.8, 'stroke-linejoin': 'round',
    'stroke-linecap': 'round', opacity: 0
  });
  gLive.appendChild(live);
  const packet = el('circle', { r: 4.5, fill: '#fff', opacity: 0 });
  gLive.appendChild(packet);

  const nodes = NODES.map(n => {
    const g = el('g', {});
    const halo = el('circle', { cx: n.x, cy: n.y, r: n.entry ? 20 : 17, fill: accent, opacity: 0 });
    const ring = n.entry ? el('circle', {
      cx: n.x, cy: n.y, r: 12, fill: 'none',
      stroke: 'rgba(255,255,255,.22)', 'stroke-width': 1
    }) : null;
    const dot = el('circle', {
      cx: n.x, cy: n.y, r: n.hub ? 6 : 4.5, fill: '#141414',
      stroke: 'rgba(255,255,255,.42)', 'stroke-width': 1.4
    });
    const below = n.y > 300 || n.l === 'PAGOS' || n.l === 'DESDE TIENDA';
    const label = el('text', {
      x: n.x, y: n.y + (below ? 30 : -19),
      'text-anchor': n.x < 90 ? 'start' : (n.x > 480 ? 'end' : 'middle'),
      'font-family': 'IBM Plex Mono, monospace', 'font-size': 10.5,
      'letter-spacing': '0.07em', fill: 'rgba(255,255,255,.42)'
    });
    if (n.x < 90) label.setAttribute('x', n.x - 12);
    if (n.x > 480) label.setAttribute('x', n.x + 10);
    if (n.x < 90 || n.x > 480) label.setAttribute('y', n.y + 4);
    if (n.x < 90) label.setAttribute('text-anchor', 'end');
    if (n.x > 480) label.setAttribute('text-anchor', 'start');
    label.textContent = n.l;
    g.appendChild(halo); if (ring) g.appendChild(ring); g.appendChild(dot); g.appendChild(label);
    gNodes.appendChild(g);
    return { n, halo, ring, dot, label, act: 0 };
  });

  const state = { route: 0, p: 0, hover: -1, lastMove: -1e9, hold: 0 };

  const pts = r => ROUTES[r].path.map(i => [NODES[i].x, NODES[i].y]);
  const segsOf = p => {
    const s = []; let total = 0;
    for (let i = 1; i < p.length; i++) {
      const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      s.push(d); total += d;
    }
    return { s, total };
  };

  const toLocal = e => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return null;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  let starved = false;

  const onMove = e => {
    const p = toLocal(e);
    if (!p) return;
    let hit = -1;
    ROUTES.forEach((r, ri) => {
      const n = NODES[r.from];
      if (Math.hypot(n.x - p.x, n.y - p.y) < 62) hit = ri;
    });
    if (hit === -1) {
      // también acepta el hover en la mitad izquierda para no exigir puntería
      if (p.x > 0 && p.x < 150 && p.y > 0 && p.y < H) {
        hit = p.y < 140 ? 0 : (p.y < 275 ? 1 : 2);
      }
    }
    if (hit === -1) return;
    state.lastMove = performance.now();
    if (hit !== state.route) { state.route = hit; state.p = 0; }
    state.hover = hit;
    if (starved) { state.p = 1; draw(0.05); }
  };

  function draw(dt) {
    const now = performance.now();
    const idle = now - state.lastMove > 2200;

    state.p += dt * 0.42;
    if (state.p >= 1.32) {
      state.p = 0;
      if (idle) state.route = (state.route + 1) % ROUTES.length;
    }

    const P = pts(state.route);
    const { s, total } = segsOf(P);
    const prog = Math.min(1, state.p / 0.86);
    const shown = prog * total;

    // trazo que avanza
    const drawn = [P[0].slice()];
    let acc = 0;
    for (let i = 0; i < s.length; i++) {
      if (acc + s[i] <= shown) { drawn.push(P[i + 1].slice()); acc += s[i]; continue; }
      const f = s[i] ? (shown - acc) / s[i] : 0;
      if (f > 0) drawn.push([
        P[i][0] + (P[i + 1][0] - P[i][0]) * f,
        P[i][1] + (P[i + 1][1] - P[i][1]) * f
      ]);
      break;
    }
    live.setAttribute('points', drawn.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
    live.setAttribute('opacity', state.p > 1.05 ? Math.max(0, (1.32 - state.p) / 0.27) : 1);

    const tip = drawn[drawn.length - 1];
    packet.setAttribute('cx', tip[0]); packet.setAttribute('cy', tip[1]);
    packet.setAttribute('opacity', prog < 1 ? 1 : Math.max(0, (1.32 - state.p) / 0.46));

    // nodos: se encienden cuando el pedido los alcanza
    const path = ROUTES[state.route].path;
    let cum = 0;
    const reach = path.map((_, i) => { if (i) cum += s[i - 1]; return cum; });
    nodes.forEach((nd, i) => {
      const k = path.indexOf(i);
      const on = k > -1 && shown >= reach[k] - 1;
      nd.act += ((on ? 1 : 0) - nd.act) * Math.min(1, dt * 6);
      const lit = nd.act > 0.5;
      nd.halo.setAttribute('opacity', nd.act * 0.14);
      nd.dot.setAttribute('fill', lit ? accent : '#141414');
      nd.dot.setAttribute('stroke', lit ? accent : 'rgba(255,255,255,.42)');
      nd.dot.setAttribute('r', (nd.n.hub ? 6 : 4.5) + nd.act * 1.4);
      nd.label.setAttribute('fill', lit ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.42)');
      if (nd.ring) nd.ring.setAttribute('stroke', lit ? accent2 : 'rgba(255,255,255,.22)');
    });
  }

  const compose = () => { state.p = 0.86; draw(0); };

  if (still) { compose(); return () => {}; }

  let raf = null, prev = performance.now(), ticks = 0;
  const loop = now => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now; ticks++;
    draw(dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  window.addEventListener('mousemove', onMove, { passive: true });
  const guard = setTimeout(() => { if (ticks < 3) { starved = true; compose(); } }, 1500);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(guard);
    window.removeEventListener('mousemove', onMove);
  };
}
