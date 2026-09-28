/* filament-field.js — red neuronal viva (three.js).
   Neuronas con soma luminoso y dendritas ramificadas; axones curvos las conectan.
   Una neurona dispara: una onda recorre sus dendritas y una señal viaja por un axón
   hasta la siguiente, que puede volver a disparar (con período refractario).
   El cursor ilumina lo que toca y activa la neurona más cercana.
   initFilamentField(host, { accent, accent2, motion }) -> dispose() */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const MAXN = 12, MAXC = 28;

const LVERT = `
attribute vec4 aInfo; attribute float aLen; attribute float aTone;
uniform float uTime, uAspect, uIn;
uniform float uAge[${MAXN}]; uniform float uConn[${MAXC}]; uniform float uDir[${MAXC}];
varying float vGlow, vKind, vDist, vLen, vTone, vVis; varying vec2 vP;
void main(){
  vec2 p = position.xy;
  float kind = aInfo.z, dist = aInfo.y;
  p += vec2(sin(uTime * 0.5 + p.y * 6.0 + aInfo.w), cos(uTime * 0.45 + p.x * 6.0 + aInfo.w)) * 0.007 * (kind < 0.5 ? dist : 1.0);
  float glow = 0.0;
  if (kind < 0.5) {
    int ni = int(aInfo.x + 0.5);
    float age = uAge[ni];
    glow = exp(-pow(aLen - age * 0.75, 2.0) * 90.0) * exp(-age * 0.9) * 1.5 + exp(-age * 3.0) * 0.6 * (1.0 - dist);
    vVis = smoothstep(uIn * 1.25, uIn * 1.25 - 0.08, dist);
  } else if (kind < 1.5) {
    int ci = int(aInfo.x + 0.5);
    float pr = uConn[ci];
    float d = uDir[ci] > 0.0 ? dist : 1.0 - dist;
    if (pr >= 0.0) glow = exp(-pow(d - pr, 2.0) * 1400.0) * 2.0 + step(d, pr) * exp(-(pr - d) * 12.0) * 0.45;
    vVis = smoothstep(0.7, 1.0, uIn);
  } else {
    vVis = smoothstep(0.3, 1.0, uIn);
  }
  vGlow = glow; vKind = kind; vDist = dist; vLen = aLen; vTone = aTone; vP = p;
  gl_Position = vec4(p.x / uAspect, p.y, 0.0, 1.0);
}`;
const LFRAG = `
uniform vec3 uA, uB; uniform vec2 uMouse; uniform float uHover;
varying float vGlow, vKind, vDist, vLen, vTone, vVis; varying vec2 vP;
void main(){
  vec3 col = mix(uB, uA, vTone);
  float base = vKind < 0.5 ? 0.2 * (1.0 - vDist * 0.75) + exp(-vLen * 7.0) * 0.7
             : (vKind < 1.5 ? 0.09 : 0.055);
  float m = uHover * exp(-dot(vP - uMouse, vP - uMouse) * 10.0);
  float o = (base + vGlow + m * (vKind < 1.5 ? 0.7 : 0.35)) * vVis;
  vec3 c = mix(col, vec3(1.0), clamp(vGlow * 0.6 + exp(-vLen * 9.0) * (vKind < 0.5 ? 0.6 : 0.0) + m * 0.4, 0.0, 1.0));
  gl_FragColor = vec4(c * o, o);
}`;
const PVERT = `
attribute float aIdx; attribute float aSize; attribute float aTone;
uniform float uAge[${MAXN}]; uniform float uAspect, uIn, uPix;
varying float vFire, vTone;
void main(){
  int ni = int(aIdx + 0.5);
  float f = exp(-uAge[ni] * 2.4);
  vFire = f; vTone = aTone;
  gl_Position = vec4(position.x / uAspect, position.y, 0.0, 1.0);
  gl_PointSize = aSize * uPix * (1.0 + f * 1.6) * smoothstep(0.0, 0.35, uIn);
}`;
const PFRAG = `
uniform vec3 uA, uB; varying float vFire, vTone;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 18.0), halo = exp(-d * d * 3.5) * 0.35;
  vec3 col = mix(mix(uB, uA, vTone), vec3(1.0), core * 0.9 + vFire * 0.5);
  float o = (core + halo) * (0.75 + vFire * 0.9);
  gl_FragColor = vec4(col * o, o);
}`;

