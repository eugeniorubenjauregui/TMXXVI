/* sol-graphics.js — gráficos de partículas (three.js) para los bloques de Soluciones.
   Un motor compartido y cinco formas, una por solución:
     strategy · órbitas de diagnóstico que convergen en un foco
     ai       · esfera neuronal con pulsos que la recorren
     commerce · canales que fluyen hacia un núcleo y salen como un solo flujo
     retail   · superficie que crece hacia la derecha con una cresta que avanza
     cloud    · capas de infraestructura con paquetes de datos subiendo entre ellas
   El cursor ilumina las partículas cercanas e inclina la pieza. Cada init devuelve dispose(). */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const TAU = Math.PI * 2;

const VERT = `
attribute float aB; attribute float aS; attribute float aT;
uniform vec2 uMouse; uniform float uHover, uPix, uIn, uAspect;
varying float vB, vM, vT;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vec2 d = (gl_Position.xy / gl_Position.w - uMouse) * vec2(uAspect, 1.0);
  float m = uHover * exp(-dot(d, d) * 7.0);
  vB = aB; vM = m; vT = aT;
  gl_PointSize = aS * uPix * (1.0 + m * 0.6) * (4.0 / -mv.z) * uIn;
}`;
const FRAG = `
uniform vec3 uA, uB;
varying float vB, vM, vT;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = exp(-d * d * 4.5);
  vec3 col = mix(uB, uA, vT);
  col = mix(col, vec3(1.0), clamp(vB * 0.45 + vM * 0.55 - 0.15, 0.0, 1.0));
  float o = a * clamp(vB + vM * 0.9, 0.0, 1.6);
  gl_FragColor = vec4(col * o, o);
}`;

let s = 7;
const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const set3 = (P, i, x, y, z) => { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; };

