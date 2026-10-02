/* ai-steps.js — Entiende → Recomienda → Ejecuta como un solo enjambre de partículas (three.js).
   Tres zonas alineadas con las tres columnas:
     ENTIENDE   · datos dispersos; un barrido los lee y se ordenan en una esfera de contexto
     RECOMIENDA · la esfera se abre en tres opciones; una regla elige una y las demás se apagan
     EJECUTA    · el flujo baja por la opción elegida hasta tres sistemas, que se encienden en orden
   El ciclo avanza solo; al pasar el cursor por una columna se queda en esa fase.
   initAiSteps(host, { accent, accent2, motion, pointerTarget, onPhase }) -> dispose() */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const N = 960, PHASE = 3.6;

const VERT = `
attribute float aB; attribute float aT; attribute float aS;
uniform vec2 uMouse; uniform float uHover, uPix, uAspect;
varying float vB, vT, vM;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vec2 d = (gl_Position.xy / gl_Position.w - uMouse) * vec2(uAspect, 1.0);
  vM = uHover * exp(-dot(d, d) * 18.0);
  vB = aB; vT = aT;
  gl_PointSize = aS * uPix * (1.0 + vM * 0.5) * (7.0 / -mv.z);
}`;
const FRAG = `
uniform vec3 uA, uB; uniform float uLight;
varying float vB, vT, vM;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = exp(-d * d * 4.2);
  vec3 col = mix(uB, uA, vT);
  col = mix(col, mix(vec3(1.0), vec3(0.08), uLight), clamp(vB - 0.8 + vM * 0.5, 0.0, 0.6));
  float o = a * clamp(vB + vM * 0.8, 0.0, uLight > 0.5 ? 1.0 : 1.6);
  gl_FragColor = vec4(col * o, o);
}`;

