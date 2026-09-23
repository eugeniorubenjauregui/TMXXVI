/* world-map.js — mapa de puntos con la evolución de TITA (three.js, ESM por CDN).
   Geometría real: Natural Earth 110m (world-atlas@2.0.2, dominio público), decodificada
   desde TopoJSON y rasterizada en equirectangular para clasificar. La rejilla de
   puntos es regular en proyección Equal Earth (áreas verdaderas).
   Una línea de tiempo 2016 → 2026 enciende países, traza arcos desde Bogotá y va
   sumando implementaciones como puntos dentro de cada país.
   opts.onTick({ year, impl, countries, prog, playing }) · opts.ctl recibe { seek, play }. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const START = 2016, END = 2026;

// id ISO numérico · ciudad de referencia · año de entrada · implementaciones · etiqueta
export const COUNTRIES = [
  { id: '170', name: 'Colombia',        lon: -74.07, lat: 4.71,   year: 2016, n: 70, dx: 12,  dy: -4,  al: 'start' },
  { id: '218', name: 'Ecuador',         lon: -78.47, lat: -0.18,  year: 2017, n: 18, dx: -12, dy: -2,  al: 'end' },
  { id: '604', name: 'Perú',            lon: -77.04, lat: -12.05, year: 2018, n: 20, dx: -12, dy: 10,  al: 'end' },
  { id: '484', name: 'México',          lon: -99.13, lat: 19.43,  year: 2019, n: 30, dx: -12, dy: -8,  al: 'end' },
  { id: '840', name: 'USA',             lon: -80.19, lat: 25.76,  year: 2020, n: 20, dx: 12,  dy: -12, al: 'start' },
  { id: '724', name: 'España',          lon: -3.70,  lat: 40.42,  year: 2021, n: 14, dx: -12, dy: -8,  al: 'end' },
  { id: '784', name: 'Emiratos Árabes', lon: 55.27,  lat: 25.20,  year: 2022, n: 8,  dx: 12,  dy: -8,  al: 'start' },
  { id: '036', name: 'Australia',       lon: 151.21, lat: -33.87, year: 2023, n: 8,  dx: -12, dy: 12,  al: 'end' },
  { id: '554', name: 'Nueva Zelanda',   lon: 174.76, lat: -36.85, year: 2024, n: 5,  dx: -6,  dy: 22,  al: 'end' },
  { id: '764', name: 'Tailandia',       lon: 100.50, lat: 13.75,  year: 2025, n: 7,  dx: 12,  dy: -6,  al: 'start' }
];
const NC = COUNTRIES.length;

/* proyección Equal Earth (Šavrič, Patterson, Jenny 2018): áreas verdaderas */
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, EM = Math.sqrt(3) / 2;
const RAD = Math.PI / 180;
const eeFwd = (lon, lat) => {
  const th = Math.asin(EM * Math.sin(lat * RAD)), t2 = th * th, t6 = t2 * t2 * t2;
  return [lon * RAD * Math.cos(th) / (EM * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
          th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
};
const eeInv = (x, y) => {
  let th = y, fp = A1;
  for (let i = 0; i < 12; i++) {
    const t2 = th * th, t6 = t2 * t2 * t2;
    const f = th * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - y;
    fp = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2);
    const d = f / fp; th -= d;
    if (Math.abs(d) < 1e-9) break;
  }
  const s = Math.sin(th) / EM;
  if (Math.abs(s) > 1) return null;
  return [EM * x * fp / Math.cos(th) / RAD, Math.asin(s) / RAD];
};
const LAT_TOP = 76, LAT_BOT = -56, MW = 4.2, LON_C = 8;
const EE_XMAX = eeFwd(180, 0)[0];
const SC = MW / (2 * EE_XMAX);
const Y_TOP = eeFwd(0, LAT_TOP)[1], Y_BOT = eeFwd(0, LAT_BOT)[1], Y_C = (Y_TOP + Y_BOT) / 2;
const MAP_H = (Y_TOP - Y_BOT) * SC;
const rel = lon => ((((lon - LON_C) + 540) % 360) - 180);
const P = (lon, lat) => { const p = eeFwd(rel(lon), lat); return [p[0] * SC, (p[1] - Y_C) * SC]; };

const ACT_FN = `
uniform float uAct[10];
float actOf(float k){ float r = 0.0; for(int j = 0; j < 10; j++){ if(abs(float(j) - k) < 0.5) r = uAct[j]; } return r; }
`;

const LAND_VERT = ACT_FN + `
attribute float aC, aS;
uniform float uTime, uSize, uIn;
varying float vA, vK;
void main(){
  float a = aC < -0.5 ? 0.0 : actOf(aC);
  vec3 p = position;
  p.z += a * 0.01 * (0.5 + 0.5 * sin(uTime * 1.6 + aS * 20.0));
  float tw = 0.5 + 0.5 * sin(uTime * 0.6 + aS * 37.0);
  float base = aC < -0.5 ? 0.34 + 0.08 * tw : 0.42 + 0.06 * tw;
  vA = mix(base, 0.85 + 0.15 * tw, a) * uIn;
  vK = a;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + a * 0.3) * (4.0 / -mv.z);
}`;

const IMPL_VERT = `
attribute float aT, aS;
uniform float uTime, uSize, uIn, uYear;
varying float vA, vK;
void main(){
  float on = smoothstep(aT, aT + 0.18, uYear);
  float age = max(0.0, uYear - aT);
  float flash = exp(-age * 2.6) * on;
  vec3 p = position; p.z += 0.02 + flash * 0.05;
  vA = on * (0.8 + flash * 0.8 + 0.12 * sin(uTime * 2.2 + aS * 40.0)) * uIn;
  vK = 1.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = on * uSize * (1.0 + flash * 2.2) * (4.0 / -mv.z);
}`;

const RING_VERT = ACT_FN + `
attribute float aC, aP, aS;
uniform float uTime, uSize, uIn;
varying float vA, vK;
void main(){
  float a = actOf(aC);
  float f = fract(uTime * 0.32 + aS + aC * 0.137);
  float r = 0.012 + f * 0.13;
  vec3 p = position + vec3(cos(aP), sin(aP), 0.0) * r;
  vA = (1.0 - f) * (1.0 - f) * a * 0.75 * uIn;
  vK = 1.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (4.0 / -mv.z);
}`;

const ARC_VERT = ACT_FN + `
attribute float aT, aC, aS;
uniform float uTime, uSize, uIn;
varying float vA, vK;
void main(){
  float a = actOf(aC);
  float draw = clamp(a * 1.15, 0.0, 1.0);
  float vis = step(aT, draw);
  float head = exp(-pow((aT - draw) / 0.035, 2.0)) * step(draw, 0.999);
  float ph = fract(uTime * 0.22 + aC * 0.173);
  float d = abs(aT - ph); d = min(d, 1.0 - d);
  float pulse = exp(-pow(d / 0.045, 2.0)) * step(0.999, draw);
  vA = vis * (0.2 + head * 1.4 + pulse * 0.9) * uIn;
  vK = 1.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vis * uSize * (1.0 + head * 1.5 + pulse) * (4.0 / -mv.z);
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2, uWhite;
varying float vA, vK;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.24, 0.5, length(d));
  if (m <= 0.0) discard;
  vec3 c = mix(uColor2, uColor, clamp(vK * 1.3, 0.0, 1.0));
  c = mix(c, uWhite, clamp(vA - 0.8, 0.0, 0.6));
  gl_FragColor = vec4(c, min(1.0, vA) * m);
}`;

const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

/* ---------- TopoJSON → anillos lon/lat ---------- */
function decodeTopo(topo) {
  const tf = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(p => {
      x += p[0]; y += p[1];
      return tf ? [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]] : [p[0], p[1]];
    });
  });
  const ring = ids => {
    const out = [];
    ids.forEach((i, k) => {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      (k ? a.slice(1) : a).forEach(p => out.push(p));
    });
    return out;
  };
  return topo.objects.countries.geometries.map(g => {
    let polys = [];
    if (g.type === 'Polygon') polys = [g.arcs.map(ring)];
    else if (g.type === 'MultiPolygon') polys = g.arcs.map(p => p.map(ring));
    return { id: g.id, polys };
  });
}

