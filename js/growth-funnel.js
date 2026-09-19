/* El funnel como anillos — cada etapa es un arco concéntrico y todo converge
   en el índice del centro. Las palancas de crecimiento deforman los anillos.
   Reacciona al cursor; cicla sola si nadie interactúa. */

const NS = 'http://www.w3.org/2000/svg';
const W = 560, H = 470;
const CX = 288, CY = 262;

const STAGES = [
  { l: 'VISITAS', v: 100, r: 150 },
  { l: 'PRODUCTO', v: 62, r: 122 },
  { l: 'CARRITO', v: 34, r: 94 },
  { l: 'CHECKOUT', v: 21, r: 66 },
  { l: 'COMPRA', v: 14, r: 38 }
];

const LEVERS = [
  { l: 'SEO', e: [1.18, 1.10, 1.04, 1.02, 1.02] },
  { l: 'GEO', e: [1.14, 1.09, 1.03, 1.02, 1.02] },
  { l: 'AEO', e: [1.12, 1.10, 1.05, 1.02, 1.02] },
  { l: 'CRO', e: [1.00, 1.12, 1.22, 1.28, 1.34] },
  { l: 'PAID', e: [1.32, 1.12, 1.04, 1.02, 1.00] }
];

const el = (tag, a) => {
  const n = document.createElementNS(NS, tag);
  for (const k in a) n.setAttribute(k, a[k]);
  return n;
};
const mono = { 'font-family': 'IBM Plex Mono, monospace', 'letter-spacing': '0.1em' };

