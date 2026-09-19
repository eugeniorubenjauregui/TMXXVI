/* agent-sphere.js — esfera de tareas con agentes (three.js, ESM por CDN).
   Cada punto es una tarea de la operación. Cuatro capas de lectura:
     1. scroll: la nube dispersa se ordena en esfera (dato crudo → inteligencia)
     2. cursor: pliegue local, los puntos se agrupan donde señalas
     3. clic: pulso angular que recorre la superficie y devuelve el agente más cercano
     4. nodos: seis agentes en la superficie, con rol, rango típico y salto al form
   Rejilla lat/long de área uniforme (columnas ∝ sin φ) para que las filas se lean
   punteadas sin acumular puntos en los polos. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const AGENTS = [
  { id: 'demanda',   label: 'DEMANDA',     role: 'Pronóstico y reposición de inventario',  metric: 'Quiebres de stock: −15 a −30%', th: 0.35, ph: 1.02, topic: 'demanda e inventario' },
  { id: 'catalogo',  label: 'CATÁLOGO',    role: 'Fichas, atributos y publicación',        metric: 'Publicación: de días a horas',  th: 1.75, ph: 0.72, topic: 'catálogo' },
  { id: 'ops',       label: 'OPERACIONES', role: 'Órdenes, excepciones y seguimiento',     metric: 'Tareas manuales: −30 a −50%',   th: 2.95, ph: 1.48, topic: 'operaciones' },
  { id: 'analitica', label: 'ANALÍTICA',   role: 'Preguntas en lenguaje natural sobre datos propios', metric: 'Respuesta en segundos', th: 4.25, ph: 1.15, topic: 'analítica' },
  { id: 'servicio',  label: 'SERVICIO',    role: 'Consultas con datos del pedido',         metric: 'Resuelto en primer contacto: 40 a 60%', th: 5.35, ph: 1.92, topic: 'servicio al cliente' },
  { id: 'procesos',  label: 'PROCESOS',    role: 'Back office y aprobaciones internas',    metric: 'Piloto en 4 a 8 semanas',       th: 0.95, ph: 2.25, topic: 'procesos internos' },
  { id: 'precios',   label: 'PRECIOS',     role: 'Monitoreo de competencia y márgenes por categoría', metric: 'Revisión de precios: diaria', th: 2.35, ph: 0.50, topic: 'precios' },
  { id: 'promos',    label: 'PROMOCIONES', role: 'Armado y seguimiento de campañas por canal', metric: 'Ciclo de campaña: −40%',    th: 3.65, ph: 0.85, topic: 'promociones' },
  { id: 'logistica', label: 'LOGÍSTICA',   role: 'Asignación de despacho y última milla',   metric: 'Promesa de entrega cumplida: +10 a +20%', th: 4.85, ph: 1.62, topic: 'logística' },
  { id: 'tienda',    label: 'TIENDA',      role: 'POS, surtido y tareas de piso de venta',  metric: 'Cobertura de surtido: +8 a +15%', th: 1.25, ph: 2.00, topic: 'tienda física' },
  { id: 'marketpl',  label: 'MARKETPLACES', role: 'Publicación y reglas por marketplace',   metric: 'Publicación masiva en horas',  th: 3.30, ph: 2.35, topic: 'marketplaces' }
];

/* el núcleo y los radios que lo unen al manto */
const CORE_VERT = `
attribute float aS;
uniform float uTime, uSize;
varying float vA;
void main(){
  vec3 p = position * (1.0 + 0.07 * sin(uTime * 1.25 + aS * 6.28));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = 0.42 + 0.58 * (0.5 + 0.5 * sin(uTime * 1.9 + aS * 11.0));
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize;
}`;