const KINDS = {
  strategy() {
    const R = [0.5, 0.82, 1.12], per = 150, drift = 180, n = R.length * per + drift + 1;
    const tilt = [[1.15, 0.2], [1.0, -0.5], [1.3, 0.9]];
    const d = Array.from({ length: drift }, () => [rnd() * TAU, rnd(), 0.08 + rnd() * 0.1, rnd() * 0.3]);
    return {
      n, cam: [0.25, 0, 4.1],
      build(S, T) {
        for (let i = 0; i < n; i++) { S[i] = i < R.length * per ? 7 : 5; T[i] = i < per ? 1 : 0; }
        S[n - 1] = 34; T[n - 1] = 1;
      },
      step(t, P, B) {
        let k = 0;
        R.forEach((r, ri) => {
          const [tx, tz] = tilt[ri], head = t * (0.5 + ri * 0.18) * (ri % 2 ? -1 : 1);
          const cx = Math.cos(tx), sx = Math.sin(tx), cz = Math.cos(tz), sz = Math.sin(tz);
          for (let i = 0; i < per; i++, k++) {
            const a = (i / per) * TAU;
            let x = Math.cos(a) * r, y = Math.sin(a) * r, z = 0;
            const y1 = y * cx - z * sx, z1 = y * sx + z * cx;
            set3(P, k, x * cz - y1 * sz, x * sz + y1 * cz, z1);
            const lag = (((ri % 2 ? a - head : head - a) % TAU) + TAU) % TAU;
            B[k] = 0.16 + 1.0 * Math.exp(-lag * 2.2);
          }
        });
        for (let i = 0; i < drift; i++, k++) {
          const [a0, off, sp, zz] = d[i], f = (t * sp + off) % 1, r = 1.55 * (1 - f);
          const a = a0 + f * 2.2;
          set3(P, k, Math.cos(a) * r, Math.sin(a) * r * 0.75, (zz - 0.15) * r);
          B[k] = Math.min(1, f * 1.1) * 0.75 * Math.min(1, (1 - f) * 8);
        }
        set3(P, k, 0, 0, 0); B[k] = 0.9 + Math.sin(t * 2.4) * 0.15;
      }
    };
  },

  ai() {
    const n = 1100, dirs = [], pulses = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
      dirs.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    const newPulse = t0 => { const u = rnd() * TAU, v = Math.acos(2 * rnd() - 1); return { p: [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)], t0 }; };
    for (let i = 0; i < 3; i++) pulses.push(newPulse(-i * 1.1));
    return {
      n, cam: [0.3, 0, 4.2],
      build(S, T) { for (let i = 0; i < n; i++) { S[i] = 6 + (i % 23 === 0 ? 9 : 0); T[i] = i % 5 === 0 ? 0 : 1; } },
      step(t, P, B) {
        pulses.forEach((p, i) => { if (t - p.t0 > 3.3) pulses[i] = newPulse(t); });
        const rot = t * 0.18, c = Math.cos(rot), sn = Math.sin(rot);
        for (let i = 0; i < n; i++) {
          const [x, y, z] = dirs[i];
          let b = 0.16 + (i % 23 === 0 ? 0.35 : 0), push = 0;
          for (const p of pulses) {
            const age = t - p.t0; if (age < 0) continue;
            const ang = Math.acos(Math.max(-1, Math.min(1, x * p.p[0] + y * p.p[1] + z * p.p[2])));
            const w = Math.exp(-Math.pow(ang - age * 1.1, 2) * 26) * Math.exp(-age * 0.7);
            b += w * 1.3; push += w;
          }
          const r = 0.95 * (1 + push * 0.07 + Math.sin(t * 0.9 + i) * 0.006);
          set3(P, i, (x * c + z * sn) * r, y * r, (-x * sn + z * c) * r);
          B[i] = b;
        }
      }
    };
  },

  commerce() {
    const ch = [-0.82, -0.42, 0, 0.42, 0.82], trail = 70, flow = 26, out = 70;
    const hub = [0.45, 0, 0], end = [1.75, 0, 0];
    const n = ch.length * (trail + flow + 1) + out + 1;
    const src = ch.map((y, i) => [-1.45, y, (i - 2) * 0.12]);
    const bez = (a, c, b, u) => { const v = 1 - u; return [0, 1, 2].map(k => v * v * a[k] + 2 * v * u * c[k] + u * u * b[k]); };
    const ctrl = src.map(p => [-0.35, p[1] * 0.85, p[2] * 2]);
    const offs = Array.from({ length: ch.length * flow }, () => rnd());
    return {
      n, cam: [0.15, 0, 4.1],
      build(S, T) {
        let k = 0;
        ch.forEach((_, ci) => {
          for (let i = 0; i < trail; i++, k++) { S[k] = 4; T[k] = 0; }
          for (let i = 0; i < flow; i++, k++) { S[k] = 7; T[k] = 1; }
          S[k] = 13; T[k] = 0; k++;
        });
        for (let i = 0; i < out; i++, k++) { S[k] = 7; T[k] = 1; }
        S[k] = 30; T[k] = 1;
      },
      step(t, P, B) {
        let k = 0;
        ch.forEach((_, ci) => {
          for (let i = 0; i < trail; i++, k++) { set3(P, k, ...bez(src[ci], ctrl[ci], hub, i / trail)); B[k] = 0.14; }
          for (let i = 0; i < flow; i++, k++) {
            const u = (t * (0.22 + ci * 0.02) + offs[ci * flow + i]) % 1;
            set3(P, k, ...bez(src[ci], ctrl[ci], hub, u));
            B[k] = 0.95 * Math.min(1, u * 6) * Math.min(1, (1 - u) * 10);
          }
          set3(P, k, ...src[ci]); B[k] = 0.55 + 0.25 * Math.sin(t * 1.6 + ci); k++;
        });
        for (let i = 0; i < out; i++, k++) {
          const u = (i / out + t * 0.32) % 1;
          set3(P, k, hub[0] + (end[0] - hub[0]) * u, Math.sin(u * 9 - t * 3) * 0.035 * u, Math.cos(u * 7 - t * 2.4) * 0.05 * u);
          B[k] = 0.95 * (1 - u * 0.85);
        }
        set3(P, k, ...hub); B[k] = 1.0 + Math.sin(t * 3) * 0.12;
      }
    };
  },

  retail() {
    const nx = 40, nz = 16, n = nx * nz;
    return {
      n, cam: [0.1, 1.35, 3.9], look: [0.1, -0.15, 0],
      build(S, T) { for (let i = 0; i < n; i++) { S[i] = 6.5; T[i] = 1; } },
      step(t, P, B) {
        const crest = ((t * 0.35) % 1) * 4.2 - 2.1;
        for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
          const i = iz * nx + ix, u = ix / (nx - 1), x = u * 3.4 - 1.7, z = (iz / (nz - 1)) * 1.6 - 0.8;
          const grow = Math.pow(u, 1.7) * 1.05;
          const wav = 0.05 * Math.sin(x * 4 - t * 1.4 + z * 3) + 0.03 * Math.sin(z * 6 + t);
          const c = Math.exp(-Math.pow(x - crest, 2) * 6);
          set3(P, i, x, -0.55 + grow + wav + c * 0.08, z);
          B[i] = 0.12 + grow * 0.55 + c * 0.75;
        }
      }
    };
  },

  cloud() {
    const gx = 15, gz = 9, layers = [-0.62, 0, 0.62], pk = 70;
    const n = layers.length * gx * gz + pk;
    const cell = () => [Math.floor(rnd() * gx), Math.floor(rnd() * gz)];
    const P0 = Array.from({ length: pk }, () => [...cell(), rnd(), 0.18 + rnd() * 0.16]);
    const gxz = (ix, iz) => [(ix / (gx - 1)) * 2.2 - 1.1, (iz / (gz - 1)) * 1.3 - 0.65];
    return {
      n, cam: [0.2, 1.05, 3.9], look: [0.2, 0, 0],
      build(S, T) {
        for (let i = 0; i < n; i++) { const L = Math.floor(i / (gx * gz)); S[i] = i < n - pk ? 5.5 : 9; T[i] = i < n - pk ? (L === 1 ? 1 : 0) : 1; }
      },
      step(t, P, B) {
        let k = 0;
        const rot = Math.sin(t * 0.15) * 0.25 + 0.35, c = Math.cos(rot), sn = Math.sin(rot);
        const R = (x, y, z) => [x * c + z * sn, y, -x * sn + z * c];
        layers.forEach((y, li) => {
          for (let iz = 0; iz < gz; iz++) for (let ix = 0; ix < gx; ix++, k++) {
            const [x, z] = gxz(ix, iz);
            set3(P, k, ...R(x, y, z));
            B[k] = 0.14 + 0.22 * Math.max(0, Math.sin(ix * 0.6 + iz * 0.4 - t * 1.4 + li * 1.8));
          }
        });
        for (let i = 0; i < pk; i++, k++) {
          const p = P0[i], f = (t * p[3] + p[2]) % 1;
          if (f < 0.01) { const [a, b] = cell(); p[0] = a; p[1] = b; }
          const [x, z] = gxz(p[0], p[1]);
          set3(P, k, ...R(x, -0.62 + f * 1.24, z));
          B[k] = 1.0 * Math.min(1, f * 8) * Math.min(1, (1 - f) * 8);
        }
      }
    };
  }
};

