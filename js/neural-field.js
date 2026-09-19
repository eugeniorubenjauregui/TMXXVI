/* Rizoma — filamentos curvos que crecen, se ramifican y respiran.
   Textura de fondo para superficie clara: bajo contraste, ritmo lento, sin rectas. */

const NS = 'http://www.w3.org/2000/svg';
const W = 900, H = 520;

const el = (tag, a) => {
  const n = document.createElementNS(NS, tag);
  for (const k in a) n.setAttribute(k, a[k]);
  return n;
};

// aleatoriedad estable: el dibujo no cambia entre recargas
let seed = 913377;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// polilínea suavizada (Catmull-Rom → cúbicas)
function smooth(p) {
  if (p.length < 2) return '';
  let d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ',' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
         ',' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d;
}

export function initNeuralField(svg, opts = {}) {
  if (!svg) return () => {};
  const ink = opts.ink || '#17747C';
  const still = opts.motion === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  seed = 913377;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const branches = [];
  const nodes = [];

  // un filamento: avanza con deriva angular y se ramifica
  function grow(x, y, ang, len, depth, delay) {
    const steps = 7 + ((rnd() * 5) | 0);
    const pts = [[x, y]];
    let cx = x, cy = y, a = ang;
    let curl = (rnd() - 0.5) * 0.5;
    for (let i = 0; i < steps; i++) {
      curl += (rnd() - 0.5) * 0.34;
      curl = Math.max(-0.62, Math.min(0.62, curl));
      a += curl * 0.42;
      const st = len * (0.82 + rnd() * 0.36);
      cx += Math.cos(a) * st;
      cy += Math.sin(a) * st;
      pts.push([cx, cy]);
      if (cx < -80 || cx > W + 80 || cy < -60 || cy > H + 60) break;
    }
    const path = el('path', {
      d: smooth(pts), fill: 'none',
      stroke: 'rgba(23,116,124,' + (0.30 - depth * 0.06).toFixed(2) + ')',
      'stroke-width': (1.5 - depth * 0.34).toFixed(2),
      'stroke-linecap': 'round'
    });
    const b = { path, pts, depth, delay, len: 0, ph: rnd() * 6.28, amp: 3 + rnd() * 5 };
    branches.push(b);

    if (depth < 3) {
      const kids = depth === 0 ? 2 + ((rnd() * 2) | 0) : (rnd() < 0.72 ? 1 : 2);
      for (let k = 0; k < kids; k++) {
        const at = 2 + ((rnd() * (pts.length - 3)) | 0);
        const p = pts[Math.min(at, pts.length - 1)];
        nodes.push({ x: p[0], y: p[1], r: 2.4 - depth * 0.4, delay: delay + at / pts.length * 1.5 });
        grow(p[0], p[1], a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.7), len * 0.78, depth + 1,
             delay + at / pts.length * 1.6);
      }
    }
  }

  // semillas: entran desde los bordes, nunca alineadas
  grow(-30, 402, -0.34, 46, 0, 0);
  grow(918, 96, 3.02, 44, 0, 0.5);
  grow(700, 548, -1.42, 42, 0, 1.1);
  grow(310, -28, 1.32, 40, 0, 1.7);

  const gB = el('g', {});
  branches.forEach(b => {
    b.wrap = el('g', {});
    b.wrap.appendChild(b.path);
    gB.appendChild(b.wrap);
  });
  svg.appendChild(gB);

  const gN = el('g', {});
  nodes.forEach(n => {
    n.el = el('circle', { cx: n.x.toFixed(1), cy: n.y.toFixed(1), r: n.r.toFixed(2), fill: 'rgba(20,20,20,.24)', opacity: 0 });
    gN.appendChild(n.el);
  });
  svg.appendChild(gN);

  const gP = el('g', {});
  const pulses = [];
  for (let i = 0; i < 4; i++) {
    const p = { b: (rnd() * branches.length) | 0, t: rnd(), sp: 0.07 + rnd() * 0.08, el: el('circle', { r: 2.4, fill: ink, opacity: 0 }) };
    pulses.push(p); gP.appendChild(p.el);
  }
  svg.appendChild(gP);

  branches.forEach(b => { b.total = b.path.getTotalLength(); b.path.setAttribute('stroke-dasharray', b.total); b.path.setAttribute('stroke-dashoffset', b.total); });

  function draw(t) {
    branches.forEach(b => {
      const k = Math.max(0, Math.min(1, (t - b.delay) / 3.4));
      const e = k * k * (3 - 2 * k);
      b.path.setAttribute('stroke-dashoffset', (b.total * (1 - e)).toFixed(1));
      const sx = Math.sin(t * 0.19 + b.ph) * b.amp;
      const sy = Math.cos(t * 0.15 + b.ph * 1.4) * b.amp * 0.7;
      b.wrap.setAttribute('transform', 'translate(' + sx.toFixed(2) + ' ' + sy.toFixed(2) + ')');
    });
    nodes.forEach(n => {
      const k = Math.max(0, Math.min(1, (t - n.delay - 0.6) / 1.4));
      n.el.setAttribute('opacity', (k * (0.7 + Math.sin(t * 0.6 + n.x) * 0.25)).toFixed(3));
    });
    pulses.forEach(p => {
      const b = branches[p.b];
      if (!b || t < b.delay + 1.2) { p.el.setAttribute('opacity', 0); return; }
      p.t += p.sp * 0.016;
      if (p.t >= 1) {
        p.t = 0;
        p.b = (Math.random() * branches.length) | 0;
        p.sp = 0.07 + Math.random() * 0.08;
      }
      let pt;
      try { pt = b.path.getPointAtLength(b.total * p.t); } catch (e) { return; }
      p.el.setAttribute('cx', pt.x.toFixed(1));
      p.el.setAttribute('cy', pt.y.toFixed(1));
      p.el.setAttribute('opacity', (Math.sin(Math.PI * p.t) * 0.7).toFixed(3));
    });
  }

  const compose = () => {
    branches.forEach(b => b.path.setAttribute('stroke-dashoffset', 0));
    nodes.forEach(n => n.el.setAttribute('opacity', 0.7));
    draw(9);
    branches.forEach(b => b.path.setAttribute('stroke-dashoffset', 0));
  };

  if (still) { compose(); return () => {}; }

  let raf = null, t0 = performance.now(), ticks = 0;
  const loop = now => {
    ticks++;
    draw((now - t0) / 1000);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const guard = setTimeout(() => { if (ticks < 3) compose(); }, 1500);

  return () => { if (raf) cancelAnimationFrame(raf); clearTimeout(guard); };
}
