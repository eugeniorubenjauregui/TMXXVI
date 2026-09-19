/* agent-geo.js — enjambre de agentes en geometría vectorial.
   Morphing al estilo MorphSVG: cada figura se define con el MISMO número de
   anclas (24) repartidas por el perímetro, de modo que triángulo → cuadrado →
   hexágono → círculo interpolan ancla a ancla sin deriva. GSAP mueve el
   progreso con expo.inOut. La masa se une por cuellos metaball y la membrana
   sale de un feMorphology, así que todo es vectorial. */

const NS = 'http://www.w3.org/2000/svg';
const W = 560, H = 470;
const A = 24;                      // anclas por figura (divisible por 3, 4, 6)
const SHAPES = [3, 4, 6, 0];       // 0 = círculo
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

const ROLES = [
  'demanda e inventario', 'catálogo', 'operaciones',
  'analítica', 'servicio', 'procesos internos'
];

const HOMES = [
  [78, 96], [196, 58], [330, 74], [462, 118],
  [58, 214], [188, 178], [330, 196], [486, 236],
  [96, 330], [232, 300], [368, 320], [472, 372],
  [148, 424], [306, 414]
];

const el = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/* anclas normalizadas (radio 1): polígono de n lados o círculo.
   Las esquinas caen exactamente sobre anclas, así el morph no redondea. */
function anchors(n) {
  const pts = [];
  if (!n) {
    for (let i = 0; i < A; i++) {
      const th = (i / A) * TAU - Math.PI / 2;
      pts.push([Math.cos(th), Math.sin(th)]);
    }
    return pts;
  }
  const per = A / n;                       // anclas por lado
  for (let i = 0; i < A; i++) {
    const side = Math.floor(i / per), f = (i % per) / per;
    const a0 = (side / n) * TAU - Math.PI / 2;
    const a1 = ((side + 1) / n) * TAU - Math.PI / 2;
    const x0 = Math.cos(a0), y0 = Math.sin(a0);
    const x1 = Math.cos(a1), y1 = Math.sin(a1);
    pts.push([x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]);
  }
  return pts;
}

const LIB = {};
SHAPES.forEach(n => { LIB[n] = anchors(n); });

/* path con esquinas redondeadas mínimas: cuadrática en cada ancla, la curva
   pasa por el punto medio de cada tramo → aristas rectas, vértices limpios */
function pathFrom(pts, R, cx, cy, soft) {
  const k = soft == null ? 0.14 : soft;
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const P = pts.map(p => [cx + p[0] * R, cy + p[1] * R]);
  let d = '';
  const m0 = mid(P[A - 1], P[0]);
  d += 'M' + m0[0].toFixed(1) + ' ' + m0[1].toFixed(1);
  for (let i = 0; i < A; i++) {
    const cur = P[i], nxt = P[(i + 1) % A];
    const m = mid(cur, nxt);
    if (k <= 0) d += 'L' + cur[0].toFixed(1) + ' ' + cur[1].toFixed(1) + 'L' + m[0].toFixed(1) + ' ' + m[1].toFixed(1);
    else d += 'Q' + cur[0].toFixed(1) + ' ' + cur[1].toFixed(1) + ',' + m[0].toFixed(1) + ' ' + m[1].toFixed(1);
  }
  return d + 'Z';
}

