/* Enjambre de agentes — los agentes convergen sobre una tarea, se encadenan,
   la ejecutan y se dispersan. Reacciona al cursor; si nadie interactúa, se cuenta solo.
   Todo el movimiento va por requestAnimationFrame: nada depende de transiciones CSS. */

const NS = 'http://www.w3.org/2000/svg';
const W = 560, H = 470;

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

export function initAgentSwarm(svg, opts = {}) {
  if (!svg) return () => {};
  const accent = opts.accent || '#80E593';
  const accent2 = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const gLinks = el('g', { fill: 'none', 'stroke-linecap': 'round' });
  const gTask = el('g');
  const gNodes = el('g');
  svg.appendChild(gLinks); svg.appendChild(gTask); svg.appendChild(gNodes);

  // tarea
  const taskRing = el('circle', { r: 15, fill: 'none', stroke: accent2, 'stroke-width': 1.2, opacity: 0 });
  const taskCore = el('circle', { r: 3.5, fill: accent2, opacity: 0 });
  const taskBurst = el('circle', { r: 15, fill: 'none', stroke: accent, 'stroke-width': 1.4, opacity: 0 });
  gTask.appendChild(taskBurst); gTask.appendChild(taskRing); gTask.appendChild(taskCore);

  // cadena
  const chain = el('polyline', { fill: 'none', stroke: accent, 'stroke-width': 1.4, opacity: 0, 'stroke-linejoin': 'round' });
  gLinks.appendChild(chain);
  const pulse = el('circle', { r: 3, fill: '#fff', opacity: 0 });
  gLinks.appendChild(pulse);

  const agents = HOMES.map((h, i) => {
    const g = el('g', {});
    const halo = el('circle', { cx: h[0], cy: h[1], r: 17, fill: accent, opacity: 0 });
    const dot = el('circle', { cx: h[0], cy: h[1], r: 4.5, fill: '#141414', stroke: 'rgba(255,255,255,.42)', 'stroke-width': 1.4 });
    const label = el('text', {
      x: h[0], y: h[1] - 16, 'text-anchor': 'middle', opacity: 0,
      'font-family': 'IBM Plex Mono, monospace', 'font-size': 10.5,
      'letter-spacing': '0.05em', fill: 'rgba(255,255,255,.92)'
    });
    label.textContent = ROLES[i % ROLES.length];
    g.appendChild(halo); g.appendChild(dot); g.appendChild(label);
    gNodes.appendChild(g);
    return {
      hx: h[0], hy: h[1], x: h[0], y: h[1], vx: 0, vy: 0,
      ph: i * 1.7, act: 0, halo, dot, label,
      role: ROLES[i % ROLES.length]
    };
  });

  const state = {
    tx: W * 0.5, ty: H * 0.5,     // posición de la tarea
    live: 0,                       // 0..1 intensidad de la tarea
    members: [],                   // agentes enrolados
    pointer: false, lastMove: -1e9,
    phase: 'idle', tPhase: 0, next: 1200
  };

  const toLocal = e => {
    const r = svg.getBoundingClientRect();
    if (!r.width) return null;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onMove = e => {
    const p = toLocal(e);
    if (!p) return;
    const inside = p.x > -60 && p.x < W + 60 && p.y > -40 && p.y < H + 40;
    if (!inside) return;
    state.pointer = true;
    state.lastMove = performance.now();
    state.tx = p.x; state.ty = p.y;
    state.phase = 'hover';
    // si el bucle está frenado, dibujar en el propio evento
    if (starved) { state.live = 1; draw(0.05); }
  };

  // enrolar los 3 más cercanos, con histéresis para que no parpadee
  const enlist = () => {
    const scored = agents.map(a => ({
      a, d: Math.hypot(a.x - state.tx, a.y - state.ty)
    })).sort((p, q) => p.d - q.d);
    const keep = state.members.filter(m => Math.hypot(m.x - state.tx, m.y - state.ty) < 210);
    const out = keep.slice(0, 3);
    for (const s of scored) {
      if (out.length >= 3) break;
      if (out.indexOf(s.a) === -1) out.push(s.a);
    }
    state.members = out;
  };

  let raf = null, t0 = performance.now(), prev = t0;

  const compose = () => {
    // estado estático legible cuando no hay movimiento
    state.tx = W * 0.46; state.ty = H * 0.42; state.live = 1;
    enlist();
    state.members.forEach((m, i) => {
      const ang = -0.8 + i * 1.15;
      m.x = state.tx + Math.cos(ang) * 74;
      m.y = state.ty + Math.sin(ang) * 74;
      m.act = 1;
    });
    draw(0);
  };

  function draw(dt) {
    const now = performance.now();
    const t = (now - t0) / 1000;

    // ciclo autónomo cuando nadie mueve el cursor
    if (!still) {
      const idleFor = now - state.lastMove;
      if (state.pointer && idleFor > 2400) { state.pointer = false; state.phase = 'idle'; state.tPhase = now; }
      if (!state.pointer) {
        if (state.phase === 'idle' && now - state.tPhase > state.next) {
          state.tx = 110 + Math.random() * (W - 220);
          state.ty = 90 + Math.random() * (H - 200);
          state.phase = 'work'; state.tPhase = now;
        } else if (state.phase === 'work' && now - state.tPhase > 2700) {
          state.phase = 'done'; state.tPhase = now;
        } else if (state.phase === 'done' && now - state.tPhase > 900) {
          state.phase = 'idle'; state.tPhase = now;
          state.next = 1400 + Math.random() * 1600;
          state.members = [];
        }
      }
    }

    const wants = state.phase === 'hover' || state.phase === 'work';
    state.live += ((wants ? 1 : 0) - state.live) * Math.min(1, dt * 3.4);
    if (wants) enlist();

    // tarea
    const pulsate = 1 + Math.sin(t * 3.4) * 0.12;
    taskRing.setAttribute('cx', state.tx); taskRing.setAttribute('cy', state.ty);
    taskRing.setAttribute('r', 15 * pulsate);
    taskRing.setAttribute('opacity', state.live * 0.75);
    taskCore.setAttribute('cx', state.tx); taskCore.setAttribute('cy', state.ty);
    taskCore.setAttribute('opacity', state.live);

    // estallido al completar
    if (state.phase === 'done') {
      const k = Math.min(1, (now - state.tPhase) / 900);
      taskBurst.setAttribute('cx', state.tx); taskBurst.setAttribute('cy', state.ty);
      taskBurst.setAttribute('r', 15 + k * 78);
      taskBurst.setAttribute('opacity', (1 - k) * 0.55);
    } else taskBurst.setAttribute('opacity', 0);

    // agentes
    agents.forEach((a, i) => {
      const on = state.members.indexOf(a) > -1 && state.live > 0.25;
      a.act += ((on ? 1 : 0) - a.act) * Math.min(1, dt * 5);

      let gx, gy;
      if (on) {
        const idx = state.members.indexOf(a);
        const ang = -0.85 + idx * 1.12 + Math.sin(t * 0.5 + idx) * 0.1;
        const rad = 68 + idx * 7;
        gx = state.tx + Math.cos(ang) * rad;
        gy = state.ty + Math.sin(ang) * rad;
      } else {
        gx = a.hx + Math.sin(t * 0.32 + a.ph) * 7;
        gy = a.hy + Math.cos(t * 0.27 + a.ph * 1.3) * 6;
      }

      const k = on ? 7.5 : 2.6;
      a.vx += (gx - a.x) * k * dt;
      a.vy += (gy - a.y) * k * dt;
      a.vx *= 0.86; a.vy *= 0.86;
      a.x += a.vx; a.y += a.vy;

      a.halo.setAttribute('cx', a.x); a.halo.setAttribute('cy', a.y);
      a.halo.setAttribute('opacity', a.act * 0.15);
      a.dot.setAttribute('cx', a.x); a.dot.setAttribute('cy', a.y);
      a.dot.setAttribute('r', 4.5 + a.act * 1.6);
      a.dot.setAttribute('fill', a.act > 0.5 ? accent : '#141414');
      a.dot.setAttribute('stroke', a.act > 0.5 ? accent : 'rgba(255,255,255,.42)');
      a.label.setAttribute('x', a.x); a.label.setAttribute('y', a.y - 15 - a.act * 3);
      a.label.setAttribute('opacity', a.act);
    });

    // cadena tarea → agentes
    if (state.members.length && state.live > 0.05) {
      const pts = [[state.tx, state.ty]].concat(state.members.map(m => [m.x, m.y]));
      chain.setAttribute('points', pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
      chain.setAttribute('opacity', state.live * 0.62);

      // pulso recorriendo la cadena
      const segs = [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        segs.push(d); total += d;
      }
      let travel = ((t * 190) % (total || 1));
      let px = pts[0][0], py = pts[0][1];
      for (let i = 0; i < segs.length; i++) {
        if (travel <= segs[i]) {
          const f = segs[i] ? travel / segs[i] : 0;
          px = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f;
          py = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
          break;
        }
        travel -= segs[i];
      }
      pulse.setAttribute('cx', px); pulse.setAttribute('cy', py);
      pulse.setAttribute('opacity', state.live * 0.95);
    } else {
      chain.setAttribute('opacity', 0);
      pulse.setAttribute('opacity', 0);
    }
  }

  if (still) { compose(); return () => {}; }

  let ticks = 0, starved = false;
  const loop = now => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    ticks++;
    draw(dt);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  window.addEventListener('mousemove', onMove, { passive: true });

  // si el contexto no anima, mostrar el estado ensamblado en vez de un campo inerte
  const guard = setTimeout(() => { if (ticks < 3) { starved = true; compose(); } }, 1500);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(guard);
    window.removeEventListener('mousemove', onMove);
  };
}