export function initSolGraphic(host, kind, opts = {}) {
  if (!host || !KINDS[kind]) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const target = host.parentElement || host;
  let stopped = false, raf = 0, ro = null, io = null, visible = false, disposer = null;

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    s = 7 + kind.length * 101;
    const K = KINDS[kind]();
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix); renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);

    const P = new Float32Array(K.n * 3), B = new Float32Array(K.n), S = new Float32Array(K.n), T = new Float32Array(K.n);
    K.build(S, T);
    const geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(P, 3), ba = new THREE.BufferAttribute(B, 1);
    pa.setUsage(THREE.DynamicDrawUsage); ba.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pa); geo.setAttribute('aB', ba);
    geo.setAttribute('aS', new THREE.BufferAttribute(S, 1)); geo.setAttribute('aT', new THREE.BufferAttribute(T, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    const U = {
      uMouse: { value: new THREE.Vector2(9, 9) }, uHover: { value: 0 }, uPix: { value: pix }, uIn: { value: still ? 1 : 0 }, uAspect: { value: 1 },
      uA: { value: new THREE.Color(opts.accent || '#80E593') }, uB: { value: new THREE.Color(opts.accent2 || '#52C7CF') }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const scene = new THREE.Scene(), group = new THREE.Group();
    group.add(new THREE.Points(geo, mat)); scene.add(group);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(...K.cam); camera.lookAt(...(K.look || [K.cam[0], 0, 0]));

    const goal = new THREE.Vector2(9, 9), cur = new THREE.Vector2(9, 9);
    let hoverGoal = 0, tx = 0, ty = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (hoverGoal === 0) cur.set(x, y);
      goal.set(x, y); hoverGoal = 1;
      tx = Math.max(-1, Math.min(1, x)); ty = Math.max(-1, Math.min(1, y));
      if (still) frame();
    };
    const onLeave = () => { hoverGoal = 0; tx = 0; ty = 0; };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false); camera.aspect = w / h;
      camera.fov = w / h < 1.3 ? 44 : 35; camera.updateProjectionMatrix();
      U.uAspect.value = w / h;
      if (still) frame();
    };
    ro = new ResizeObserver(resize);

    let t = 0, last = performance.now();
    function frame() {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!still) { t += dt; U.uIn.value = Math.min(1, U.uIn.value + dt / 0.9); }
      K.step(still ? 4 : t, P, B);
      pa.needsUpdate = true; ba.needsUpdate = true;
      cur.lerp(goal, 0.1); U.uMouse.value.copy(cur);
      U.uHover.value += (hoverGoal - U.uHover.value) * 0.06;
      group.rotation.y += (tx * 0.3 - group.rotation.y) * 0.05;
      group.rotation.x += (-ty * 0.18 - group.rotation.x) * 0.05;
      renderer.render(scene, camera);
    }
    const loop = () => { raf = 0; if (stopped || !visible) return; frame(); raf = requestAnimationFrame(loop); };
    io = new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible && !raf && !still) { last = performance.now(); loop(); }
    }, { threshold: 0.05 });
    io.observe(host); ro.observe(host); resize();
    if (still) frame();

    disposer = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      geo.dispose(); mat.dispose(); renderer.dispose(); canvas.remove();
    };
  }).catch(err => console.error('sol-graphics:', err));

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    ro && ro.disconnect(); io && io.disconnect();
    disposer && disposer();
  };
}

export const initStrategyGraphic = (el, o) => initSolGraphic(el, 'strategy', o);
export const initAiGraphic = (el, o) => initSolGraphic(el, 'ai', o);
export const initCommerceGraphic = (el, o) => initSolGraphic(el, 'commerce', o);
export const initRetailGraphic = (el, o) => initSolGraphic(el, 'retail', o);
export const initCloudGraphic = (el, o) => initSolGraphic(el, 'cloud', o);
