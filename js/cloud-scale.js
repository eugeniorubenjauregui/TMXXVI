/* Aguanta el pico — elige el escenario, empuja la demanda con el cursor y
   apaga el autoescalado para ver qué pasa sin él.
   Reacciona al cursor; corre sola si nadie interactúa. */

const NS = 'http://www.w3.org/2000/svg';
const W = 560, H = 470;
const X0 = 44, X1 = 516;
const CH_TOP = 88, CH_BOT = 208;
const SAMPLES = 96;
const MIN_I = 2, MAX_I = 11;

const SCEN = [
  { l: 'DÍA NORMAL', f: t => 0.20 + Math.sin(t * 0.9) * 0.05 },
  { l: 'LANZAMIENTO', f: t => { const c = t % 11; return c < 2 ? 0.18 : c < 3.2 ? 0.18 + (c - 2) / 1.2 * 0.68 : c < 6 ? 0.86 - (c - 3.2) * 0.06 : c < 7.4 ? 0.69 - (c - 6) / 1.4 * 0.45 : 0.24; } },
  { l: 'BLACK FRIDAY', f: t => { const c = t % 13; return c < 1.6 ? 0.22 : c < 3.4 ? 0.22 + (c - 1.6) / 1.8 * 0.72 : c < 9.5 ? 0.92 + Math.sin(c * 2.1) * 0.05 : c < 11 ? 0.92 - (c - 9.5) / 1.5 * 0.66 : 0.26; } }
];

const el = (tag, a) => {
  const n = document.createElementNS(NS, tag);
  for (const k in a) n.setAttribute(k, a[k]);
  return n;
};
const mono = { 'font-family': 'IBM Plex Mono, monospace', 'letter-spacing': '0.1em' };