const CORE_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.24, 0.5, length(d));
  if (m <= 0.0) discard;
  gl_FragColor = vec4(uColor, vA * m * uOpacity);
}`;

/* radio: la energía viaja del núcleo al manto */
const SPOKE_VERT = `
attribute float aT;
attribute float aN;
uniform float uTime, uActive;
varying float vA;
void main(){
  float pulse = fract(uTime * 0.34 + aN * 0.13);
  float d = abs(aT - pulse);
  d = min(d, 1.0 - d);
  float glow = exp(-pow(d / 0.11, 2.0));
  float sel = (uActive < -0.5) ? 0.5 : ((abs(uActive - aN) < 0.5) ? 1.0 : 0.16);
  vA = (0.14 + glow * 1.25) * sel;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SPOKE_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }`;

const VERT = `
attribute vec2 sph;
uniform float uTime, uAmp, uFreq, uSize, uForm, uPull, uPulse, uNode;
uniform vec3 uMouse, uPulseDir, uNodeDir;
varying float vA;

vec3 mod289(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 mod289(vec4 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main(){
  float th = sph.x, ph = sph.y;
  vec3 dir0 = vec3(sin(ph)*cos(th), cos(ph), sin(ph)*sin(th));
  vec3 q = dir0 * uFreq;
  float t = uTime * 0.085;
  float n1 = snoise(q + vec3(0.0, 0.0, t));
  float n2 = snoise(q * 1.13 + vec3(11.7, 3.2, t * 1.21));
  float n3 = snoise(q * 1.9 + vec3(4.3, 19.1, t * 0.72));
  float scat = 1.0 - uForm;                       // 1 = nube dispersa

  th += n1 * uAmp * 1.2 + n3 * uAmp * 0.18 + n2 * scat * 1.5;
  ph += n2 * uAmp * 0.62 + n1 * scat * 0.9;
  float r = 1.0 + n3 * 0.028;
  vec3 dir = vec3(sin(ph)*cos(th), cos(ph), sin(ph)*sin(th));
  r *= 1.0 + scat * (0.55 + n1 * 0.95);           // radios dispersos antes de ordenarse

  // pliegue bajo el cursor: los vecinos convergen y el borde se engrosa
  float dm = acos(clamp(dot(dir, uMouse), -1.0, 1.0));
  float wm = smoothstep(0.62, 0.0, dm) * uPull;
  dir = normalize(mix(dir, uMouse, wm * 0.3));
  r += wm * 0.085;

  // pulso de consulta: anillo angular que se aleja del punto de clic
  float ring = 0.0;
  if (uPulse >= 0.0) {
    float dp = acos(clamp(dot(dir, uPulseDir), -1.0, 1.0));
    ring = exp(-pow((dp - uPulse) / 0.16, 2.0)) * smoothstep(3.3, 2.6, uPulse);
    r += ring * 0.075;
  }

  // agente activo: su vecindad se enciende
  float dn = acos(clamp(dot(dir, uNodeDir), -1.0, 1.0));
  float wn = smoothstep(0.5, 0.0, dn) * uNode;
  r += wn * 0.05;

  vec3 p = dir * r;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 nrm = normalize(mat3(modelViewMatrix) * dir);
  float rim = 1.0 - abs(dot(nrm, normalize(-mv.xyz)));
  float crest = smoothstep(0.45, 1.0, abs(n2));
  float a = (0.21 + pow(rim, 2.5) * 0.82) * (0.78 + 0.48 * crest);
  a *= mix(0.42, 1.0, uForm);
  a += wm * 0.5 + ring * 0.7 + wn * 0.45;
  vA = min(1.0, a);

  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + ring * 0.7 + wm * 0.35);
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2;
varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.28, 0.5, length(d));
  if (m <= 0.0) discard;
  vec3 c = mix(uColor, uColor2, clamp(vA * 0.72, 0.0, 1.0));
  gl_FragColor = vec4(c, vA * m);
}`;

const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

function goContact(agent) {
  const sec = document.querySelector('#tm-contacto');
  const boxes = document.querySelectorAll('#tm-contacto [data-opt] input');
  const box = boxes[1];
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  const ta = document.querySelector('#tm-contacto #q7');
  if (ta && !ta.value.trim()) ta.value = 'Nos interesa un agente de ' + agent.topic + '.';
  if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 30, behavior: 'smooth' });
}

export function initAgentSphere(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const narrow = Math.min(host.clientWidth || 560, window.innerWidth) < 640;
  const simple = still || narrow;            // móvil: sin pliegue ni pulso

  let stopped = false, raf = 0, ro = null, disposer = null;

  /* ---------- capa HTML: nodos, tooltip, respuesta, pista ---------- */
  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  const nodes = AGENTS.map(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Agente de ' + a.topic + '. ' + a.role + '. Ir al formulario de contacto');
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;' +
      'padding:5px 7px;margin:-14px 0 0 -14px;background:none;border:0;cursor:pointer;pointer-events:auto;' +
      'font:inherit;color:#fff;white-space:nowrap;opacity:0;transition:opacity .35s';
    b.style.pointerEvents = 'none';
    b.tabIndex = -1;
    const dot = document.createElement('i');
    dot.style.cssText = 'position:relative;flex:none;display:block;width:7px;height:7px;border-radius:50%;' +
      'background:' + accent + ';box-shadow:0 0 0 0 ' + accent + '66;transition:box-shadow .3s,transform .3s';
    const txt = document.createElement('span');
    txt.textContent = a.label;
    txt.style.cssText = 'font-family:' + MONO + ';font-size:10px;letter-spacing:.16em;color:rgba(255,255,255,.72);transition:color .3s';
    b.append(dot, txt);
    b.addEventListener('click', () => goContact(a));
    layer.appendChild(b);
    return { a, b, dot, txt, side: 1, vis: 0, live: false };
  });

  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:0;top:0;width:min(258px,74%);padding:14px 16px 15px;' +
    'background:rgba(16,17,17,.94);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(6px);' +
    'opacity:0;pointer-events:none;transition:opacity .25s;z-index:3';
  card.innerHTML =
    '<p data-k style="margin:0 0 8px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:' + accent + '"></p>' +
    '<p data-r style="margin:0 0 10px;font-size:13.5px;line-height:1.45;color:#fff;text-wrap:pretty"></p>' +
    '<p data-m style="margin:0;padding-top:9px;border-top:1px solid rgba(255,255,255,.12);font-family:' + MONO + ';font-size:10.5px;letter-spacing:.06em;color:rgba(255,255,255,.7)"></p>';
  layer.appendChild(card);
  const cardK = card.querySelector('[data-k]'), cardR = card.querySelector('[data-r]'), cardM = card.querySelector('[data-m]');

  const answer = document.createElement('div');
  answer.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:9px;' +
    'padding:8px 12px;background:' + accent + ';color:#141414;font-family:' + MONO + ';font-size:10px;' +
    'letter-spacing:.14em;white-space:nowrap;opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.9);' +
    'transition:opacity .3s,transform .4s cubic-bezier(.22,.61,.36,1);z-index:2';
  layer.appendChild(answer);

  // la pista vive en la fila de pie del gráfico, no sobre el lienzo: el lienzo
  // puede desbordar hacia la columna de texto y allí chocaría con el copy del hero
  const hint = document.querySelector('[data-graphic-hint]') || document.createElement('p');
  hint.textContent = simple ? 'TOCA UN AGENTE' : 'MUEVE EL CURSOR · CLIC PARA CONSULTAR';
  hint.style.transition = 'opacity .5s';

  let hover = null;
  nodes.forEach(n => {
    const on = () => {
      hover = n;
      cardK.textContent = n.a.label;
      cardR.textContent = n.a.role;
      cardM.textContent = n.a.metric;
      n.dot.style.boxShadow = '0 0 0 5px ' + accent + '2e';
      n.dot.style.transform = 'scale(1.25)';
      n.txt.style.color = '#fff';
      card.style.opacity = '1';
    };
    const off = () => {
      if (hover === n) { hover = null; card.style.opacity = '0'; }
      n.dot.style.boxShadow = '0 0 0 0 ' + accent + '66';
      n.dot.style.transform = 'none';
      n.txt.style.color = 'rgba(255,255,255,.72)';
    };
    n.b.addEventListener('mouseenter', on);
    n.b.addEventListener('focus', on);
    n.b.addEventListener('mouseleave', off);
    n.b.addEventListener('blur', off);
  });

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
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    const rows = narrow ? 110 : 142;
    const cols = narrow ? 200 : 258;
    const P = [], S = [];
    for (let i = 0; i < rows; i++) {
      const ph = Math.acos(1 - 2 * ((i + 0.5) / rows));
      const s = Math.sin(ph);
      const n = Math.max(6, Math.round(cols * s));
      const off = (i % 2) * (Math.PI / n) + i * 0.031;
      for (let j = 0; j < n; j++) {
        const th = (j / n) * Math.PI * 2 + off;
        P.push(s * Math.cos(th), Math.cos(ph), s * Math.sin(th));
        S.push(th, ph);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    geo.setAttribute('sph', new THREE.BufferAttribute(new Float32Array(S), 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.6);

    const c1 = new THREE.Color(accent);
    const c2 = c1.clone().lerp(new THREE.Color('#ffffff'), 0.2);
    const U = {
      uTime: { value: 0 }, uAmp: { value: 0.52 }, uFreq: { value: 1.12 },
      uSize: { value: Math.max(2.0, pix * 1.45) },
      uForm: { value: still ? 1 : 0 }, uPull: { value: 0 }, uPulse: { value: -1 }, uNode: { value: 0 },
      uMouse: { value: new THREE.Vector3(0, 0, 1) },
      uPulseDir: { value: new THREE.Vector3(0, 0, 1) },
      uNodeDir: { value: new THREE.Vector3(0, 0, 1) },
      uColor: { value: c1 }, uColor2: { value: c2 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);

    const dirOf = (th, ph) => new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    nodes.forEach((n, i) => { n.dir = dirOf(n.a.th, n.a.ph); n.i = i; });

    const R_CORE = 0.34;
    const coreN = narrow ? 420 : 900;
    const cp = new Float32Array(coreN * 3), cs = new Float32Array(coreN);
    for (let i = 0; i < coreN; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const rr = Math.pow(Math.random(), 0.45) * R_CORE;
      cp[i * 3] = Math.sin(ph) * Math.cos(th) * rr;
      cp[i * 3 + 1] = Math.cos(ph) * rr;
      cp[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rr;
      cs[i] = Math.random();
    }
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    coreGeo.setAttribute('aS', new THREE.BufferAttribute(cs, 1));
    const coreU = {
      uTime: { value: 0 }, uSize: { value: Math.max(2.8, pix * 2.1) },
      uColor: { value: new THREE.Color(accent).lerp(new THREE.Color('#ffffff'), 0.3) },
      uOpacity: { value: 0 }
    };
    const coreMat = new THREE.ShaderMaterial({
      vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, uniforms: coreU,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    pts.add(new THREE.Points(coreGeo, coreMat));

    const SEGS = 18;
    const sv = [], st = [], sn = [];
    nodes.forEach((n, idx) => {
      for (let k = 0; k < SEGS; k++) {
        for (const f of [k / SEGS, (k + 1) / SEGS]) {
          const r = R_CORE + (1 - R_CORE) * f;
          sv.push(n.dir.x * r, n.dir.y * r, n.dir.z * r);
          st.push(f); sn.push(idx);
        }
      }
    });
    const spokeGeo = new THREE.BufferGeometry();
    spokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sv), 3));
    spokeGeo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(st), 1));
    spokeGeo.setAttribute('aN', new THREE.BufferAttribute(new Float32Array(sn), 1));
    const spokeU = {
      uTime: { value: 0 }, uActive: { value: -1 },
      uColor: { value: new THREE.Color(accent) }, uOpacity: { value: 0 }
    };
    const spokeMat = new THREE.ShaderMaterial({
      vertexShader: SPOKE_VERT, fragmentShader: SPOKE_FRAG, uniforms: spokeU,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    pts.add(new THREE.LineSegments(spokeGeo, spokeMat));
    if (still) { coreU.uOpacity.value = 1; spokeU.uOpacity.value = 1; }

    let w = 0, h = 0, padL = 0;
    const padLRef = { v: 0 };
    const resize = () => {
      w = host.clientWidth || 560;
      h = host.clientHeight || Math.round(w * 470 / 560);
      // el desborde del lienzo no es zona utilizable: ahí abajo está el copy del hero
      const ml = parseFloat(getComputedStyle(host).marginLeft) || 0;
      padL = Math.max(0, -ml);
      padLRef.v = padL;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    /* puntero → dirección sobre la esfera */
    const ray = new THREE.Raycaster();
    const unit = new THREE.Sphere(new THREE.Vector3(), 1);
    const hitV = new THREE.Vector3(), ndc = new THREE.Vector2();
    let overSphere = false, mx = 0, my = 0, tx = 0, ty = 0, pullT = 0;
    const mouseDir = new THREE.Vector3(0, 0, 1);

    const pick = (cx, cy) => {
      const r = host.getBoundingClientRect();
      ndc.set(((cx - r.left) / Math.max(1, r.width)) * 2 - 1, -((cy - r.top) / Math.max(1, r.height)) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.ray.intersectSphere(unit, hitV);
      return hit ? pts.worldToLocal(hitV.clone()).normalize() : null;
    };
    const onMove = e => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 0.3;
      ty = ((e.clientY - r.top) / Math.max(1, r.height) - 0.5) * 0.22;
      const d = pick(e.clientX, e.clientY);
      overSphere = !!d;
      if (d) mouseDir.copy(d);
    };
    const onLeave = () => {
      overSphere = false;
      if (hover) { hover.b.dispatchEvent(new Event('mouseleave')); }
    };

    let pulseT = -1, pulseHideAt = 0;
    const onClick = e => {
      const d = pick(e.clientX, e.clientY);
      if (!d) return;
      U.uPulseDir.value.copy(d);
      pulseT = 0;
      hint.style.opacity = '0';
      // el pulso "devuelve" el agente más cercano al punto consultado
      let best = nodes[0], bd = 9;
      nodes.forEach(n => { const a = n.dir.angleTo(d); if (a < bd) { bd = a; best = n; } });
      const r = host.getBoundingClientRect();
      answer.textContent = best.a.label + ' · ' + best.a.metric.toUpperCase();
      answer.style.left = Math.round(Math.min(Math.max(e.clientX - r.left, padLRef.v + 120), r.width - 120)) + 'px';
      answer.style.top = Math.round(Math.min(Math.max(e.clientY - r.top, 30), r.height - 30)) + 'px';
      setTimeout(() => {
        if (stopped) return;
        answer.style.opacity = '1';
        answer.style.transform = 'translate(-50%,-50%) scale(1)';
      }, 340);
      pulseHideAt = performance.now() + 3400;
    };

    /* scroll: nube → esfera */
    const formTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.96 - r.top) / (vh * 0.6));
    };

    const v3 = new THREE.Vector3();
    const placeNodes = () => {
      const seen = [];
      nodes.map(n => {
        v3.copy(n.dir).multiplyScalar(1.1).applyMatrix4(pts.matrixWorld);
        const front = v3.z;
        v3.project(camera);
        n._x = (v3.x * 0.5 + 0.5) * w;
        n._y = (-v3.y * 0.5 + 0.5) * h;
        n._front = front;
        return n;
      }).sort((a, b) => a._y - b._y).forEach(n => {
        let yy = n._y;
        for (const p of seen) {
          if (Math.abs(yy - p.y) < 17 && Math.abs(n._x - p.x) < 190) yy = p.y + 18;
        }
        seen.push({ x: n._x, y: yy });
        n._y = yy;
      });
      nodes.forEach(n => {
        const front = n._front;
        const x = n._x, y = n._y;
        const vis = clamp01((front + 0.1) / 0.35);
        const target = hover && hover !== n ? vis * 0.45 : vis;
        if (Math.abs(target - n.vis) > 0.01) {
          n.vis = target;
          n.b.style.opacity = target.toFixed(2);
        }
        const live = vis > 0.5;
        if (live !== n.live) {
          n.live = live;
          n.b.style.pointerEvents = live ? 'auto' : 'none';
          n.b.tabIndex = live ? 0 : -1;
        }
        const side = x > w * 0.62 ? -1 : 1;
        if (side !== n.side) {
          n.side = side;
          n.b.style.flexDirection = side === 1 ? 'row' : 'row-reverse';
          n.b.style.transform = side === 1 ? 'none' : 'translateX(-100%)';
        }
        n.b.style.left = Math.round(Math.min(Math.max(x, side === 1 ? padL + 6 : padL + 104), side === 1 ? w - 104 : w - 6)) + 'px';
        n.b.style.top = Math.round(Math.min(Math.max(y, 10), h - 10)) + 'px';
        if (hover === n) {
          const left = x > w * 0.5 ? x - 22 : x + 22;
          card.style.left = Math.round(Math.max(left, padL + 6)) + 'px';
          card.style.top = Math.round(Math.min(Math.max(y - 20, 8), Math.max(8, h - 150))) + 'px';
          card.style.transform = x > w * 0.5 ? 'translateX(-100%)' : 'none';
        }
      });
    };

    const draw = t => {
      U.uTime.value = t;
      if (!still) {
        const f = formTarget();
        U.uForm.value += (f - U.uForm.value) * 0.075;
      }
      if (!simple) {
        pullT += ((overSphere ? 1 : 0) - pullT) * 0.09;
        U.uPull.value = pullT;
        U.uMouse.value.lerp(mouseDir, 0.2).normalize();
        if (pulseT >= 0) {
          pulseT += 0.036;
          U.uPulse.value = pulseT * 2.05;
          if (U.uPulse.value > 3.4) { pulseT = -1; U.uPulse.value = -1; }
        }
        if (pulseHideAt && performance.now() > pulseHideAt) {
          pulseHideAt = 0;
          answer.style.opacity = '0';
          answer.style.transform = 'translate(-50%,-50%) scale(.94)';
        }
      }
      U.uNode.value += ((hover ? 1 : 0) - U.uNode.value) * 0.12;
      if (hover) U.uNodeDir.value.copy(hover.dir);
      coreU.uTime.value = t;
      spokeU.uTime.value = t;
      spokeU.uActive.value = hover ? hover.i : -1;
      coreU.uOpacity.value += (1 - coreU.uOpacity.value) * 0.05;
      spokeU.uOpacity.value += (1 - spokeU.uOpacity.value) * 0.05;
      mx += (tx - mx) * 0.045; my += (ty - my) * 0.045;
      pts.rotation.y = t * 0.075 + mx;
      pts.rotation.x = -0.12 + my;
      pts.updateMatrixWorld();
      renderer.render(scene, camera);
      placeNodes();
    };

    // el gate de visibilidad se mide por frame: un IntersectionObserver sobre un
    // nodo que React reemplaza puede quedarse en false para siempre
    const onScreen = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return r.bottom > -180 && r.top < vh + 180;
    };
    const t0 = performance.now();
    const loop = now => {
      raf = requestAnimationFrame(loop);
      if (!onScreen()) return;
      draw((now - t0) / 1000);
    };

    if (still) {
      draw(3.4);
      nodes.forEach(n => { n.b.style.transition = 'none'; });
      draw(3.4);
    } else {
      raf = requestAnimationFrame(loop);
      if (!simple) {
        host.addEventListener('mousemove', onMove, { passive: true });
        host.addEventListener('mouseleave', onLeave);
        host.addEventListener('click', onClick);
      }
    }

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mouseleave', onLeave);
      host.removeEventListener('click', onClick);
      window.removeEventListener('resize', resize);
      geo.dispose(); mat.dispose(); renderer.dispose();
      coreGeo.dispose(); coreMat.dispose(); spokeGeo.dispose(); spokeMat.dispose();
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