/* cuello líquido entre dos círculos (metaball) */
function neck(x1, y1, r1, x2, y2, r2, v) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (!d || d > (r1 + r2) * 2.4 || d < Math.abs(r1 - r2)) return '';
  const spread = Math.acos(clamp((r1 - r2) / d, -1, 1));
  let u1 = 0, u2 = 0;
  if (d < r1 + r2) {
    u1 = Math.acos(clamp((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d), -1, 1));
    u2 = Math.acos(clamp((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d), -1, 1));
  }
  const a0 = Math.atan2(dy, dx);
  const p = (x, y, r, a) => [x + r * Math.cos(a), y + r * Math.sin(a)];
  const P1 = p(x1, y1, r1, a0 + u1 + (spread - u1) * v);
  const P2 = p(x1, y1, r1, a0 - u1 - (spread - u1) * v);
  const P3 = p(x2, y2, r2, a0 + Math.PI - u2 - (Math.PI - u2 - spread) * v);
  const P4 = p(x2, y2, r2, a0 - Math.PI + u2 + (Math.PI - u2 - spread) * v);
  const total = r1 + r2;
  const fade = Math.min(v * 2.6, Math.hypot(P1[0] - P3[0], P1[1] - P3[1]) / total) * Math.min(1, (d * 2) / total);
  const h1 = r1 * fade, h2 = r2 * fade;
  const C1 = p(P1[0], P1[1], h1, a0 + u1 + (spread - u1) * v - Math.PI / 2);
  const C2 = p(P2[0], P2[1], h1, a0 - u1 - (spread - u1) * v + Math.PI / 2);
  const C3 = p(P3[0], P3[1], h2, a0 + Math.PI - u2 - (Math.PI - u2 - spread) * v + Math.PI / 2);
  const C4 = p(P4[0], P4[1], h2, a0 - Math.PI + u2 + (Math.PI - u2 - spread) * v - Math.PI / 2);
  const f = q => q.map(v2 => v2.toFixed(1)).join(' ');
  return 'M' + f(P1) + 'C' + f(C1) + ',' + f(C3) + ',' + f(P3) +
         'A' + r2.toFixed(1) + ' ' + r2.toFixed(1) + ' 0 0 0 ' + f(P4) +
         'C' + f(C4) + ',' + f(C2) + ',' + f(P2) +
         'A' + r1.toFixed(1) + ' ' + r1.toFixed(1) + ' 0 0 0 ' + f(P1) + 'Z';
}

