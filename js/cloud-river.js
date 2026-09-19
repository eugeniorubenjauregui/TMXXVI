/* cloud-river.js — el río de datos (three.js, ESM por CDN).
   Cada partícula es un registro que baja por el cauce desde la ingesta hasta el
   consumo. El centro corre más rápido que las orillas, como en un río real, y en
   cada compuerta —las cuatro capas de la arquitectura— el cauce se angosta y el
   dato destella: ahí se captura, se guarda, se transforma y se consume.
   El proveedor seleccionado re-etiqueta las compuertas con sus servicios.
   Al simular caudal entra más dato, el río se ensancha y acelera sin desbordarse. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const PROVIDERS = ['AWS', 'Azure', 'GCP'];

const GATES = [
  { l: 'INGESTA', t: 0.1,
    role: 'Captura de eventos y cargas batch desde la operación.',
    svc: { AWS: 'Kinesis · DMS', Azure: 'Event Hubs · Data Factory', GCP: 'Pub/Sub · Dataflow' } },
  { l: 'ALMACENAMIENTO', t: 0.38,
    role: 'Data lake sobre almacenamiento de objetos, con histórico y gobierno.',
    svc: { AWS: 'S3 · Lake Formation', Azure: 'ADLS Gen2 · Purview', GCP: 'Cloud Storage · Dataplex' } },
  { l: 'TRANSFORMACIÓN', t: 0.66,
    role: 'Modelado, calidad y orquestación: el dato queda listo para usarse.',
    svc: { AWS: 'Glue · EMR', Azure: 'Databricks · Synapse', GCP: 'Dataproc · Dataflow' } },
  { l: 'CONSUMO', t: 0.92,
    role: 'Analítica, tableros y modelos sobre el dato ya modelado.',
    svc: { AWS: 'Redshift · QuickSight', Azure: 'Synapse · Power BI', GCP: 'BigQuery · Looker' } }
];

const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

/* cauce compartido entre JS (orillas, rótulos) y GLSL (partículas) */
const cx = t => -1.42 + 2.84 * t;
const cz = t => Math.sin(t * 6.2832 * 0.85 + 0.4) * 0.44;
const cy = t => 0.13 - 0.27 * t;
const gateNarrow = t => GATES.reduce((s, g) => s + Math.max(0, 1 - Math.abs(t - g.t) / 0.055), 0);
const halfWidth = t => 0.3 * (1 - 0.5 * Math.min(1, gateNarrow(t)));
const normalAt = t => {
  const dx = 2.84, dz = Math.cos(t * 6.2832 * 0.85 + 0.4) * 0.85 * 6.2832 * 0.44;
  const n = Math.hypot(dx, dz) || 1;
  return [-dz / n, dx / n];
};

const VERT = `
attribute vec4 aP;              // x: fase, y: posición a lo ancho (-1..1), z: profundidad, w: velocidad
attribute vec3 aQ;              // x: reserva de caudal, y: semilla, z: jitter
uniform float uClock, uTime, uFill, uLoad, uGate, uPull, uSize, uWide;
uniform vec2 uMouse;
varying float vA, vT;

float narrow(float t){
  float s = 0.0;
  s += max(0.0, 1.0 - abs(t - 0.10) / 0.055);
  s += max(0.0, 1.0 - abs(t - 0.38) / 0.055);
  s += max(0.0, 1.0 - abs(t - 0.66) / 0.055);
  s += max(0.0, 1.0 - abs(t - 0.92) / 0.055);
  return min(1.0, s);
}

void main(){
  float lane = aP.y;                                   // -1 orilla, 0 centro
  float mid = 1.0 - abs(lane);                         // el centro corre más rápido
  float t = fract(aP.x + uClock * aP.w * (0.55 + 0.75 * mid));
  vT = t;

  float nar = narrow(t);
  float hw = 0.3 * (1.0 - 0.5 * nar) * uWide;

  // turbulencia: el cauce no es una cinta rígida
  float turb = sin(t * 21.0 + uTime * 1.7 + aQ.y * 6.28) * 0.07
             + sin(t * 8.3 - uTime * 1.1 + aQ.z * 6.28) * 0.05;

  vec3 c = vec3(-1.42 + 2.84 * t, 0.13 - 0.27 * t, sin(t * 6.2832 * 0.85 + 0.4) * 0.44);
  float dx = 2.84;
  float dz = cos(t * 6.2832 * 0.85 + 0.4) * 0.85 * 6.2832 * 0.44;
  float nl = max(0.001, sqrt(dx * dx + dz * dz));
  vec2 nrm = vec2(-dz / nl, dx / nl);

  float off = (lane + turb) * hw;
  vec3 p = c + vec3(nrm.x * off, aP.z * 0.075 + turb * 0.03, nrm.y * off);

  // el río se llena desde el nacimiento al bajar la página
  float show = 1.0 - smoothstep(uFill, uFill + 0.06, t);

  float a = (0.3 + 0.34 * mid + 0.4 * nar) * show;
  a *= step(aQ.x, 0.55 + 0.45 * uLoad);                // registros en reserva: entran con el caudal

  // compuerta en foco
  a *= (uGate < -0.5) ? 1.0 : mix(0.15, 1.0, smoothstep(0.1, 0.02, abs(t - uGate)));

  float dm = length(p.xy - uMouse);
  float wm = smoothstep(0.42, 0.0, dm) * uPull;
  p.xy += (uMouse - p.xy) * 0.16 * wm;
  a += wm * 0.3 + nar * uLoad * 0.1;

  vA = min(1.0, a * (0.55 + 0.45 * uFill));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + nar * 0.4) * (3.1 / max(0.001, -mv.z));
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2;
varying float vA, vT;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.26, 0.5, length(d));
  if (m <= 0.0 || vA <= 0.004) discard;
  gl_FragColor = vec4(mix(uColor, uColor2, clamp(vT * 0.55, 0.0, 1.0)), vA * m);
}`;

