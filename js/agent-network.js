/* agent-network.js — red de agentes (three.js, ESM por CDN).
   Cinco cúmulos de partículas (agentes) orbitan un núcleo de datos y sistemas.
   Corrientes de partículas los unen entre sí y con el núcleo. El agente activo
   gira al frente, se enciende y sus corrientes transportan pulsos.
   opts.getSel() → índice activo; opts.onPick(i) al tocar un agente. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const N = 5, RING = 1.32;

const ACT_FN = `
uniform float uAct[5];
float actOf(float k){ float r = 0.0; for(int j = 0; j < 5; j++){ if(abs(float(j) - k) < 0.5) r = uAct[j]; } return r; }
`;

const CLUSTER_VERT = ACT_FN + `
attribute vec3 aOff;
attribute float aN, aS;
uniform float uTime, uSize, uIn;
varying float vA, vK;
void main(){
  float act = actOf(aN);
  float l = length(aOff);
  float sp = (0.35 + 0.9 / (0.25 + l * 6.0)) * (0.5 + act * 0.7);
  float an = uTime * sp + aS * 6.2831;
  float c = cos(an), s = sin(an);
  vec3 o = vec3(aOff.x * c - aOff.z * s, aOff.y, aOff.x * s + aOff.z * c);
  o.y += sin(uTime * 1.3 + aS * 17.0) * 0.012;
  o *= (0.82 + act * 0.34) * mix(2.6, 1.0, uIn);
  vec4 mv = modelViewMatrix * vec4(position + o, 1.0);
  float core = exp(-l * 9.0);
  vA = (0.34 + core * 0.9) * (0.7 + act * 0.6) * uIn;
  vA *= 0.75 + 0.25 * sin(uTime * 2.1 + aS * 31.0);
  vK = act;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + act * 0.5 + core * 0.8) * (3.6 / -mv.z);
}`;

const CORE_VERT = `
attribute float aS;
uniform float uTime, uSize, uIn;
varying float vA, vK;
void main(){
  float an = uTime * (0.25 + aS * 0.3);
  float c = cos(an), s = sin(an);
  vec3 p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  p *= 1.0 + 0.06 * sin(uTime * 1.2 + aS * 6.28);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 1.8 + aS * 11.0))) * 0.8 * uIn;
  vK = 0.35;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (3.6 / -mv.z);
}`;

const LINK_VERT = ACT_FN + `
attribute float aT, aA, aB, aS;
uniform float uTime, uSize, uIn;
varying float vA, vK;
void main(){
  float act = max(aA < -0.5 ? 0.0 : actOf(aA), aB < -0.5 ? 0.0 : actOf(aB));
  float hub = (aA < -0.5 || aB < -0.5) ? 1.0 : 0.0;
  float dir = hub > 0.5 ? -1.0 : 1.0;
  float ph = fract(dir * uTime * (0.22 + act * 0.25) + aS * 0.37);
  float d = abs(aT - ph); d = min(d, 1.0 - d);
  float glow = exp(-pow(d / 0.06, 2.0));
  float edge = smoothstep(0.0, 0.12, aT) * smoothstep(1.0, 0.88, aT);
  vA = (0.16 + act * 0.35 + glow * (0.3 + act * 1.1)) * edge * uIn * (hub > 0.5 ? 0.8 : 1.0);
  vK = act;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + glow * act * 1.2) * (3.6 / -mv.z);
}`;

const DUST_VERT = `
attribute float aS;
uniform float uTime, uSize, uIn;
varying float vA, vK;
void main(){
  float an = uTime * 0.02 * (0.5 + aS);
  float c = cos(an), s = sin(an);
  vec3 p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (0.08 + 0.12 * (0.5 + 0.5 * sin(uTime * 0.8 + aS * 40.0))) * uIn;
  vK = 0.0;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (3.6 / -mv.z);
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2, uWhite;
varying float vA, vK;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.24, 0.5, length(d));
  if (m <= 0.0) discard;
  vec3 c = mix(uColor2, uColor, clamp(vK * 1.4, 0.0, 1.0));
  c = mix(c, uWhite, clamp(vA - 0.75, 0.0, 0.5));
  gl_FragColor = vec4(c, min(1.0, vA) * m);
}`;

const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

export function initAgentNetwork(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const accent2 = '#52C7CF';
  const names = opts.names || [];
  const getSel = opts.getSel || (() => 0);
  const onPick = opts.onPick || (() => {});
  const narrow = Math.min(host.clientWidth || 560, window.innerWidth) < 640;

  let stopped = false, raf = 0, ro = null, disposer = null;

  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  const labels = Array.from({ length: N }, (_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', names[i] || ('Agente ' + (i + 1)));
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:3px;' +
      'padding:6px 8px;background:none;border:0;cursor:pointer;pointer-events:auto;font:inherit;white-space:nowrap;' +
      'transform:translate(-50%,0);opacity:0;transition:opacity .4s';
    const num = document.createElement('span');
    num.textContent = String(i + 1).padStart(2, '0');
    num.style.cssText = 'font-family:' + MONO + ';font-size:9.5px;letter-spacing:.16em;color:rgba(255,255,255,.45);transition:color .3s';
    const txt = document.createElement('span');
    txt.textContent = (names[i] || '').replace(/^Agente de /i, '').toUpperCase();
    txt.style.cssText = 'font-family:' + MONO + ';font-size:10.5px;letter-spacing:.16em;color:rgba(255,255,255,.66);transition:color .3s';
    b.append(num, txt);
    b.addEventListener('click', e => { e.stopPropagation(); onPick(i); });
    layer.appendChild(b);
    return { b, num, txt, on: null, op: -1 };
  });

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix);
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.insertBefore(canvas, layer);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 1.2, 4.3);
    camera.lookAt(0, -0.32, 0.3);

    const world = new THREE.Group();
    scene.add(world);

    const col1 = new THREE.Color(accent), col2 = new THREE.Color(accent2), white = new THREE.Color('#ffffff');
    const act = [0, 0, 0, 0, 0];
    const common = () => ({
      uTime: { value: 0 }, uIn: { value: still ? 1 : 0 },
      uColor: { value: col1 }, uColor2: { value: col2 }, uWhite: { value: white }
    });
    const mk = (vert, U) => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    const rnd = (() => { let s = 20260922; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

    const centers = Array.from({ length: N }, (_, i) => {
      const a = i * 2 * Math.PI / N;
      return new THREE.Vector3(RING * Math.sin(a), 0, RING * Math.cos(a));
    });

    /* cúmulos */
    const PER = narrow ? 520 : 900;
    const cP = [], cO = [], cN = [], cS = [];
    centers.forEach((c, i) => {
      for (let k = 0; k < PER; k++) {
        const flat = k % 3 === 0;                     // un tercio forma un disco: se lee como órbita
        let x = gauss() * 0.15, y = gauss() * (flat ? 0.014 : 0.12), z = gauss() * 0.15;
        if (flat) { const r = 0.1 + rnd() * 0.2, t = rnd() * 6.2832; x = Math.cos(t) * r; z = Math.sin(t) * r; }
        cP.push(c.x, c.y, c.z); cO.push(x, y, z); cN.push(i); cS.push(rnd());
      }
    });
    const cGeo = new THREE.BufferGeometry();
    cGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cP), 3));
    cGeo.setAttribute('aOff', new THREE.BufferAttribute(new Float32Array(cO), 3));
    cGeo.setAttribute('aN', new THREE.BufferAttribute(new Float32Array(cN), 1));
    cGeo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(cS), 1));
    cGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const cU = Object.assign(common(), { uSize: { value: Math.max(2.6, pix * 2.0) }, uAct: { value: act } });
    const cMat = mk(CLUSTER_VERT, cU);
    world.add(new THREE.Points(cGeo, cMat));

    /* núcleo */
    const CN = narrow ? 600 : 1100;
    const kP = new Float32Array(CN * 3), kS = new Float32Array(CN);
    for (let i = 0; i < CN; i++) {
      const th = rnd() * 6.2832, ph = Math.acos(2 * rnd() - 1), r = Math.pow(rnd(), 0.5) * 0.3;
      kP[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      kP[i * 3 + 1] = Math.cos(ph) * r * 0.9;
      kP[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
      kS[i] = rnd();
    }
    const kGeo = new THREE.BufferGeometry();
    kGeo.setAttribute('position', new THREE.BufferAttribute(kP, 3));
    kGeo.setAttribute('aS', new THREE.BufferAttribute(kS, 1));
    kGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    const kU = Object.assign(common(), { uSize: { value: Math.max(2.0, pix * 1.5) } });
    const kMat = mk(CORE_VERT, kU);
    kU.uColor2.value = new THREE.Color(accent).lerp(white, 0.45);
    world.add(new THREE.Points(kGeo, kMat));

    /* corrientes: anillo entre vecinos + radios al núcleo */
    const lP = [], lT = [], lA = [], lB = [], lS = [];
    const SAMPLES = narrow ? 70 : 110, STR = 3;
    const addLink = (a, b, ia, ib, lift) => {
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += lift;
      if (ia >= 0 && ib >= 0) mid.multiplyScalar(1.12);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const seed = rnd() * 10;
      for (let s = 0; s < STR; s++) {
        for (let k = 0; k < SAMPLES; k++) {
          const t = (k + rnd() * 0.6) / SAMPLES;
          const p = curve.getPoint(t);
          const j = Math.sin(t * Math.PI) * 0.022;
          lP.push(p.x + gauss() * j, p.y + gauss() * j, p.z + gauss() * j);
          lT.push(t); lA.push(ia); lB.push(ib); lS.push(seed + s * 0.08);
        }
      }
    };
    const O = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      addLink(centers[i], centers[(i + 1) % N], i, (i + 1) % N, 0.18);
      addLink(O, centers[i], -1, i, 0.1);
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lP), 3));
    lGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(lT), 1));
    lGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(lA), 1));
    lGeo.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(lB), 1));
    lGeo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(lS), 1));
    lGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const lU = Object.assign(common(), { uSize: { value: Math.max(1.7, pix * 1.25) }, uAct: { value: act } });
    const lMat = mk(LINK_VERT, lU);
    world.add(new THREE.Points(lGeo, lMat));

    /* polvo: plano orbital tenue */
    const DN = narrow ? 700 : 1400;
    const dP = new Float32Array(DN * 3), dS = new Float32Array(DN);
    for (let i = 0; i < DN; i++) {
      const r = 0.5 + Math.pow(rnd(), 0.7) * 2.1, t = rnd() * 6.2832;
      dP[i * 3] = Math.cos(t) * r; dP[i * 3 + 1] = gauss() * 0.04; dP[i * 3 + 2] = Math.sin(t) * r;
      dS[i] = rnd();
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.BufferAttribute(dP, 3));
    dGeo.setAttribute('aS', new THREE.BufferAttribute(dS, 1));
    dGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const dU = Object.assign(common(), { uSize: { value: Math.max(1.5, pix * 1.1) } });
    const dMat = mk(DUST_VERT, dU);
    world.add(new THREE.Points(dGeo, dMat));

    let w = 0, h = 0;
    const resize = () => {
      w = host.clientWidth || 560;
      h = host.clientHeight || Math.round(w * 0.8);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      // en pantallas estrechas se aleja la cámara para que el anillo entre completo
      camera.position.set(0, 1.2, camera.aspect < 1.1 ? 4.3 / Math.max(0.62, camera.aspect / 1.1) : 4.3);
      camera.lookAt(0, -0.32, 0.3);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    /* puntero: paralaje leve + clic sobre el cúmulo más cercano */
    let tx = 0, ty = 0, mx = 0, my = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 0.28;
      ty = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 0.14;
    };
    const onLeave = () => { tx = 0; ty = 0; };
    const scr = centers.map(() => ({ x: 0, y: 0, z: 0 }));
    const onClick = e => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best = -1, bd = 60;
      scr.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) onPick(best);
    };

    const inTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.95 - r.top) / (vh * 0.55));
    };

    let rot = -((getSel() || 0) * 2 * Math.PI / N), inV = still ? 1 : 0;
    const v3 = new THREE.Vector3();
    const draw = (t, snap) => {
      const sel = getSel() || 0;
      for (let i = 0; i < N; i++) {
        const target = i === sel ? 1 : 0;
        act[i] = snap ? target : act[i] + (target - act[i]) * 0.06;
      }
      // rotación más corta hasta dejar al agente activo al frente
      const goal = -(sel * 2 * Math.PI / N);
      let d = goal - rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      rot = snap ? goal : rot + d * 0.045;
      if (!still) inV += (inTarget() - inV) * 0.05;
      [cU, kU, lU, dU].forEach(U => { U.uTime.value = t; U.uIn.value = inV; });
      mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
      world.rotation.y = rot + mx + (still ? 0 : Math.sin(t * 0.18) * 0.04);
      world.rotation.x = my;
      world.updateMatrixWorld();
      renderer.render(scene, camera);

      centers.forEach((c, i) => {
        v3.copy(c).applyMatrix4(world.matrixWorld);
        const depth = v3.z;
        v3.project(camera);
        const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
        scr[i].x = x; scr[i].y = y;
        const L = labels[i];
        const on = i === sel;
        const op = (0.45 + clamp01((depth + RING) / (2 * RING)) * 0.55) * clamp01(inV * 1.4);
        const opv = (on ? 1 : op).toFixed(2);
        if (opv !== L.op) { L.op = opv; L.b.style.opacity = opv; }
        const dy = on ? 44 : 30;
        L.b.style.left = Math.round(Math.min(Math.max(x, 84), w - 84)) + 'px';
        L.b.style.top = Math.round(Math.min(y + dy, h - 40)) + 'px';
        L.b.style.zIndex = String(Math.round((depth + 3) * 10));
        if (L.on !== on) {
          L.on = on;
          L.txt.style.color = on ? '#fff' : 'rgba(255,255,255,.66)';
          L.num.style.color = on ? accent : 'rgba(255,255,255,.45)';
          L.b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      });
    };

    const onScreen = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return r.bottom > -160 && r.top < vh + 160;
    };
    const t0 = performance.now();
    let lastSel = getSel();
    const loop = now => {
      raf = requestAnimationFrame(loop);
      if (!onScreen()) return;
      draw((now - t0) / 1000, false);
    };

    if (still) {
      draw(4, true);
      // sin animación: redibuja sólo cuando cambia la selección
      const poll = () => {
        if (stopped) return;
        const s = getSel();
        if (s !== lastSel) { lastSel = s; draw(4, true); }
        raf = requestAnimationFrame(poll);
      };
      raf = requestAnimationFrame(poll);
    } else {
      raf = requestAnimationFrame(loop);
      host.addEventListener('mousemove', onMove, { passive: true });
      host.addEventListener('mouseleave', onLeave);
    }
    host.addEventListener('click', onClick);
    host.style.cursor = 'pointer';

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mouseleave', onLeave);
      host.removeEventListener('click', onClick);
      window.removeEventListener('resize', resize);
      [cGeo, kGeo, lGeo, dGeo, cMat, kMat, lMat, dMat].forEach(x => x.dispose());
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }).catch(() => {});

  return () => {
    stopped = true;
    if (ro) ro.disconnect();
    if (disposer) disposer();
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  };
}
