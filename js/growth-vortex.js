/* growth-vortex.js — el funnel como vórtice de sesiones (three.js, ESM por CDN).
   Cada partícula es una sesión: entra arriba, gira hacia abajo y el flujo se
   comprime al centro. La caída entre etapas no se insinúa, se ve: cuando una
   sesión no supera la retención de su etapa se sale del vórtice y se apaga.
   Toda la simulación vive en el vertex shader (posición derivada del tiempo),
   así que no hay buffers que actualizar por frame.

   Retención por etapa = los índices del gráfico de anillos: 100/62/34/21/14.
   Las palancas ensanchan el tramo donde actúan y dejan pasar más sesiones. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const STAGES = [
  { l: 'VISITAS',  v: 100, u: 0.06 },
  { l: 'PRODUCTO', v: 62,  u: 0.28 },
  { l: 'CARRITO',  v: 34,  u: 0.48 },
  { l: 'CHECKOUT', v: 21,  u: 0.68 },
  { l: 'COMPRA',   v: 14,  u: 0.9 }
];

// efecto por etapa de cada palanca (mismos valores que el gráfico de anillos)
const LEVERS = {
  SEO:  [1.18, 1.10, 1.04, 1.02, 1.02],
  GEO:  [1.14, 1.09, 1.03, 1.02, 1.02],
  AEO:  [1.12, 1.10, 1.05, 1.02, 1.02],
  CRO:  [1.00, 1.12, 1.22, 1.28, 1.34],
  PAID: [1.32, 1.12, 1.04, 1.02, 1.00]
};

const RET = [1, 0.62, 0.34, 0.21, 0.14];      // retención acumulada por etapa
const RAD = [0.78, 0.58, 0.41, 0.26, 0.12];   // radio del vórtice por etapa
const TOP = 0.92, BOT = -0.92;
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

/* retención en u ∈ [0,1], lineal por tramo entre etapas */
function ret(u) {
  let v = RET[0];
  for (let i = 1; i < 5; i++) v += (RET[i] - RET[i - 1]) * clamp01((u - (i - 1) * 0.2) / 0.2);
  return v;
}

const VERT = `
attribute vec4 aP;              // x: fase, y: ángulo inicial, z: umbral de retención, w: velocidad
uniform float uTime, uFill, uPull, uSwirl, uSize, uLever;
uniform vec4 uEffA;             // efecto de la palanca en etapas 1..4
uniform float uEffE;            // etapa 5
uniform vec2 uMouse;
varying float vA, vU;

float ramp(float u, float i){ return clamp((u - i * 0.2) / 0.2, 0.0, 1.0); }

void main(){
  float u = fract(aP.x + uTime * 0.155 * aP.w);
  vU = u;

  float c1 = ramp(u, 0.0), c2 = ramp(u, 1.0), c3 = ramp(u, 2.0), c4 = ramp(u, 3.0);

  // retención y radio: lineales por tramo entre los índices de etapa
  float r0 = 1.0 + (0.62 - 1.0) * c1 + (0.34 - 0.62) * c2 + (0.21 - 0.34) * c3 + (0.14 - 0.21) * c4;
  float rad = 0.78 + (0.58 - 0.78) * c1 + (0.41 - 0.58) * c2 + (0.26 - 0.41) * c3 + (0.12 - 0.26) * c4;
  float eff = 1.0 + (uEffA.x - 1.0) * (1.0 - c1) + (uEffA.y - 1.0) * (c1 - c2)
            + (uEffA.z - 1.0) * (c2 - c3) + (uEffA.w - 1.0) * (c3 - c4) + (uEffE - 1.0) * c4;
  eff = mix(1.0, eff, uLever);

  float retE = min(1.0, r0 * eff);
  float over = max(0.0, aP.z - retE);          // la sesión no superó su etapa

  float th = aP.y + u * uSwirl + uTime * 0.22;
  float R = rad * mix(1.0, 1.0 + (eff - 1.0) * 1.4, uLever) + over * 1.55;
  float y = TOP_Y + (BOT_Y - TOP_Y) * u - over * 0.16;

  vec3 p = vec3(cos(th) * R, y, sin(th) * R);

  // el cursor desvía el flujo a su altura
  float dy = 1.0 - smoothstep(0.0, 0.95, abs(p.y - uMouse.y));
  p.x += (uMouse.x * 1.35 - p.x) * 0.26 * dy * uPull;

  float band = 0.5 + 0.5 * sin(th * 3.0 - u * 9.0);
  float a = (0.3 + 0.7 * (1.0 - u)) * exp(-over * 5.2) * (0.34 + 0.9 * band);
  a *= 1.0 - smoothstep(uFill - 0.04, uFill + 0.03, u);     // el vórtice se llena al hacer scroll
  a *= 0.55 + 0.45 * uFill;
  vA = a;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + 0.55 * (1.0 - u)) * (4.6 / max(0.001, -mv.z));
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2;
varying float vA, vU;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.24, 0.5, length(d));
  if (m <= 0.0 || vA <= 0.003) discard;
  gl_FragColor = vec4(mix(uColor2, uColor, clamp(vU * 1.5, 0.0, 1.0)), vA * m);
}`;