function build(a) {
  let s = 20260925;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const wide = a > 1.1;
  const spots = wide
    ? [[0.70, 0.50, 1.0], [0.50, 0.20, 0.55], [0.56, 0.84, 0.6], [0.86, 0.16, 0.6], [0.92, 0.76, 0.65], [0.38, 0.56, 0.45], [0.80, 0.97, 0.45], [0.99, 0.44, 0.5], [0.28, 0.12, 0.4]]
    : [[0.66, 0.30, 1.0], [0.30, 0.12, 0.55], [0.86, 0.06, 0.5], [0.40, 0.52, 0.5], [0.90, 0.56, 0.55], [0.62, 0.78, 0.5], [0.18, 0.86, 0.45], [0.88, 0.94, 0.45]];
  const neurons = spots.map(([u, v, k], i) => ({ x: (u * 2 - 1) * a, y: v * 2 - 1, k, tone: i % 4 === 1 ? 1 : 0 }));
  const pos = [], info = [], len = [], tone = [];
  const seg = (x0, y0, x1, y1, i0, i1, l0, l1, t) => {
    pos.push(x0, y0, 0, x1, y1, 0);
    info.push(...i0, ...i1); len.push(l0, l1); tone.push(t, t);
  };
  neurons.forEach((n, ni) => {
    const reach = 0.55 * n.k + 0.25;
    const grow = (x, y, ang, L0, maxL, depth) => {
      let cx = x, cy = y, a0 = ang, curl = (rnd() - 0.5) * 0.3, L = L0;
      const step = 0.018;
      const steps = Math.floor(maxL / step);
      for (let i = 0; i < steps; i++) {
        curl += (rnd() - 0.5) * 0.28; curl = Math.max(-0.5, Math.min(0.5, curl));
        a0 += curl * 0.35;
        const nx = cx + Math.cos(a0) * step, ny = cy + Math.sin(a0) * step;
        const w = rnd() * 6.28;
        seg(cx, cy, nx, ny, [ni, Math.min(1, L / reach), 0, w], [ni, Math.min(1, (L + step) / reach), 0, w], L, L + step, n.tone);
        cx = nx; cy = ny; L += step;
        if (depth < 3 && rnd() < 0.07 - depth * 0.015) grow(cx, cy, a0 + (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.6), L, (maxL - i * step) * (0.5 + rnd() * 0.4), depth + 1);
      }
    };
    const K = Math.round(7 + n.k * 7);
    for (let d = 0; d < K; d++) grow(n.x, n.y, (d / K) * 6.283 + rnd() * 0.6, 0, reach * (0.45 + rnd() * 0.55), 0);
  });
  const conns = [];
  neurons.forEach((n, i) => {
    const near = neurons.map((m, j) => [j, Math.hypot(m.x - n.x, m.y - n.y)]).filter(([j]) => j !== i).sort((p, q) => p[1] - q[1]).slice(0, 2);
    near.forEach(([j]) => { if (!conns.some(c => (c.a === i && c.b === j) || (c.a === j && c.b === i)) && conns.length < MAXC) conns.push({ a: i, b: j, pr: -1, dir: 1, sp: 0 }); });
  });
  conns.forEach((c, ci) => {
    const A = neurons[c.a], B = neurons[c.b];
    const dx = B.x - A.x, dy = B.y - A.y, dl = Math.hypot(dx, dy);
    const off = (rnd() - 0.5) * 0.5 * dl;
    const cx = (A.x + B.x) / 2 - dy / dl * off, cy = (A.y + B.y) / 2 + dx / dl * off;
    const S = 80, f = 3 + rnd() * 4, ph = rnd() * 6.28, amp = 0.012 + rnd() * 0.02;
    let px = A.x, py = A.y;
    for (let i = 1; i <= S; i++) {
      const t = i / S, it = 1 - t;
      let x = it * it * A.x + 2 * it * t * cx + t * t * B.x, y = it * it * A.y + 2 * it * t * cy + t * t * B.y;
      const wv = Math.sin(t * f * 6.28 + ph) * amp * Math.sin(t * Math.PI);
      x += -dy / dl * wv; y += dx / dl * wv;
      seg(px, py, x, y, [ci, (i - 1) / S, 1, 0], [ci, t, 1, 0], 1, 1, 1);
      px = x; py = y;
    }
    c.sp = 0.55 / Math.max(0.3, dl);
  });
  for (let f = 0; f < 70; f++) {
    let x = (0.1 + rnd() * 0.95) * 2 * a - a, y = rnd() * 2.4 - 1.2, ang = rnd() * 6.28, curl = 0;
    const w = rnd() * 6.28;
    for (let i = 0; i < 70; i++) {
      curl += (rnd() - 0.5) * 0.3; curl = Math.max(-0.4, Math.min(0.4, curl)); ang += curl * 0.3;
      const nx = x + Math.cos(ang) * 0.025, ny = y + Math.sin(ang) * 0.025;
      seg(x, y, nx, ny, [0, i / 70, 2, w], [0, (i + 1) / 70, 2, w], 1, 1, rnd() < 0.2 ? 1 : 0);
      x = nx; y = ny;
    }
  }
  return { neurons, conns, pos, info, len, tone };
}