export function initGrowthFunnel(svg, opts = {}) {
  if (!svg) return () => {};
  const accent = opts.accent || '#80E593';
  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const gL = el('g', {}), gR = el('g', {}), gC = el('g', {});
  svg.appendChild(gL); svg.appendChild(gR); svg.appendChild(gC);

  // palancas
  const lw = W / LEVERS.length;
  const levers = LEVERS.map((lv, i) => {
    const cx = lw * i + lw / 2;
    const t = el('text', Object.assign({ x: cx, y: 30, 'text-anchor': 'middle', 'font-size': 11.5, fill: 'rgba(255,255,255,.46)' }, mono));
    t.textContent = lv.l;
    const u = el('line', { x1: cx - 20, y1: 42, x2: cx + 20, y2: 42, stroke: 'rgba(255,255,255,.16)', 'stroke-width': 1 });
    gL.appendChild(t); gL.appendChild(u);
    return { lv, cx, t, u, act: 0 };
  });
  const hint = el('text', Object.assign({ x: W / 2, y: 68, 'text-anchor': 'middle', 'font-size': 10, fill: 'rgba(255,255,255,.3)' }, mono));
  hint.textContent = 'VARIABLES DE CRECIMIENTO';
  gL.appendChild(hint);

  const rings = STAGES.map(s => {
    const C = 2 * Math.PI * s.r;
    const track = el('circle', {
      cx: CX, cy: CY, r: s.r, fill: 'none',
      stroke: 'rgba(255,255,255,.08)', 'stroke-width': 1
    });
    const arc = el('circle', {
      cx: CX, cy: CY, r: s.r, fill: 'none',
      stroke: 'rgba(255,255,255,.34)', 'stroke-width': 3, 'stroke-linecap': 'round',
      'stroke-dasharray': C + ' ' + C, 'stroke-dashoffset': C,
      transform: 'rotate(-90 ' + CX + ' ' + CY + ')'
    });
    const tip = el('circle', { r: 3.4, fill: '#fff', opacity: 0 });
    const label = el('text', Object.assign({ 'font-size': 10.5, fill: 'rgba(255,255,255,.5)' }, mono));
    label.textContent = s.l;
    const val = el('text', Object.assign({ 'font-size': 10.5, fill: 'rgba(255,255,255,.4)' }, mono));
    gR.appendChild(track); gR.appendChild(arc); gR.appendChild(tip);
    gR.appendChild(label); gR.appendChild(val);
    return { s, C, track, arc, tip, label, val, cur: s.v, lift: 0 };
  });

  const idxVal = el('text', Object.assign({
    x: CX, y: CY + 6, 'text-anchor': 'middle', 'font-size': 26,
    fill: accent, 'font-family': 'IBM Plex Mono, monospace', 'letter-spacing': '-0.01em'
  }));
  idxVal.textContent = '100';
  const idxLab = el('text', Object.assign({ x: CX, y: CY + 24, 'text-anchor': 'middle', 'font-size': 8.5, fill: 'rgba(255,255,255,.42)' }, mono));
  idxLab.textContent = 'ÍNDICE';
  gC.appendChild(idxVal); gC.appendChild(idxLab);

  const state = {
    active: -1, lastMove: -1e9, tPhase: performance.now(),
    auto: 0, changed: performance.now() - 2000, idx: 100
  };
  let starved = false;

  const toLocal = e => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return null;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onMove = e => {
    const p = toLocal(e);
    if (!p) return;
    if (p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) return;
    state.lastMove = performance.now();
    let hit = -1;
    levers.forEach((L, i) => { if (Math.abs(p.x - L.cx) < lw / 2 && p.y < 110) hit = i; });
    if (hit === -1 && p.y >= 110) hit = state.active;
    if (hit !== state.active) { state.active = hit; state.changed = performance.now(); }
    if (starved) draw(0.05);
  };

  function draw(dt) {
    const now = performance.now();
    if (!still) {
      if (now - state.lastMove > 2000) {
        if (now - state.tPhase > 3400) {
          state.tPhase = now;
          state.auto = (state.auto + 1) % (LEVERS.length + 1);
          state.active = state.auto === LEVERS.length ? -1 : state.auto;
          state.changed = now;
        }
      } else state.tPhase = now;
    }

    levers.forEach((L, i) => {
      const on = i === state.active;
      L.act += ((on ? 1 : 0) - L.act) * Math.min(1, dt * 2.8);
      L.t.setAttribute('fill', L.act > 0.5 ? '#fff' : 'rgba(255,255,255,.46)');
      L.u.setAttribute('stroke', L.act > 0.5 ? accent : 'rgba(255,255,255,.16)');
      L.u.setAttribute('stroke-width', 1 + L.act);
      L.u.setAttribute('x1', L.cx - 20 - L.act * 6);
      L.u.setAttribute('x2', L.cx + 20 + L.act * 6);
    });

    const eff = state.active > -1 ? LEVERS[state.active].e : null;
    const since = (now - state.changed) / 1000;

    rings.forEach((R, i) => {
      const target = R.s.v * (eff ? eff[i] : 1);
      const gate = Math.max(0, Math.min(1, (since - i * 0.14) * 2.4));
      R.cur += (target - R.cur) * Math.min(1, dt * 2.1 * gate);

      const want = eff ? Math.min(1, (eff[i] - 1) * 6) : 0;
      R.lift += (want - R.lift) * Math.min(1, dt * 2.4);

      const frac = Math.max(0.012, Math.min(0.97, R.cur / 100));
      R.arc.setAttribute('stroke-dashoffset', (R.C * (1 - frac)).toFixed(1));
      R.arc.setAttribute('stroke', R.lift > 0.3 ? accent : 'rgba(255,255,255,.34)');
      R.arc.setAttribute('stroke-width', (2.6 + R.lift * 1.6).toFixed(2));

      const ang = (-90 + frac * 360) * Math.PI / 180;
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const tx = CX + R.s.r * cos, ty = CY + R.s.r * sin;
      R.tip.setAttribute('cx', tx.toFixed(1));
      R.tip.setAttribute('cy', ty.toFixed(1));
      R.tip.setAttribute('opacity', 0.55 + R.lift * 0.45);

      const out = 15;
      const lx = CX + (R.s.r + out) * cos, ly = CY + (R.s.r + out) * sin;
      const anchor = cos > 0.12 ? 'start' : (cos < -0.12 ? 'end' : 'middle');
      R.label.setAttribute('x', lx.toFixed(1));
      R.label.setAttribute('y', (ly + 3.6).toFixed(1));
      R.label.setAttribute('text-anchor', anchor);
      R.label.setAttribute('fill', R.lift > 0.3 ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.5)');
      R.val.setAttribute('x', lx.toFixed(1));
      R.val.setAttribute('y', (ly + 16).toFixed(1));
      R.val.setAttribute('text-anchor', anchor);
      R.val.setAttribute('fill', R.lift > 0.3 ? accent : 'rgba(255,255,255,.4)');
      R.val.textContent = Math.round(R.cur);
    });

    const idxT = (rings[4].cur / STAGES[4].v) * 100;
    state.idx += (idxT - state.idx) * Math.min(1, dt * 2.6);
    idxVal.textContent = Math.round(state.idx);
    idxVal.setAttribute('fill', state.idx > 101.5 ? accent : 'rgba(255,255,255,.72)');
  }

  const compose = () => {
    state.active = 3; state.changed = performance.now() - 4000;
    rings.forEach((R, i) => { R.cur = R.s.v * LEVERS[3].e[i]; R.lift = 1; });
    levers[3].act = 1;
    state.idx = (rings[4].cur / STAGES[4].v) * 100;
    draw(0);
  };

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