function goContact(text) {
  const sec = document.querySelector('#tm-contacto');
  const box = document.querySelectorAll('#tm-contacto [data-opt] input')[4];
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  const ta = document.querySelector('#tm-contacto #q7');
  if (ta && !ta.value.trim()) ta.value = text;
  if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 30, behavior: 'smooth' });
}

export function initCloudRiver(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const narrowView = Math.min(host.clientWidth || 560, window.innerWidth) < 640;
  const simple = still || narrowView;

  let stopped = false, raf = 0, ro = null, disposer = null;

  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  let provider = 'AWS';

  const marks = GATES.map(G => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', G.l + '. ' + G.role + ' Ir al formulario de contacto');
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;padding:5px 7px;' +
      'background:none;border:0;cursor:pointer;pointer-events:none;font:inherit;white-space:nowrap;opacity:0;' +
      'transition:opacity .4s';
    b.tabIndex = -1;
    const dot = document.createElement('i');
    dot.style.cssText = 'flex:none;display:block;width:6px;height:6px;border-radius:50%;background:' + accent +
      ';transition:transform .3s,box-shadow .3s';
    const t = document.createElement('span');
    t.textContent = G.l;
    t.style.cssText = 'font-family:' + MONO + ';font-size:10px;letter-spacing:.16em;color:rgba(255,255,255,.75);transition:color .3s';
    b.append(dot, t);
    b.addEventListener('click', () => goContact('Queremos revisar la capa de ' + G.l.toLowerCase() + ' de nuestra arquitectura de datos.'));
    layer.appendChild(b);
    return { G, b, dot, t, vis: 0, live: false };
  });

  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:0;top:0;width:min(250px,76%);padding:13px 15px 14px;' +
    'background:rgba(16,17,17,.94);border:1px solid rgba(255,255,255,.14);opacity:0;pointer-events:none;' +
    'transition:opacity .25s;z-index:3';
  card.innerHTML =
    '<p data-k style="margin:0 0 7px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:' + accent + '"></p>' +
    '<p data-r style="margin:0 0 10px;font-size:13.5px;line-height:1.45;color:#fff;text-wrap:pretty"></p>' +
    '<p data-s style="margin:0;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);font-family:' + MONO + ';font-size:10.5px;letter-spacing:.06em;color:rgba(255,255,255,.72)"></p>';
  layer.appendChild(card);
  const cardK = card.querySelector('[data-k]'), cardR = card.querySelector('[data-r]'), cardS = card.querySelector('[data-s]');

  const meter = document.createElement('div');
  meter.style.cssText = 'position:absolute;left:0;bottom:0;pointer-events:none';
  meter.innerHTML =
    '<p style="margin:0;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:rgba(255,255,255,.62)">REGISTROS PROCESADOS</p>' +
    '<p style="margin:5px 0 0;display:flex;align-items:baseline;gap:10px">' +
      '<span data-n style="font-family:' + MONO + ';font-size:21px;color:#fff">0</span>' +
      '<span data-s style="font-family:' + MONO + ';font-size:10.5px;letter-spacing:.12em;color:' + accent + '">CAUDAL NORMAL</span>' +
    '</p>';
  layer.appendChild(meter);
  const nEl = meter.querySelector('[data-n]'), sEl = meter.querySelector('[data-s]');

  let hover = null;
  marks.forEach(m => {
    const on = () => {
      hover = m;
      cardK.textContent = m.G.l;
      cardR.textContent = m.G.role;
      cardS.textContent = provider + ' · ' + m.G.svc[provider];
      m.dot.style.transform = 'scale(1.35)';
      m.dot.style.boxShadow = '0 0 0 5px ' + accent + '2e';
      m.t.style.color = '#fff';
      card.style.opacity = '1';
    };
    const off = () => {
      if (hover === m) { hover = null; card.style.opacity = '0'; }
      m.dot.style.transform = 'none';
      m.dot.style.boxShadow = 'none';
      m.t.style.color = 'rgba(255,255,255,.75)';
    };
    m.b.addEventListener('mouseenter', on); m.b.addEventListener('focus', on);
    m.b.addEventListener('mouseleave', off); m.b.addEventListener('blur', off);
  });

  let loadUntil = 0;
  const chips = Array.from(document.querySelectorAll('[data-provider]'));
  const loadBtn = document.querySelector('[data-load]');
  const paint = () => chips.forEach(c => {
    const on = c.dataset.provider === provider;
    c.style.background = on ? accent : 'transparent';
    c.style.color = on ? '#141414' : 'rgba(255,255,255,.82)';
    c.style.borderColor = on ? accent : 'rgba(255,255,255,.22)';
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  chips.forEach(c => c.addEventListener('click', () => {
    provider = c.dataset.provider;
    paint();
    if (hover) cardS.textContent = provider + ' · ' + hover.G.svc[provider];
  }));
  if (loadBtn) loadBtn.addEventListener('click', () => { loadUntil = performance.now() + 7000; });
  paint();

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
    camera.position.set(0, 1.02, 3.05);
    camera.lookAt(0, -0.03, 0.02);

    const field = new THREE.Group();
    scene.add(field);

    const N = narrowView ? 7000 : 18000;
    const pos = new Float32Array(N * 3), aP = new Float32Array(N * 4), aQ = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      aP[i * 4] = Math.random();
      // más densidad en el centro del cauce
      aP[i * 4 + 1] = (Math.random() + Math.random() - 1) * 1.05;
      aP[i * 4 + 2] = Math.random() * 2 - 1;
      aP[i * 4 + 3] = 0.85 + Math.random() * 0.35;
      aQ[i * 3] = Math.random();
      aQ[i * 3 + 1] = Math.random();
      aQ[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(aP, 4));
    geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.6);

    const c1 = new THREE.Color(accent);
    const c2 = c1.clone().lerp(new THREE.Color('#ffffff'), 0.5);
    const U = {
      uClock: { value: 0 }, uTime: { value: 0 }, uFill: { value: still ? 1 : 0 },
      uLoad: { value: 0 }, uGate: { value: -1 }, uPull: { value: 0 }, uWide: { value: 1 },
      uSize: { value: Math.max(2.2, pix * 1.6) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColor: { value: c1 }, uColor2: { value: c2 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    field.add(new THREE.Points(geo, mat));

    /* orillas y compuertas como geometría de línea: dan la perspectiva del cauce */
    const bankGeo = (side) => {
      const v = [];
      const S = 120;
      for (let i = 0; i < S; i++) {
        for (const tt of [i / S, (i + 1) / S]) {
          const [nx, nz] = normalAt(tt);
          const o = 0.3 * (1 - 0.22 * Math.min(1, gateNarrow(tt))) * 1.06 * side;
          v.push(cx(tt) + nx * o, cy(tt) - 0.045, cz(tt) + nz * o);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      return g;
    };
    const bankMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
    const banks = [1, -1].map(s => { const ls = new THREE.LineSegments(bankGeo(s), bankMat); field.add(ls); return ls; });

    const gateLines = GATES.map(G => {
      const [nx, nz] = normalAt(G.t);
      const o = halfWidth(G.t) * 1.5;
      const v = new Float32Array([
        cx(G.t) + nx * o, cy(G.t) - 0.05, cz(G.t) + nz * o,
        cx(G.t) - nx * o, cy(G.t) - 0.05, cz(G.t) - nz * o
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      const lm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
      const ls = new THREE.LineSegments(g, lm);
      field.add(ls);
      return { G, ls, lm, g };
    });

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

    let overHost = false, tmx = 0, tmy = 0, pullT = 0, gxr = 0, gyr = 0;
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
    const onLeave = () => {
      overHost = false;
      if (hover) hover.b.dispatchEvent(new Event('mouseleave'));
    };

    const fillTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.96 - r.top) / (vh * 0.58));
    };

    const v3 = new THREE.Vector3(), vm = new THREE.Vector3();
    const toScreen = (x, y, z) => {
      v3.set(x, y, z).applyMatrix4(field.matrixWorld).project(camera);
      return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h];
    };

    const place = () => {
      const fill = U.uFill.value;
      marks.forEach(m => {
        const t = m.G.t;
        const [nx, nz] = normalAt(t);
        const o = halfWidth(t) * 1.75;
        const side = t < 0.5 ? 1 : -1;                  // los rótulos alternan de orilla
        const [x, y] = toScreen(cx(t) + nx * o * side, cy(t) + 0.1, cz(t) + nz * o * side);
        const right = x > w * 0.58;
        m.b.style.left = Math.round(Math.min(Math.max(x, 6), w - 6)) + 'px';
        m.b.style.top = Math.round(y) + 'px';
        m.b.style.transform = right ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
        m.b.style.flexDirection = right ? 'row-reverse' : 'row';
        const reached = clamp01((fill - t + 0.05) / 0.08);
        const target = (hover && hover !== m ? 0.45 : 1) * reached;
        if (Math.abs(target - m.vis) > 0.01) { m.vis = target; m.b.style.opacity = target.toFixed(2); }
        const live = reached > 0.5;
        if (live !== m.live) {
          m.live = live;
          m.b.style.pointerEvents = live ? 'auto' : 'none';
          m.b.tabIndex = live ? 0 : -1;
        }
        if (hover === m) {
          card.style.left = Math.round(right ? x - 14 : x + 14) + 'px';
          card.style.top = Math.round(Math.min(Math.max(y + 16, 6), Math.max(6, h - 165))) + 'px';
          card.style.transform = right ? 'translateX(-100%)' : 'none';
        }
      });
    };

    let count = 0, lastT = 0;
    const fmt = n => Math.floor(n).toLocaleString('es-CO');

    const draw = (t, dt) => {
      U.uTime.value = t;
      const load = performance.now() < loadUntil;
      U.uLoad.value += ((load ? 1 : 0) - U.uLoad.value) * 0.05;
      U.uWide.value += ((load ? 1.18 : 1) - U.uWide.value) * 0.05;
      const rate = 1 + U.uLoad.value * 0.75;
      U.uClock.value += dt * 0.085 * rate;
      if (!still) U.uFill.value += (fillTarget() - U.uFill.value) * 0.06;
      if (!simple) {
        pullT += ((overHost ? 1 : 0) - pullT) * 0.08;
        U.uPull.value = pullT;
        vm.set(tmx, tmy, 0);
        field.worldToLocal(vm);
        U.uMouse.value.x += (vm.x - U.uMouse.value.x) * 0.12;
        U.uMouse.value.y += (vm.y - U.uMouse.value.y) * 0.12;
      }
      U.uGate.value = hover ? hover.G.t : -1;

      gxr += ((simple ? 0 : tmx * 0.04) - gxr) * 0.05;
      gyr += ((simple ? 0 : tmy * 0.03) - gyr) * 0.05;
      const k = U.uFill.value;
      field.rotation.y = (Math.sin(t * 0.1) * 0.07 + gxr) * k;
      field.rotation.x = (0.05 + Math.sin(t * 0.07) * 0.025 - gyr) * k;
      field.updateMatrixWorld();

      bankMat.opacity = 0.1 * k;
      gateLines.forEach(g => {
        const reached = clamp01((k - g.G.t + 0.05) / 0.08);
        const sel = hover ? (hover.G === g.G ? 1 : 0.25) : 0.62;
        g.lm.opacity = 0.3 * reached * sel;
      });

      count += dt * N * 0.085 * rate * (0.55 + 0.45 * U.uLoad.value) * k;
      nEl.textContent = fmt(count);
      sEl.textContent = U.uLoad.value > 0.5 ? 'CAUDAL ALTO · ESCALADO AUTOMÁTICO' : 'CAUDAL NORMAL';

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
      const t = (now - t0) / 1000;
      if (!onScreen()) { lastT = t; return; }
      const dt = Math.min(0.05, t - lastT);
      lastT = t;
      draw(t, dt);
    };

    if (still) {
      U.uClock.value = 0.3;
      draw(2.6, 0);
      count = 68400; nEl.textContent = fmt(count);
      marks.forEach(m => { m.b.style.transition = 'none'; });
      draw(2.6, 0);
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
      geo.dispose(); mat.dispose(); bankMat.dispose(); renderer.dispose();
      banks.forEach(b => b.geometry.dispose());
      gateLines.forEach(g => { g.g.dispose(); g.lm.dispose(); });
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