function rasterize(countries, W, H) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const px = lon => (lon + 180) / 360 * W, py = lat => (90 - lat) / 180 * H;
  const trace = (rings, shift) => {
    rings.forEach(r => {
      let prev = null, off = 0;
      r.forEach((p, k) => {
        let lon = p[0];
        if (prev !== null) {                         // continuidad sobre el antimeridiano
          if (lon + off - prev > 180) off -= 360;
          else if (lon + off - prev < -180) off += 360;
        }
        const L = lon + off; prev = L;
        const x = px(L) + shift, y = py(p[1]);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.closePath();
    });
  };
  const target = {};
  COUNTRIES.forEach((c, i) => { target[c.id] = i; });
  countries.forEach(c => {
    if (c.id === '010') return;                      // Antártida fuera del encuadre
    const ti = target[c.id];
    ctx.fillStyle = ti === undefined ? 'rgb(8,0,0)' : 'rgb(' + (40 + ti * 20) + ',0,0)';
    [-W, 0, W].forEach(shift => {
      c.polys.forEach(poly => { ctx.beginPath(); trace(poly, shift); ctx.fill('evenodd'); });
    });
  });
  return ctx.getImageData(0, 0, W, H).data;
}

export function initWorldMap(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const accent2 = '#52C7CF';
  const onTick = opts.onTick || (() => {});
  const ctl = opts.ctl || {};
  const narrow = Math.min(host.clientWidth || 800, window.innerWidth) < 640;

  let stopped = false, raf = 0, ro = null, disposer = null;

  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  host.appendChild(layer);

  const labels = COUNTRIES.map(c => {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:baseline;gap:7px;white-space:nowrap;' +
      'opacity:0;transition:opacity .5s;font-family:' + MONO + ';letter-spacing:.14em';
    const nm = document.createElement('span');
    nm.textContent = c.name.toUpperCase();
    nm.style.cssText = 'font-size:' + (narrow ? 9 : 10.5) + 'px;color:rgba(255,255,255,.86)';
    const yr = document.createElement('span');
    yr.textContent = String(c.year);
    yr.style.cssText = 'font-size:' + (narrow ? 8.5 : 9.5) + 'px;color:' + accent;
    if (c.al === 'end') el.append(yr, nm); else el.append(nm, yr);
    layer.appendChild(el);
    return { el, op: -1 };
  });

  Promise.all([import(/* webpackIgnore: true */ THREE_URL), fetch(ATLAS_URL).then(r => r.json())]).then(([THREE, topo]) => {
    if (stopped) return;

    /* rejilla de tierra */
    const RW = 1440, RH = 720;
    const data = rasterize(decodeTopo(topo), RW, RH);
    const STEP = narrow ? 1.7 : 1.25;                       // grados en el ecuador
    const GS = STEP * RAD * EE_XMAX / Math.PI;              // paso en unidades proyectadas
    const lP = [], lC = [], lS = [];
    const byCountry = COUNTRIES.map(() => []);
    let row = 0;
    for (let py = Y_TOP; py >= Y_BOT; py -= GS * 0.88, row++) {
      const off = (row % 2) * GS * 0.5;
      for (let px = -EE_XMAX + off; px <= EE_XMAX; px += GS) {
        const ll = eeInv(px, py);
        if (!ll || Math.abs(ll[0]) > 180) continue;
        let lon = ll[0] + LON_C; if (lon >= 180) lon -= 360; if (lon < -180) lon += 360;
        const lat = ll[1];
        const x = Math.floor((lon + 180) / 360 * RW), y = Math.floor((90 - lat) / 180 * RH);
        const i = (y * RW + x) * 4;
        if (data[i + 3] < 160) continue;
        const r = data[i];
        let ci = -1;
        if (r >= 30) { const k = Math.round((r - 40) / 20); if (k >= 0 && k < NC) ci = k; }
        lP.push(...P(lon, lat), 0);
        lC.push(ci); lS.push(Math.random());
        if (ci >= 0) byCountry[ci].push([lon, lat]);
      }
    }

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix);
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.insertBefore(canvas, layer);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const world = new THREE.Group();
    scene.add(world);

    const act = new Array(NC).fill(0);
    const col1 = new THREE.Color(accent), col2 = new THREE.Color(accent2).lerp(new THREE.Color('#ffffff'), 0.35), white = new THREE.Color('#ffffff');
    const common = extra => Object.assign({
      uTime: { value: 0 }, uIn: { value: still ? 1 : 0 },
      uColor: { value: col1 }, uColor2: { value: col2 }, uWhite: { value: white }
    }, extra);
    const mk = (vert, U) => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    const geoOf = attrs => {
      const g = new THREE.BufferGeometry();
      Object.keys(attrs).forEach(k => g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(attrs[k][0]), attrs[k][1])));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
      return g;
    };
    const disposables = [];
    const add = (vert, U, attrs) => {
      const g = geoOf(attrs), m = mk(vert, U);
      world.add(new THREE.Points(g, m));
      disposables.push(g, m);
      return U;
    };

    const landU = add(LAND_VERT, common({ uSize: { value: Math.max(2.4, pix * 1.8) }, uAct: { value: act } }),
      { position: [lP, 3], aC: [lC, 1], aS: [lS, 1] });

    /* implementaciones: un punto por proyecto, dentro de su país */
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const iP = [], iT = [], iS = [], times = [];
    COUNTRIES.forEach((c, ci) => {
      const pool = byCountry[ci];
      const span = END - 0.08 - c.year;
      for (let k = 0; k < c.n; k++) {
        const t = k === 0 ? c.year : c.year + span * Math.pow(Math.random(), 0.8);
        let lon, lat;
        if (pool.length >= 8 && k % 3 !== 0) {
          const p = pool[Math.floor(Math.random() * pool.length)];
          lon = p[0] + (Math.random() - 0.5) * STEP * 0.6; lat = p[1] + (Math.random() - 0.5) * STEP * 0.6;
        } else {
          const s = pool.length >= 8 ? 1.6 : 0.7;
          lon = c.lon + gauss() * s; lat = c.lat + gauss() * s;
        }
        iP.push(...P(lon, lat), 0); iT.push(t); iS.push(Math.random()); times.push(t);
      }
    });
    times.sort((a, b) => a - b);
    const implU = add(IMPL_VERT, common({ uSize: { value: Math.max(2.6, pix * 2.1) }, uYear: { value: START } }),
      { position: [iP, 3], aT: [iT, 1], aS: [iS, 1] });

    /* pulsos en cada ciudad */
    const rP = [], rC = [], rA = [], rS = [];
    const RPTS = 40;
    COUNTRIES.forEach((c, ci) => {
      for (let s = 0; s < 2; s++) for (let k = 0; k < RPTS; k++) {
        rP.push(...P(c.lon, c.lat), 0.004); rC.push(ci); rA.push(k / RPTS * Math.PI * 2); rS.push(s * 0.5);
      }
    });
    const ringU = add(RING_VERT, common({ uSize: { value: Math.max(1.5, pix * 1.1) }, uAct: { value: act } }),
      { position: [rP, 3], aC: [rC, 1], aP: [rA, 1], aS: [rS, 1] });

    /* arcos desde Bogotá */
    const aP = [], aT = [], aC = [], aS = [];
    const O = new THREE.Vector3(...P(COUNTRIES[0].lon, COUNTRIES[0].lat), 0);
    COUNTRIES.forEach((c, ci) => {
      if (!ci) return;
      const B = new THREE.Vector3(...P(c.lon, c.lat), 0);
      const dist = O.distanceTo(B);
      const mid = O.clone().add(B).multiplyScalar(0.5);
      mid.z += 0.1 + dist * 0.28;
      const curve = new THREE.QuadraticBezierCurve3(O, mid, B);
      const S = Math.max(40, Math.round(dist * 110));
      for (let k = 0; k <= S; k++) {
        const t = k / S, p = curve.getPoint(t);
        aP.push(p.x, p.y, p.z); aT.push(t); aC.push(ci); aS.push(Math.random());
      }
    });
    const arcU = add(ARC_VERT, common({ uSize: { value: Math.max(1.8, pix * 1.35) }, uAct: { value: act } }),
      { position: [aP, 3], aT: [aT, 1], aC: [aC, 1], aS: [aS, 1] });
    const allU = [landU, implU, ringU, arcU];

    let w = 0, h = 0;
    const TILT = 0.5;
    const resize = () => {
      w = host.clientWidth || 800;
      h = host.clientHeight || Math.round(w * 0.5);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      const vf = camera.fov * Math.PI / 180;
      const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      const mapH = MAP_H;
      const dW = (MW / 2 * 1.02) / Math.tan(hf / 2);
      const dH = (mapH / 2 * 1.25) / Math.tan(vf / 2);
      const d = Math.max(dW, dH) * 0.93;
      camera.position.set(0, -d * Math.sin(TILT), d * Math.cos(TILT));
      camera.lookAt(0, 0.02, 0);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    let tx = 0, mx = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / Math.max(1, r.width) - 0.5) * 0.08;
    };
    const onLeave = () => { tx = 0; };

    /* reloj de la línea de tiempo */
    let target = still ? END : START, disp = target, playing = false, started = still, inV = still ? 1 : 0;
    const RATE = 10 / 13;                                  // años por segundo
    ctl.seek = y => { target = Math.max(START, Math.min(END, y)); playing = false; started = true; };
    ctl.play = () => { if (target >= END - 0.01) { target = START; disp = START; } playing = true; started = true; };

    let last = { year: -1, impl: -1, countries: -1, prog: -1, playing: null };
    const emit = () => {
      const year = Math.max(START, Math.min(END, Math.floor(disp + 0.0001)));
      let impl = 0; while (impl < times.length && times[impl] <= disp + 0.0001) impl++;
      const countries = COUNTRIES.filter(c => c.year <= disp + 0.0001).length;
      const prog = Math.round((disp - START) / (END - START) * 200) / 200;
      if (year !== last.year || impl !== last.impl || countries !== last.countries || prog !== last.prog || playing !== last.playing) {
        last = { year, impl, countries, prog, playing };
        onTick({ year, impl, countries, prog, playing });
      }
    };

    const v3 = new THREE.Vector3();
    let prevT = 0;
    const draw = t => {
      const dt = Math.min(0.05, t - prevT); prevT = t;
      if (!started) {
        const r = host.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) * 0.72) { started = true; playing = true; }
      }
      if (playing) { target = Math.min(END, target + dt * RATE); if (target >= END) playing = false; }
      disp += (target - disp) * (Math.abs(target - disp) > 1.5 ? 0.12 : 0.35);
      if (Math.abs(target - disp) < 0.001) disp = target;
      if (!still) inV += (1 - inV) * 0.04;
      COUNTRIES.forEach((c, i) => { act[i] = clamp01((disp - c.year) / 0.55); });
      allU.forEach(U => { U.uTime.value = t; U.uIn.value = inV; });
      implU.uYear.value = disp;
      mx += (tx - mx) * 0.05;
      world.rotation.y = mx;
      world.updateMatrixWorld();
      renderer.render(scene, camera);

      COUNTRIES.forEach((c, i) => {
        v3.set(...P(c.lon, c.lat), 0).applyMatrix4(world.matrixWorld).project(camera);
        const x = (v3.x * 0.5 + 0.5) * w, y = (-v3.y * 0.5 + 0.5) * h;
        const L = labels[i];
        const op = (clamp01((act[i] - 0.3) / 0.5) * inV).toFixed(2);
        if (op !== L.op) { L.op = op; L.el.style.opacity = op; }
        L.el.style.transform = 'translate(' + Math.round(x + c.dx) + 'px,' + Math.round(y + c.dy) + 'px) translate(' + (c.al === 'end' ? '-100%' : '0') + ',-50%)';
      });
      emit();
    };

    const onScreen = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return r.bottom > -160 && r.top < vh + 160;
    };
    const t0 = performance.now();
    const loop = now => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      if (!onScreen()) { prevT = t; return; }
      draw(t);
    };
    if (still) {
      // sin animación: se redibuja sólo al mover la línea de tiempo
      let lastTarget = null;
      const poll = () => {
        if (stopped) return;
        if (target !== lastTarget) { lastTarget = target; disp = target; draw(4); }
        raf = requestAnimationFrame(poll);
      };
      raf = requestAnimationFrame(poll);
    } else {
      raf = requestAnimationFrame(loop);
      host.addEventListener('mousemove', onMove, { passive: true });
      host.addEventListener('mouseleave', onLeave);
    }

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', resize);
      disposables.forEach(x => x.dispose());
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      delete ctl.seek; delete ctl.play;
    };
  }).catch(() => {});

  return () => {
    stopped = true;
    if (ro) ro.disconnect();
    if (disposer) disposer();
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  };
}