export function initFilamentField(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const target = opts.pointerTarget || host.parentElement || host;
  let stopped = false, raf = 0, ro = null, io = null, visible = false, seen = false, disposer = null;

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix); renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    host.appendChild(canvas);

    const ages = new Array(MAXN).fill(99), connPr = new Array(MAXC).fill(-1), connDir = new Array(MAXC).fill(1);
    const U = {
      uTime: { value: 0 }, uIn: { value: still ? 1 : 0 }, uAspect: { value: 1 }, uPix: { value: pix },
      uAge: { value: ages }, uConn: { value: connPr }, uDir: { value: connDir },
      uMouse: { value: new THREE.Vector2(9, 9) }, uHover: { value: 0 },
      uA: { value: new THREE.Color(opts.accent || '#80E593') }, uB: { value: new THREE.Color(opts.accent2 || '#52C7CF') }
    };
    const blendMode = opts.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
    const lmat = new THREE.ShaderMaterial({ vertexShader: LVERT, fragmentShader: LFRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: blendMode });
    const pmat = new THREE.ShaderMaterial({ vertexShader: PVERT, fragmentShader: PFRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: blendMode });
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    let net = null, lines = null, somas = null, curA = 0;

    const rebuild = a => {
      if (lines) { scene.remove(lines, somas); lines.geometry.dispose(); somas.geometry.dispose(); }
      net = build(a); curA = a;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(net.pos), 3));
      g.setAttribute('aInfo', new THREE.BufferAttribute(new Float32Array(net.info), 4));
      g.setAttribute('aLen', new THREE.BufferAttribute(new Float32Array(net.len), 1));
      g.setAttribute('aTone', new THREE.BufferAttribute(new Float32Array(net.tone), 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
      lines = new THREE.LineSegments(g, lmat);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(net.neurons.flatMap(n => [n.x, n.y, 0])), 3));
      pg.setAttribute('aIdx', new THREE.BufferAttribute(new Float32Array(net.neurons.map((n, i) => i)), 1));
      pg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(net.neurons.map(n => 14 + n.k * 22)), 1));
      pg.setAttribute('aTone', new THREE.BufferAttribute(new Float32Array(net.neurons.map(n => n.tone)), 1));
      pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
      somas = new THREE.Points(pg, pmat);
      scene.add(lines, somas);
      connPr.fill(-1);
    };

    const fire = i => {
      if (!net || ages[i] < 1.4) return;
      ages[i] = 0;
      const out = net.conns.map((c, ci) => [c, ci]).filter(([c]) => (c.a === i || c.b === i) && c.pr < 0);
      out.sort(() => Math.random() - 0.5).slice(0, 1 + (Math.random() < 0.4 ? 1 : 0)).forEach(([c, ci]) => {
        c.dir = c.a === i ? 1 : -1; c.pr = -0.25; connDir[ci] = c.dir;
      });
    };

    const goal = new THREE.Vector2(9, 9), cur = new THREE.Vector2(9, 9);
    let hoverGoal = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      const x = (((e.clientX - r.left) / r.width) * 2 - 1) * U.uAspect.value, y = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (hoverGoal === 0) cur.set(x, y);
      goal.set(x, y); hoverGoal = 1;
      if (net) net.neurons.forEach((n, i) => { if (Math.hypot(n.x - x, n.y - y) < 0.12) fire(i); });
      if (still) frame();
    };
    const onLeave = () => { hoverGoal = 0; };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);

    let rt = 0;
    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      const a = w / h; U.uAspect.value = a;
      clearTimeout(rt);
      if (!net || Math.abs(a - curA) > 0.04) rt = setTimeout(() => { rebuild(a); if (still) frame(); }, net ? 160 : 0);
      if (!net) rebuild(a);
      if (still) frame();
    };
    ro = new ResizeObserver(resize);

    let t = 0, tIn = 0, last = performance.now(), nextSpont = 2.6, kicked = false;
    function frame() {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!still) {
        t += dt;
        if (seen) tIn = Math.min(1, tIn + dt / 3.0);
        U.uIn.value = tIn;
        for (let i = 0; i < ages.length; i++) ages[i] = Math.min(99, ages[i] + dt);
        if (net) {
          net.conns.forEach((c, ci) => {
            if (c.pr === -1) return;
            c.pr += dt * c.sp;
            if (c.pr >= 1) { c.pr = -1; if (Math.random() < 0.75) fire(c.dir > 0 ? c.b : c.a); }
            connPr[ci] = c.pr < 0 ? -1 : c.pr;
          });
          if (tIn > 0.85 && !kicked) { kicked = true; fire(0); }
          if (t > nextSpont && tIn >= 1) { fire(Math.random() < 0.35 ? 0 : Math.floor(Math.random() * net.neurons.length)); nextSpont = t + 1.4 + Math.random() * 1.8; }
        }
      }
      U.uTime.value = still ? 8 : t;
      cur.lerp(goal, 0.08); U.uMouse.value.copy(cur);
      U.uHover.value += (hoverGoal - U.uHover.value) * 0.05;
      renderer.render(scene, camera);
    }
    const loop = () => { raf = 0; if (stopped || !visible) return; frame(); raf = requestAnimationFrame(loop); };
    io = new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) seen = true;
      if (visible && !raf && !still) { last = performance.now(); loop(); }
    }, { threshold: 0.1 });
    io.observe(host); ro.observe(host); resize();
    if (still) frame();

    disposer = () => {
      clearTimeout(rt);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      if (lines) { lines.geometry.dispose(); somas.geometry.dispose(); }
      lmat.dispose(); pmat.dispose(); renderer.dispose(); canvas.remove();
    };
  }).catch(() => {});

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    ro && ro.disconnect(); io && io.disconnect();
    disposer && disposer();
  };
}