export function initCloudScale(svg, opts = {}) {
  if (!svg) return () => {};
  const accent = opts.accent || '#80E593';
  const accent2 = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
  const WARN = '#E5A44D';
  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const g = el('g', {});
  svg.appendChild(g);

  const txt = (x, y, s, o) => {
    const t = el('text', Object.assign({ x, y, 'font-size': 10.5, fill: 'rgba(255,255,255,.46)' }, mono, o || {}));
    t.textContent = s; g.appendChild(t); return t;
  };
  const rule = y => g.appendChild(el('line', { x1: X0, y1: y, x2: X1, y2: y, stroke: 'rgba(255,255,255,.1)', 'stroke-width': 1 }));

  // escenarios
  const sw = (X1 - X0) / SCEN.length;
  const scens = SCEN.map((s, i) => {
    const cx = X0 + sw * i + sw / 2;
    const t = txt(cx, 26, s.l, { 'text-anchor': 'middle', 'font-size': 11 });
    const u = el('line', { x1: cx - 26, y1: 38, x2: cx + 26, y2: 38, stroke: 'rgba(255,255,255,.16)', 'stroke-width': 1 });
    g.appendChild(u);
    return { s, cx, t, u, act: 0 };
  });
  rule(56);

  // demanda
  txt(X0, 78, 'DEMANDA');
  const demVal = txt(X1, 78, '—', { 'text-anchor': 'end', fill: 'rgba(255,255,255,.72)', 'font-size': 11.5 });
  const area = el('path', { fill: 'rgba(128,229,147,.10)', stroke: 'none' });
  const line = el('path', { fill: 'none', stroke: accent, 'stroke-width': 1.6, 'stroke-linejoin': 'round' });
  g.appendChild(area); g.appendChild(line);
  rule(CH_BOT);

  // instancias
  txt(X0, 244, 'INSTANCIAS');
  const insVal = txt(X1, 244, '02', { 'text-anchor': 'end', fill: 'rgba(255,255,255,.72)', 'font-size': 11.5 });
  const blocks = [];
  for (let i = 0; i < MAX_I; i++) {
    const b = el('rect', { x: X0 + i * 32, y: 258, width: 22, height: 34, fill: 'rgba(255,255,255,.10)', opacity: 0 });
    g.appendChild(b); blocks.push({ el: b, on: 0 });
  }

  // cola
  txt(X0, 328, 'COLA');
  g.appendChild(el('rect', { x: X0 + 58, y: 320, width: X1 - X0 - 58, height: 3, fill: 'rgba(255,255,255,.08)' }));
  const qFill = el('rect', { x: X0 + 58, y: 320, width: 0, height: 3, fill: accent2 });
  g.appendChild(qFill);
  rule(352);

  // latencia
  txt(X0, 386, 'LATENCIA');
  const latVal = el('text', {
    x: X1, y: 394, 'text-anchor': 'end', 'font-size': 28, fill: accent,
    'font-family': 'IBM Plex Mono, monospace', 'letter-spacing': '-0.01em'
  });
  latVal.textContent = '104';
  g.appendChild(latVal);
  const latUnit = txt(X1, 412, 'MS · ESTABLE', { 'text-anchor': 'end', 'font-size': 9, fill: 'rgba(255,255,255,.42)' });

  // interruptor de autoescalado
  txt(X0, 448, 'AUTOESCALADO');
  const pills = ['ON', 'OFF'].map((lab, i) => {
    const x = X1 - 96 + i * 52;
    const box = el('rect', { x, y: 434, width: 44, height: 20, fill: 'none', stroke: 'rgba(255,255,255,.2)', 'stroke-width': 1 });
    const t = txt(x + 22, 448, lab, { 'text-anchor': 'middle', 'font-size': 10 });
    g.appendChild(box);
    return { box, t, x, on: i === 0 ? 1 : 0 };
  });

  const hist = new Array(SAMPLES).fill(0.2);
  const state = {
    d: 0.2, target: 0.2, cap: MIN_I, queue: 0, lat: 104,
    scen: 2, manual: false, lastMove: -1e9, tick: 0, t0: performance.now(), autoscale: true
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
    if (p.x < -30 || p.x > W + 30 || p.y < -40 || p.y > H + 30) return;
    state.lastMove = performance.now();

    // escenarios
    if (p.y < 48) {
      scens.forEach((S, i) => { if (Math.abs(p.x - S.cx) < sw / 2) { state.scen = i; state.manual = false; state.t0 = performance.now(); } });
    }
    // interruptor
    else if (p.y > 424) {
      pills.forEach((P, i) => { if (p.x > P.x - 10 && p.x < P.x + 54) state.autoscale = i === 0; });
    }
    // curva: control directo con la altura del cursor
    else if (p.y >= 56 && p.y <= CH_BOT + 14) {
      state.manual = true;
      const k = 1 - Math.max(0, Math.min(1, (p.y - CH_TOP) / (CH_BOT - CH_TOP)));
      state.target = 0.10 + k * 0.88;
    }
    if (starved) { state.d = state.target; draw(0.05); }
  };

  const pathOf = (arr, top, bot, close) => {
    const step = (X1 - X0) / (SAMPLES - 1);
    let d = '';
    for (let i = 0; i < arr.length; i++) {
      const x = X0 + i * step, y = bot - arr[i] * (bot - top);
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    if (close) d += 'L' + X1 + ' ' + bot + 'L' + X0 + ' ' + bot + 'Z';
    return d;
  };

  function draw(dt) {
    const now = performance.now();
    if (!still) {
      if (state.manual && now - state.lastMove > 2000) state.manual = false;
      if (!state.manual) state.target = SCEN[state.scen].f((now - state.t0) / 1000);
    }
    state.d += (state.target - state.d) * Math.min(1, dt * 2.4);

    state.tick += dt;
    if (state.tick > 0.055) {
      state.tick = 0;
      hist.push(state.d + (Math.random() - 0.5) * 0.02);
      hist.shift();
    }

    scens.forEach((S, i) => {
      const on = i === state.scen && !state.manual;
      S.act += ((on ? 1 : 0) - S.act) * Math.min(1, dt * 3);
      S.t.setAttribute('fill', S.act > 0.5 ? '#fff' : 'rgba(255,255,255,.46)');
      S.u.setAttribute('stroke', S.act > 0.5 ? accent : 'rgba(255,255,255,.16)');
      S.u.setAttribute('stroke-width', 1 + S.act);
    });

    line.setAttribute('d', pathOf(hist, CH_TOP, CH_BOT, false));
    area.setAttribute('d', pathOf(hist, CH_TOP, CH_BOT, true));
    demVal.textContent = Math.round(state.d * 100) + '%' + (state.manual ? ' · MANUAL' : '');

    const need = MIN_I + state.d * (MAX_I - MIN_I);
    const capTarget = state.autoscale ? need : MIN_I;
    state.cap += (capTarget - state.cap) * Math.min(1, dt * (state.autoscale ? 1.15 : 1.8));
    const gap = Math.max(0, need - state.cap);

    state.queue += ((state.autoscale ? gap * 0.34 : gap * 0.5) - state.queue) * Math.min(1, dt * 2);
    const qn = Math.max(0, Math.min(1, state.queue));
    qFill.setAttribute('width', (qn * (X1 - X0 - 58)).toFixed(1));
    qFill.setAttribute('fill', !state.autoscale && qn > 0.4 ? WARN : (qn > 0.35 ? accent2 : 'rgba(82,199,207,.55)'));

    const live = Math.round(state.cap);
    blocks.forEach((b, i) => {
      const on = i < live;
      b.on += ((on ? 1 : 0) - b.on) * Math.min(1, dt * 3.4);
      b.el.setAttribute('opacity', b.on.toFixed(3));
      b.el.setAttribute('y', (258 + (1 - b.on) * 10).toFixed(1));
      b.el.setAttribute('height', (34 * (0.5 + b.on * 0.5)).toFixed(1));
      b.el.setAttribute('fill', b.on > 0.6 ? 'rgba(128,229,147,.26)' : 'rgba(255,255,255,.10)');
    });
    insVal.textContent = String(live).padStart(2, '0') + (state.autoscale ? '' : ' · FIJO');

    const latT = state.autoscale ? 100 + gap * 5.5 + Math.sin(now / 620) * 2.2 : 100 + gap * 46;
    state.lat += (latT - state.lat) * Math.min(1, dt * 2.2);
    const bad = state.lat > 190;
    latVal.textContent = Math.round(state.lat);
    latVal.setAttribute('fill', bad ? WARN : (state.lat > 128 ? '#E5C980' : accent));
    latUnit.textContent = bad ? 'MS · DEGRADADA' : (state.lat > 128 ? 'MS · AJUSTANDO' : 'MS · ESTABLE');

    pills.forEach((P, i) => {
      const on = (i === 0) === state.autoscale;
      P.box.setAttribute('stroke', on ? (state.autoscale ? accent : WARN) : 'rgba(255,255,255,.2)');
      P.box.setAttribute('fill', on ? (state.autoscale ? 'rgba(128,229,147,.14)' : 'rgba(229,164,77,.14)') : 'none');
      P.t.setAttribute('fill', on ? '#fff' : 'rgba(255,255,255,.4)');
    });
  }

  const compose = () => {
    state.d = 0.9; state.target = 0.9; state.cap = MIN_I + 0.9 * (MAX_I - MIN_I); state.scen = 2;
    for (let i = 0; i < SAMPLES; i++) {
      hist[i] = i < SAMPLES * 0.42 ? 0.22 : Math.min(0.9, 0.22 + (i - SAMPLES * 0.42) / (SAMPLES * 0.18) * 0.68);
    }
    blocks.forEach((b, i) => { b.on = i < Math.round(state.cap) ? 1 : 0; });
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