function goContact(text, optIndex) {
  const sec = document.querySelector('#tm-contacto');
  const box = document.querySelectorAll('#tm-contacto [data-opt] input')[optIndex];
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  const ta = document.querySelector('#tm-contacto #q7');
  if (ta && !ta.value.trim()) ta.value = text;
  if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 30, behavior: 'smooth' });
}

export function initGrowthVortex(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const narrow = Math.min(host.clientWidth || 560, window.innerWidth) < 640;
  const simple = still || narrow;

  let stopped = false, raf = 0, ro = null, disposer = null;

  /* ---------- capa HTML: etapas y contador ---------- */
  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  const marks = STAGES.map(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Etapa ' + s.l + ', índice típico ' + s.v + '. Ir al formulario de contacto');
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:baseline;gap:9px;' +
      'padding:4px 6px;margin:-11px 0 0 0;background:none;border:0;cursor:pointer;pointer-events:auto;' +
      'font:inherit;white-space:nowrap;opacity:0;transition:opacity .4s';
    const l = document.createElement('span');
    l.textContent = s.l;
    l.style.cssText = 'font-family:' + MONO + ';font-size:10px;letter-spacing:.16em;color:rgba(255,255,255,.72);transition:color .3s';
    const v = document.createElement('span');
    v.textContent = s.v;
    v.style.cssText = 'font-family:' + MONO + ';font-size:12.5px;color:' + accent + ';transition:transform .3s';
    b.append(l, v);
    b.addEventListener('click', () => goContact('Queremos trabajar la etapa de ' + s.l.toLowerCase() + '.', 3));
    const on = () => { l.style.color = '#fff'; v.style.transform = 'scale(1.18)'; };
    const off = () => { l.style.color = 'rgba(255,255,255,.72)'; v.style.transform = 'none'; };
    b.addEventListener('mouseenter', on); b.addEventListener('focus', on);
    b.addEventListener('mouseleave', off); b.addEventListener('blur', off);
    layer.appendChild(b);
    return { s, b, v };
  });

  const meter = document.createElement('div');
  meter.style.cssText = 'position:absolute;left:0;bottom:0;margin:0;pointer-events:none';
  meter.innerHTML =
    '<p style="margin:0;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:rgba(255,255,255,.62)">SESIONES QUE LLEGAN A COMPRA</p>' +
    '<p style="margin:5px 0 0;display:flex;align-items:baseline;gap:10px">' +
      '<span data-n style="font-family:' + MONO + ';font-size:21px;color:#fff">0</span>' +
      '<span data-c style="font-family:' + MONO + ';font-size:10.5px;letter-spacing:.12em;color:' + accent + '">14,0%</span>' +
    '</p>';
  layer.appendChild(meter);
  const nEl = meter.querySelector('[data-n]'), cEl = meter.querySelector('[data-c]');

  /* ---------- palancas: viven en la página, se conectan acá ---------- */
  const chips = Array.from(document.querySelectorAll('[data-lever]'));
  let sticky = null, leverName = null;

  const paint = () => {
    chips.forEach(c => {
      const on = c.dataset.lever === leverName;
      c.style.background = on ? accent : 'transparent';
      c.style.color = on ? '#141414' : 'rgba(255,255,255,.82)';
      c.style.borderColor = on ? accent : 'rgba(255,255,255,.22)';
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };
  const setLever = name => { leverName = name; paint(); };
  chips.forEach(c => {
    const n = c.dataset.lever;
    c.addEventListener('mouseenter', () => { if (!sticky) setLever(n); });
    c.addEventListener('focus', () => { if (!sticky) setLever(n); });
    c.addEventListener('mouseleave', () => { if (!sticky) setLever(null); });
    c.addEventListener('blur', () => { if (!sticky) setLever(null); });
    c.addEventListener('click', () => { sticky = sticky === n ? null : n; setLever(sticky); });
  });
  paint();

  /* ---------- three.js ---------- */
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
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.5, 4.55);
    camera.lookAt(0, -0.08, 0);

    const N = narrow ? 7000 : 19000;
    const aP = new Float32Array(N * 4);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      aP[i * 4] = Math.random();                      // fase
      aP[i * 4 + 1] = Math.random() * Math.PI * 2;    // ángulo de entrada
      aP[i * 4 + 2] = Math.random();                  // umbral de retención
      aP[i * 4 + 3] = 0.85 + Math.random() * 0.35;    // velocidad
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(aP, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

    const c1 = new THREE.Color(accent);
    const c2 = c1.clone().lerp(new THREE.Color('#ffffff'), 0.45);
    const U = {
      uTime: { value: 0 }, uFill: { value: still ? 1 : 0 }, uPull: { value: 0 },
      uSwirl: { value: 5.2 }, uSize: { value: Math.max(2.1, pix * 1.55) }, uLever: { value: 0 },
      uEffA: { value: new THREE.Vector4(1, 1, 1, 1) }, uEffE: { value: 1 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColor: { value: c1 }, uColor2: { value: c2 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT.replace(/TOP_Y/g, TOP.toFixed(3)).replace(/BOT_Y/g, BOT.toFixed(3)),
      fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);

    let w = 0, h = 0;
    const resize = () => {
      w = host.clientWidth || 560;
      h = host.clientHeight || Math.round(w * 470 / 560);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    /* cursor → coordenadas del vórtice (plano z = 0) */
    let overHost = false, tmx = 0, tmy = 0, pullT = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      const ny = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
      const v = new THREE.Vector3(nx, ny, 0.5).unproject(camera).sub(camera.position);
      const t = -camera.position.z / v.z;
      tmx = camera.position.x + v.x * t;
      tmy = camera.position.y + v.y * t;
      overHost = true;
    };
    const onLeave = () => { overHost = false; };

    const fillTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.98 - r.top) / (vh * 0.62));
    };

    const v3 = new THREE.Vector3();
    const place = () => {
      marks.forEach(m => {
        const u = m.s.u;
        let rad = RAD[0];
        for (let i = 1; i < 5; i++) rad += (RAD[i] - RAD[i - 1]) * clamp01((u - (i - 1) * 0.2) / 0.2);
        const lev = U.uLever.value;
        rad *= 1 + (curEff(u) - 1) * 1.4 * lev;
        v3.set(rad + 0.1, TOP + (BOT - TOP) * u, 0).project(camera);
        const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
        m.b.style.left = Math.round(Math.min(x, w - 118)) + 'px';
        m.b.style.top = Math.round(y) + 'px';
        const vis = clamp01((U.uFill.value - u + 0.06) / 0.12);
        if (Math.abs(vis - m.vis) > 0.01) { m.vis = vis; m.b.style.opacity = vis.toFixed(2); }
        const live = vis > 0.5;
        if (live !== m.live) {
          m.live = live;
          m.b.style.pointerEvents = live ? 'auto' : 'none';
          m.b.tabIndex = live ? 0 : -1;
        }
      });
    };
    marks.forEach(m => { m.vis = 0; m.live = false; m.b.style.pointerEvents = 'none'; m.b.tabIndex = -1; });

    const eff = [1, 1, 1, 1, 1];
    const curEff = u => {
      let v = eff[0];
      for (let i = 1; i < 5; i++) v += (eff[i] - eff[i - 1]) * clamp01((u - (i - 1) * 0.2) / 0.2);
      return v;
    };

    let count = 0, lastT = 0;
    const fmt = n => Math.floor(n).toLocaleString('es-CO');

    const draw = (t, dt) => {
      U.uTime.value = t;
      if (!still) U.uFill.value += (fillTarget() - U.uFill.value) * 0.07;
      if (!simple) {
        pullT += ((overHost ? 1 : 0) - pullT) * 0.08;
        U.uPull.value = pullT;
        U.uMouse.value.x += (tmx - U.uMouse.value.x) * 0.12;
        U.uMouse.value.y += (tmy - U.uMouse.value.y) * 0.12;
      }
      const target = leverName ? LEVERS[leverName] : null;
      for (let i = 0; i < 5; i++) eff[i] += ((target ? target[i] : 1) - eff[i]) * 0.1;
      U.uLever.value += ((leverName ? 1 : 0) - U.uLever.value) * 0.1;
      U.uEffA.value.set(eff[0], eff[1], eff[2], eff[3]);
      U.uEffE.value = eff[4];

      // conversión efectiva = índice de compra × efecto de la palanca en esa etapa
      const conv = Math.min(1, RET[4] * (1 + (eff[4] - 1) * U.uLever.value));
      count += dt * N * 0.155 * 1.02 * conv;         // sesiones que completan el recorrido
      nEl.textContent = fmt(count);
      cEl.textContent = (conv * 100).toFixed(1).replace('.', ',') + '%';

      renderer.render(scene, camera);
      place();
    };

    const onScreen = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return r.bottom > -180 && r.top < vh + 180;
    };
    const t0 = performance.now();
    const loop = now => {
      raf = requestAnimationFrame(loop);
      if (!onScreen()) { lastT = (now - t0) / 1000; return; }
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, t - lastT);
      lastT = t;
      draw(t, dt);
    };

    if (still) {
      draw(4.2, 0);
      count = 1840; nEl.textContent = fmt(count);
      marks.forEach(m => { m.b.style.transition = 'none'; });
      draw(4.2, 0);
    } else {
      raf = requestAnimationFrame(loop);
      if (!simple) {
        host.addEventListener('mousemove', onMove, { passive: true });
        host.addEventListener('mouseleave', onLeave);
      }
    }

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize);
      geo.dispose(); mat.dispose(); renderer.dispose();
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