export function initAiSteps(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const target = opts.pointerTarget || host;
  let stopped = false, raf = 0, ro = null, io = null, visible = false, disposer = null;

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix); renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);

    const r = Array.from({ length: N }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
    const fib = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
      return [Math.cos(a) * rr, y, Math.sin(a) * rr];
    });
    const P = new Float32Array(N * 3), B = new Float32Array(N), T = new Float32Array(N), S = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      S[i] = 3.2 + r[i][3] * 2.2;
      P[i * 3] = -6 + r[i][0] * 2; P[i * 3 + 1] = (r[i][1] - 0.5) * 2; P[i * 3 + 2] = 0;
    }
    const geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(P, 3), ba = new THREE.BufferAttribute(B, 1), ta = new THREE.BufferAttribute(T, 1);
    [pa, ba, ta].forEach(x => x.setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('position', pa); geo.setAttribute('aB', ba); geo.setAttribute('aT', ta);
    geo.setAttribute('aS', new THREE.BufferAttribute(S, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
    const U = {
      uMouse: { value: new THREE.Vector2(9, 9) }, uHover: { value: 0 }, uPix: { value: pix }, uAspect: { value: 1 },
      uLight: { value: opts.light ? 1 : 0 }, uA: { value: new THREE.Color(opts.accent || '#80E593') }, uB: { value: new THREE.Color(opts.accent2 || '#52C7CF') }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: opts.light ? THREE.NormalBlending : THREE.AdditiveBlending });
    if (opts.light) mat.premultipliedAlpha = true;
    const scene = new THREE.Scene();
    scene.add(new THREE.Points(geo, mat));
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0, 7);

    let halfW = 4, H = 1.875, zx = [-2.6, 0, 2.6], R = 1;
    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      U.uAspect.value = w / h;
      H = 7 * Math.tan(15 * Math.PI / 180); halfW = H * w / h;
      zx = [-halfW * 2 / 3, 0, halfW * 2 / 3];
      R = Math.min(H * 0.72, halfW * 0.27);
      if (still) frame();
    };
    ro = new ResizeObserver(resize);

    let phase = still ? 1 : 0, tl = still ? 0.7 : 0, lock = -1, choice = 1, t = 0, last = performance.now();
    const emit = () => opts.onPhase && opts.onPhase(still ? -1 : phase);
    const setPhase = p => { if (p === phase) return; phase = p; tl = 0; if (p === 1) choice = Math.floor(Math.random() * 3); emit(); };

    const tgt = [0, 0, 0];
    function targetOf(i) {
      const [r1, r2, r3, r4] = r[i];
      let b = 0.3;
      if (phase === 0) {
        if (tl < 0.42) {
          tgt[0] = zx[0] + (r1 - 0.5) * 2.3 * R; tgt[1] = (r2 - 0.5) * 1.7 * R; tgt[2] = (r3 - 0.5) * R;
          const scan = zx[0] - 1.2 * R + (tl / 0.42) * 2.4 * R;
          b = 0.22 + Math.exp(-Math.pow((tgt[0] - scan) / (0.1 * R), 2)) * 1.1;
        } else {
          const rot = t * 0.5, [x, y, z] = fib[i], c = Math.cos(rot), s = Math.sin(rot);
          const rad = 0.62 * R * (1 + Math.sin(t * 2 + i) * 0.01);
          tgt[0] = zx[0] + (x * c + z * s) * rad; tgt[1] = y * rad; tgt[2] = (-x * s + z * c) * rad;
          b = 0.35 + Math.max(0, z * c - x * s) * 0.5;
        }
      } else if (phase === 1) {
        const k = i % 3, u = r1, v = 1 - u;
        const x0 = zx[1] - 1.15 * R, x1 = zx[1] + 1.15 * R, y1 = (k - 1) * 0.78 * R;
        tgt[0] = v * v * x0 + 2 * v * u * zx[1] + u * u * x1;
        tgt[1] = u * u * y1 + (r2 - 0.5) * 0.05 * R;
        tgt[2] = (r3 - 0.5) * 0.12 * R;
        const decided = tl > 0.38;
        const pulse = Math.exp(-Math.pow(u - ((t * 0.9 + r4 * 0.2) % 1), 2) * 60);
        b = decided ? (k === choice ? 0.75 + pulse * 0.6 : 0.08) : 0.4 + pulse * 0.3;
        if (u > 0.93) b *= 1.6;
      } else {
        const k = i % 3, by = (k - 1) * 0.8 * R;
        if (r4 < 0.24) {
          const f = (t * 0.7 + r1) % 1, sx = zx[1] + 1.15 * R, sy = (choice - 1) * 0.78 * R;
          const ex = zx[2] - 0.62 * R;
          tgt[0] = sx + (ex - sx) * f; tgt[1] = sy + (by - sy) * f * f; tgt[2] = 0;
          b = 0.7 * Math.min(1, f * 5) * Math.min(1, (1 - f) * 5);
        } else {
          const q = v => Math.round(v * 6) / 6;
          tgt[0] = zx[2] + (q(r1) - 0.5) * 1.1 * R; tgt[1] = by + (q(r2) - 0.5) * 0.42 * R; tgt[2] = (q(r3) - 0.5) * 0.3 * R;
          const on = tl > 0.12 + k * 0.22;
          b = on ? 0.8 + Math.sin(t * 3 + k) * 0.1 : 0.14;
        }
      }
      return b;
    }

    const goal = new THREE.Vector2(9, 9), cur = new THREE.Vector2(9, 9);
    let hoverGoal = 0;
    const onMove = e => {
      const rc = host.getBoundingClientRect();
      const x = ((e.clientX - rc.left) / rc.width) * 2 - 1, y = -((e.clientY - rc.top) / rc.height) * 2 + 1;
      if (hoverGoal === 0) cur.set(x, y);
      goal.set(x, y); hoverGoal = y > -1.2 && y < 1.2 ? 1 : 0;
      if (!still) { lock = Math.max(0, Math.min(2, Math.floor((x + 1) / 2 * 3))); setPhase(lock); }
      if (still) frame();
    };
    const onLeave = () => { hoverGoal = 0; lock = -1; };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);

    let first = true;
    function frame() {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!still) {
        t += dt; tl += dt / PHASE;
        if (tl >= 1) { if (lock >= 0) { tl = lock === 0 ? 0 : 0.5; } else setPhase((phase + 1) % 3); }
      } else t = 2;
      const tone = phase / 2;
      for (let i = 0; i < N; i++) {
        const b = targetOf(i);
        const k = first || still ? 1 : 1 - Math.exp(-dt * (2.2 + r[i][3] * 3.2));
        P[i * 3] += (tgt[0] - P[i * 3]) * k; P[i * 3 + 1] += (tgt[1] - P[i * 3 + 1]) * k; P[i * 3 + 2] += (tgt[2] - P[i * 3 + 2]) * k;
        B[i] += (b - B[i]) * Math.min(1, k * 1.6);
        T[i] += (tone - T[i]) * k;
      }
      first = false;
      pa.needsUpdate = ba.needsUpdate = ta.needsUpdate = true;
      cur.lerp(goal, 0.1); U.uMouse.value.copy(cur);
      U.uHover.value += (hoverGoal - U.uHover.value) * 0.06;
      renderer.render(scene, camera);
    }
    const loop = () => { raf = 0; if (stopped || !visible) return; frame(); raf = requestAnimationFrame(loop); };
    io = new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible && !raf && !still) { last = performance.now(); loop(); }
    }, { threshold: 0.2 });
    io.observe(host); ro.observe(host); resize(); emit();
    if (still) frame();

    disposer = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      geo.dispose(); mat.dispose(); renderer.dispose(); canvas.remove();
    };
  }).catch(err => console.error('ai-steps:', err));

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    ro && ro.disconnect(); io && io.disconnect();
    disposer && disposer();
  };
}