export function initAgentGeo(svg, opts = {}) {
  if (!svg) return () => {};
  const accent = opts.accent || '#80E593';
  const accent2 = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = window.gsap;
  const uid = 'geo' + Math.random().toString(36).slice(2, 7);

  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const defs = el('defs', {});
  const filt = el('filter', { id: uid + '-rim', x: '-20%', y: '-20%', width: '140%', height: '140%', 'color-interpolation-filters': 'sRGB' });
  filt.appendChild(el('feMorphology', { operator: 'erode', radius: '1.4', in: 'SourceAlpha', result: 'eroded' }));
  filt.appendChild(el('feComposite', { in: 'SourceAlpha', in2: 'eroded', operator: 'out', result: 'rim' }));
  filt.appendChild(el('feFlood', { 'flood-color': '#fff', result: 'white' }));
  filt.appendChild(el('feComposite', { in: 'white', in2: 'rim', operator: 'in' }));
  defs.appendChild(filt);

  const grad = el('linearGradient', { id: uid + '-g', x1: '0', y1: '0', x2: '1', y2: '1' });
  grad.appendChild(el('stop', { offset: '0', 'stop-color': accent }));
  grad.appendChild(el('stop', { offset: '1', 'stop-color': accent2 }));
  defs.appendChild(grad);

  const geo = el('g', { id: uid + '-shapes', fill: '#fff' });
  defs.appendChild(geo);

  const mask = el('mask', { id: uid + '-mask', maskUnits: 'userSpaceOnUse', x: -60, y: -60, width: W + 120, height: H + 120 });
  mask.appendChild(el('use', { href: '#' + uid + '-shapes', filter: 'url(#' + uid + '-rim)' }));
  defs.appendChild(mask);
  svg.appendChild(defs);

  svg.appendChild(el('use', { href: '#' + uid + '-shapes', opacity: '.055' }));
  svg.appendChild(el('rect', { x: -60, y: -60, width: W + 120, height: H + 120, fill: 'url(#' + uid + '-g)', mask: 'url(#' + uid + '-mask)' }));

  const over = el('g', {});
  svg.appendChild(over);
  const burst = el('circle', { r: 30, fill: 'none', stroke: accent, 'stroke-width': 1, opacity: 0 });
  const core = el('circle', { r: 3.2, fill: accent2, opacity: 0 });
  over.appendChild(burst); over.appendChild(core);

  /* --- agentes --- */
  const agents = HOMES.map((h, i) => {
    const path = el('path', { d: '' });
    geo.appendChild(path);
    const label = el('text', {
      'font-family': 'IBM Plex Mono, monospace', 'font-size': 10.5,
      'letter-spacing': '0.05em', fill: 'rgba(255,255,255,.92)', 'text-anchor': 'middle',
      opacity: 0, stroke: '#141414', 'stroke-width': 3.4, 'stroke-linejoin': 'round', 'paint-order': 'stroke'
    });
    label.textContent = ROLES[i % ROLES.length];
    over.appendChild(label);
    const si = i % SHAPES.length;
    return {
      hx: h[0], hy: h[1], x: h[0], y: h[1], vx: 0, vy: 0,
      r: 20 + (i % 3) * 2.6, ph: i * 1.31, act: 0,
      si, from: SHAPES[si], to: SHAPES[(si + 1) % SHAPES.length], p: 0, rot: i * 0.26,
      path, label
    };
  });

  const necks = agents.map(() => { const p = el('path', { d: '' }); geo.appendChild(p); return p; });
  const ticks = agents.map(() => { const p = el('path', { d: '', stroke: 'rgba(255,255,255,.45)', 'stroke-width': 1, fill: 'none', opacity: 0 }); over.insertBefore(p, burst); return p; });
  const taskPath = el('path', { d: '' });
  geo.appendChild(taskPath);

  const task = { x: W * 0.46, y: H * 0.42, r: 34, live: still ? 1 : 0, si: 2, from: 6, to: 0, p: 0, rot: 0 };
  const state = { members: [], pointer: false, lastMove: -1e9, phase: still ? 'work' : 'idle', tPhase: 0, next: 900 };

  /* morph: progreso 0→1 con expo.inOut, luego avanza al siguiente par */
  const tweens = [];
  function cycle(o, dur, hold, delay) {
    if (!G) return;
    const next = () => {
      o.si = (o.si + 1) % SHAPES.length;
      o.from = SHAPES[o.si];
      o.to = SHAPES[(o.si + 1) % SHAPES.length];
      o.p = 0;
    };
    const tl = G.timeline({ repeat: -1, delay: delay || 0 });
    tl.to(o, { p: 1, duration: dur, ease: 'expo.inOut' })
      .add(next)
      .to(o, { duration: hold });
    tweens.push(tl);
  }
  if (!still) {
    agents.forEach((a, i) => {
      cycle(a, 1.5, 1.5, i * 0.38);
      tweens.push(G && G.to(a, { rot: a.rot + TAU * (i % 2 ? -1 : 1), duration: 52 + i * 3, repeat: -1, ease: 'none' }));
    });
    cycle(task, 1.3, 1.4, 0.3);
    if (G) tweens.push(G.to(task, { rot: TAU, duration: 64, repeat: -1, ease: 'none' }));
  }

  const enlist = () => {
    const scored = agents.map(a => ({ a, d: Math.hypot(a.x - task.x, a.y - task.y) })).sort((p, q) => p.d - q.d);
    const keep = state.members.filter(m => Math.hypot(m.x - task.x, m.y - task.y) < 215).slice(0, 3);
    for (const s of scored) { if (keep.length >= 3) break; if (keep.indexOf(s.a) === -1) keep.push(s.a); }
    if (keep.length !== state.members.length || keep.some((m, i) => m !== state.members[i])) {
      const gone = state.members.filter(m => keep.indexOf(m) === -1);
      state.members = keep;
      if (G) {
        gone.forEach(m => G.to(m, { act: 0, duration: .55, ease: 'power2.inOut', overwrite: 'auto' }));
        keep.forEach((m, i) => G.to(m, { act: 1, duration: .7, delay: i * .09, ease: 'power3.out', overwrite: 'auto' }));
      }
    }
  };

  const release = () => {
    const gone = state.members.slice();
    state.members = [];
    if (G) gone.forEach((m, i) => G.to(m, { act: 0, duration: .7, delay: i * .07, ease: 'power2.inOut', overwrite: 'auto' }));
  };

  const onMove = e => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const px = ((e.clientX - r.left) / r.width) * W, py = ((e.clientY - r.top) / r.height) * H;
    if (px < -50 || px > W + 50 || py < -40 || py > H + 40) return;
    state.pointer = true; state.lastMove = performance.now();
    state.phase = 'hover';
    if (G) G.to(task, { x: px, y: py, duration: .8, ease: 'power3.out', overwrite: 'auto' });
    else { task.x = px; task.y = py; }
  };

  let raf = null, io = null, visible = true, t0 = performance.now(), prev = t0;

  function step(dt, T) {
    const now = performance.now();
    if (!still) {
      if (state.pointer && now - state.lastMove > 2400) { state.pointer = false; state.phase = 'idle'; state.tPhase = now; }
      if (!state.pointer) {
        if (state.phase === 'idle' && now - state.tPhase > state.next) {
          const nx = 150 + Math.random() * (W - 300), ny = 140 + Math.random() * (H - 290);
          if (G) G.to(task, { x: nx, y: ny, duration: 1.6, ease: 'power2.inOut', overwrite: 'auto' });
          else { task.x = nx; task.y = ny; }
          state.phase = 'work'; state.tPhase = now;
        } else if (state.phase === 'work' && now - state.tPhase > 3100) {
          state.phase = 'done'; state.tPhase = now;
          release();
          if (G) G.fromTo(burst, { attr: { r: 34 }, opacity: .45 }, { attr: { r: 130 }, opacity: 0, duration: 1.2, ease: 'power2.out' });
        } else if (state.phase === 'done' && now - state.tPhase > 1100) {
          state.phase = 'idle'; state.tPhase = now;
          state.next = 1200 + Math.random() * 1400;
        }
      }
    }

    const wants = state.phase === 'hover' || state.phase === 'work';
    task.live += ((wants ? 1 : 0) - task.live) * Math.min(1, dt * 3);
    if (wants) enlist();

    if (!G) {
      const ez = t => t < .5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
      const adv = (o, period, off) => {
        const c = (T / period + off) % SHAPES.length;
        o.si = Math.floor(c);
        o.from = SHAPES[o.si]; o.to = SHAPES[(o.si + 1) % SHAPES.length];
        const fr = c - Math.floor(c);
        o.p = fr < .5 ? 0 : ez((fr - .5) / .5);
      };
      agents.forEach((a, i) => { adv(a, 3, i * 0.3); a.rot = T * 0.12 * (i % 2 ? -1 : 1) + a.ph; const on = state.members.indexOf(a) > -1 && task.live > .25; a.act += ((on ? 1 : 0) - a.act) * Math.min(1, dt * 4); });
      adv(task, 2.7, 0.4); task.rot = T * 0.1;
    }

    agents.forEach(a => {
      const on = state.members.indexOf(a) > -1;
      let gx, gy;
      if (on) {
        const idx = state.members.indexOf(a);
        const ang = -0.85 + idx * 1.12 + Math.sin(T * 0.45 + idx) * 0.1;
        const rad = 72 + idx * 9 - 14 * a.act;
        gx = task.x + Math.cos(ang) * rad;
        gy = task.y + Math.sin(ang) * rad;
      } else {
        gx = a.hx + Math.sin(T * 0.28 + a.ph) * 9;
        gy = a.hy + Math.cos(T * 0.24 + a.ph * 1.3) * 8;
      }
      const k = on ? 6.5 : 2.4;
      a.vx += (gx - a.x) * k * dt; a.vy += (gy - a.y) * k * dt;
      a.vx *= 0.87; a.vy *= 0.87;
      a.x += a.vx; a.y += a.vy;
    });
  }

  /* interpolación ancla a ancla + rotación */
  const buf = new Array(A), CIRCLE = LIB[0];
  /* anclas interpoladas + rotación; `round` las lleva al círculo (fusión) */
  function morphed(o, round) {
    const from = LIB[o.from], to = LIB[o.to], p = o.p;
    const r = round ? Math.min(1, round) : 0;
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    for (let i = 0; i < A; i++) {
      let x = from[i][0] + (to[i][0] - from[i][0]) * p;
      let y = from[i][1] + (to[i][1] - from[i][1]) * p;
      if (r) { x += (CIRCLE[i][0] - x) * r; y += (CIRCLE[i][1] - y) * r; }
      buf[i] = [x * c - y * s, x * s + y * c];
    }
    return buf;
  }

  function render() {
    const tr = (task.r + 8 * task.live) * (0.45 + 0.55 * task.live);
    const fuse = agents.reduce((m, a) => Math.max(m, a.act), 0) * task.live;
    taskPath.setAttribute('d', task.live > .02 ? pathFrom(morphed(task, fuse), tr, task.x, task.y, 0.1) : '');
    core.setAttribute('cx', task.x.toFixed(1)); core.setAttribute('cy', task.y.toFixed(1));
    core.setAttribute('opacity', task.live.toFixed(2));
    burst.setAttribute('cx', task.x.toFixed(1)); burst.setAttribute('cy', task.y.toFixed(1));

    agents.forEach((a, i) => {
      const R = a.r * (1 + 0.38 * a.act);
      const w = a.act * task.live;
      a.path.setAttribute('d', pathFrom(morphed(a, w), R, a.x, a.y, 0.12));
      // el cuello une los bordes que de verdad se dibujan (ya circulares al fusionar)
      necks[i].setAttribute('d', w > 0.05 ? neck(task.x, task.y, tr, a.x, a.y, R, 0.4 + 0.5 * w) : '');
      if (a.act > 0.05) {
        const dx = a.x - task.x, dy = a.y - task.y, d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        const edge = d + R;                       // borde externo de la masa en esa dirección
        const lx = clamp(task.x + ux * (edge + 20), 66, W - 66);
        const ly = clamp(task.y + uy * (edge + 20) + 4, 20, H - 12);
        a.label.setAttribute('x', lx.toFixed(1));
        a.label.setAttribute('y', ly.toFixed(1));
        a.label.setAttribute('opacity', (a.act * 0.95).toFixed(2));
        ticks[i].setAttribute('d', 'M' + (task.x + ux * (edge + 3)).toFixed(1) + ' ' + (task.y + uy * (edge + 3)).toFixed(1) +
          'L' + (task.x + ux * (edge + 12)).toFixed(1) + ' ' + (task.y + uy * (edge + 12)).toFixed(1));
        ticks[i].setAttribute('opacity', (a.act * 0.5).toFixed(2));
      } else { a.label.setAttribute('opacity', 0); ticks[i].setAttribute('opacity', 0); }
    });
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!visible) { prev = now; return; }
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    step(dt, (now - t0) / 1000);
    render();
  }

  if (still) {
    task.live = 1; task.p = 0;
    enlist();
    state.members.forEach((m, i) => {
      const ang = -0.8 + i * 1.15;
      m.x = task.x + Math.cos(ang) * 70; m.y = task.y + Math.sin(ang) * 70; m.act = 1;
    });
    render();
  } else {
    raf = requestAnimationFrame(loop);
    window.addEventListener('mousemove', onMove, { passive: true });
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; }, { rootMargin: '140px' });
      io.observe(svg);
    }
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove);
    if (io) io.disconnect();
    tweens.forEach(t => t && t.kill && t.kill());
  };
}
