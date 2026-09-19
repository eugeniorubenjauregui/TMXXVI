/* Del ruido a la prioridad — un campo disperso de áreas de la operación que,
   al diagnosticarse, se ordena solo en una matriz de impacto y viabilidad.
   El cursor atrae los puntos cercanos. Todo por rAF, con respaldo si el contexto no anima. */

const NS = 'http://www.w3.org/2000/svg';
const W = 560, H = 470;
const N = 44;

const PLOT = { x0: 132, x1: 508, y0: 384, y1: 74 };
const PULL = 74;

const el = (tag, a) => {
  const n = document.createElementNS(NS, tag);
  for (const k in a) n.setAttribute(k, a[k]);
  return n;
};

// generador estable: la composición no cambia entre recargas
const rnd = (() => { let s = 20260910; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();

export function initPriorityField(svg, opts = {}) {
  if (!svg) return () => {};
  const accent = opts.accent || '#80E593';
  const accent2 = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const gAxes = el('g', {});
  const gDots = el('g', {});
  svg.appendChild(gAxes); svg.appendChild(gDots);

  const axV = el('line', { x1: PLOT.x0 - 14, y1: 44, x2: PLOT.x0 - 14, y2: PLOT.y0 + 18, stroke: 'rgba(255,255,255,.2)', 'stroke-width': 1, opacity: 0 });
  const axH = el('line', { x1: PLOT.x0 - 14, y1: PLOT.y0 + 18, x2: PLOT.x1 + 22, y2: PLOT.y0 + 18, stroke: 'rgba(255,255,255,.2)', 'stroke-width': 1, opacity: 0 });
  const quad = el('rect', {
    x: (PLOT.x0 + PLOT.x1) / 2 - 8, y: 46,
    width: PLOT.x1 - (PLOT.x0 + PLOT.x1) / 2 + 34,
    height: (PLOT.y0 + PLOT.y1) / 2 - 40,
    fill: 'none', stroke: accent2, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0
  });
  const mono = { 'font-family': 'IBM Plex Mono, monospace', 'font-size': 10.5, 'letter-spacing': '0.12em' };
  const labH = el('text', Object.assign({ x: PLOT.x1 + 22, y: PLOT.y0 + 38, 'text-anchor': 'end', fill: 'rgba(255,255,255,.5)', opacity: 0 }, mono));
  labH.textContent = 'VIABILIDAD';
  const labV = el('text', Object.assign({ x: PLOT.x0 - 22, y: 52, 'text-anchor': 'end', fill: 'rgba(255,255,255,.5)', opacity: 0 }, mono));
  labV.textContent = 'IMPACTO';
  const labQ = el('text', Object.assign({ x: PLOT.x1 + 56, y: 38, 'text-anchor': 'end', fill: accent, opacity: 0 }, mono));
  labQ.textContent = 'PRIORIDAD';
  [axV, axH, quad, labH, labV, labQ].forEach(n => gAxes.appendChild(n));

  const dots = [];
  for (let i = 0; i < N; i++) {
    const viab = 0.06 + rnd() * 0.92;
    const imp = 0.06 + rnd() * 0.92;
    const d = {
      nx: 46 + rnd() * (W - 92), ny: 52 + rnd() * (H - 130),
      ox: PLOT.x0 + viab * (PLOT.x1 - PLOT.x0),
      oy: PLOT.y0 + imp * (PLOT.y1 - PLOT.y0),
      pri: viab > 0.54 && imp > 0.54,
      ph: rnd() * 6.28, x: 0, y: 0, dx: 0, dy: 0,
      node: el('circle', { r: 4, fill: 'rgba(255,255,255,.34)' })
    };
    d.x = d.nx; d.y = d.ny;
    gDots.appendChild(d.node);
    dots.push(d);
  }

  const state = { ord: 0, phase: 'noise', tPhase: performance.now(), px: -1e4, py: -1e4, hover: false, lastMove: -1e9 };
  let starved = false;

  const toLocal = e => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return null;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onMove = e => {
    const p = toLocal(e);
    if (!p) return;
    state.px = p.x; state.py = p.y;
    const inside = p.x > -40 && p.x < W + 40 && p.y > -30 && p.y < H + 30;
    if (!inside) { state.hover = false; return; }
    state.hover = true;
    state.lastMove = performance.now();
    if (starved) { state.ord = 1; draw(0.05); }
  };

  function draw(dt) {
    const now = performance.now();
    const t = now / 1000;

    if (!still) {
      if (state.hover && now - state.lastMove > 1800) state.hover = false;
      if (state.hover) { state.phase = 'order'; state.tPhase = now; }
      else if (state.phase === 'order' && now - state.tPhase > 2600) { state.phase = 'noise'; state.tPhase = now; }
      else if (state.phase === 'noise' && now - state.tPhase > 2400) { state.phase = 'order'; state.tPhase = now; }
    }

    const want = state.phase === 'order' ? 1 : 0;
    state.ord += (want - state.ord) * Math.min(1, dt * 2.2);

    const o = state.ord;
    const ease = o * o * (3 - 2 * o);

    dots.forEach((d, i) => {
      // el diagnóstico recorre el campo: los de la izquierda se ordenan antes
      const lead = Math.max(0, Math.min(1, (ease * 1.45) - (d.ox - PLOT.x0) / (PLOT.x1 - PLOT.x0) * 0.45));
      const bx = d.nx + Math.sin(t * 0.4 + d.ph) * 6;
      const by = d.ny + Math.cos(t * 0.34 + d.ph * 1.4) * 5;
      let gx = bx + (d.ox - bx) * lead;
      let gy = by + (d.oy - by) * lead;

      // atracción hacia el cursor
      const ddx = state.px - d.x, ddy = state.py - d.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist < PULL) {
        const k = (dist / PULL) * (1 - lead * 0.55);
        gx += ddx * k; gy += ddy * k;
      }

      d.dx += (gx - d.x) * 6.5 * dt;
      d.dy += (gy - d.y) * 6.5 * dt;
      d.dx *= 0.84; d.dy *= 0.84;
      d.x += d.dx; d.y += d.dy;

      d.node.setAttribute('cx', d.x.toFixed(1));
      d.node.setAttribute('cy', d.y.toFixed(1));
      const hot = d.pri ? lead : 0;
      d.node.setAttribute('r', (4 + hot * 1.4).toFixed(2));
      d.node.setAttribute('fill', hot > 0.55 ? accent : 'rgba(255,255,255,.34)');
    });

    axV.setAttribute('opacity', ease); axH.setAttribute('opacity', ease);
    labH.setAttribute('opacity', ease * 0.9); labV.setAttribute('opacity', ease * 0.9);
    quad.setAttribute('opacity', Math.max(0, ease * 1.4 - 0.5));
    labQ.setAttribute('opacity', Math.max(0, ease * 1.6 - 0.7));
  }

  const compose = () => { state.ord = 1; state.phase = 'order'; dots.forEach(d => { d.x = d.ox; d.y = d.oy; }); draw(0); };

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
