/* solar-system.js — la operación del cliente en el centro (three.js, ESM por CDN).
   Cinco soluciones orbitan el núcleo, cada una como un cúmulo de partículas con su
   radio, su inclinación y su periodo. Entre las órbitas circula un cinturón de
   datos con velocidades keplerianas: lo de adentro corre más rápido.
   Al posar el cursor sobre una solución el sistema frena, se ilumina su órbita y
   aparecen las líneas hacia las soluciones con las que trabaja: ninguna opera sola.
   Vista isométrica marcada para que se lea el volumen del sistema. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const SOL = [
  { l: 'STRATEGY & ADVISORY', href: 'strategy-advisory.html', r: 0.82, w: 0.52, inc: 0.17, node: 0.3,
    desc: 'Diagnóstico, prioridades y hoja de ruta antes de construir.', pairs: [1, 3] },
  { l: 'AI & CUSTOM SOLUTIONS', href: 'ai-custom-solutions.html', r: 1.16, w: 0.4, inc: -0.21, node: 1.15,
    desc: 'Agentes conectados a los sistemas donde vive la operación.', pairs: [0, 4] },
  { l: 'COMMERCE SOLUTIONS', href: 'commerce-solutions.html', r: 1.52, w: 0.3, inc: 0.12, node: 2.25,
    desc: 'Plataforma, integraciones y omnicanalidad sobre un solo inventario.', pairs: [3, 4] },
  { l: 'RETAIL GROWTH', href: 'retail-growth.html', r: 1.9, w: 0.23, inc: -0.15, node: 3.45,
    desc: 'SEO, GEO, AEO, CRO y paid media sobre el mismo funnel.', pairs: [2, 0] },
  { l: 'CLOUD & DATA', href: 'cloud-data.html', r: 2.3, w: 0.17, inc: 0.2, node: 4.6,
    desc: 'Infraestructura y datos que sostienen todo lo demás.', pairs: [1, 2] }
];

const RMAX = 3.1;
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

/* posición de un planeta, misma fórmula que el shader */
function planetPos(P, clock, out) {
  const th = P.node + clock * P.w;
  const x = Math.cos(th) * P.r, z = Math.sin(th) * P.r;
  const c = Math.cos(P.inc), s = Math.sin(P.inc);
  out[0] = x; out[1] = -z * s; out[2] = z * c;      // inclinación alrededor de X
  return out;
}

const VERT = `
attribute vec4 aO;              // x: radio, y: fase, z: velocidad angular, w: inclinación
attribute vec4 aC;              // xyz: desplazamiento dentro del cúmulo, w: tipo (0 núcleo, 1 cinturón, 2+ planeta)
attribute vec2 aQ;              // x: semilla, y: jitter
uniform float uClock, uTime, uBuild, uFocus, uPull, uSize;
uniform vec3 uMouse;
varying float vA, vK;

void main(){
  float kind = aC.w;
  float th = aO.y + uClock * aO.z;
  vec3 base = vec3(cos(th) * aO.x, 0.0, sin(th) * aO.x);

  // inclinación de la órbita
  float ci = cos(aO.w), si = sin(aO.w);
  vec3 p = vec3(base.x, -base.z * si, base.z * ci);

  // el cúmulo viaja con su planeta; el núcleo respira
  vec3 off = aC.xyz;
  if (kind < 0.5) {
    float sp = uTime * 0.25 + aQ.x * 6.28;
    off *= 1.0 + 0.09 * sin(sp);
  }
  p += off;

  // el sistema se arma del núcleo hacia afuera
  float appear = smoothstep(0.0, 0.26, uBuild - aO.x / R_MAX * 0.9);
  float a = (kind < 0.5 ? 0.95 : (kind < 1.5 ? 0.52 : 0.85)) * appear;
  a += (kind > 1.5 ? 0.25 : 0.0) * appear;

  // solución en foco: su cúmulo y su tramo de cinturón se encienden
  float sel = step(abs(uFocus - kind), 0.5);
  float focusOn = step(1.5, uFocus);
  a *= mix(1.0, mix(0.36, 1.0, sel), focusOn);
  a += focusOn * sel * 0.3;

  float dm = length(p - uMouse);
  float wm = smoothstep(0.55, 0.0, dm) * uPull;
  p += (uMouse - p) * 0.18 * wm * (kind < 1.5 ? 1.0 : 0.25);
  a += wm * 0.3;

  float disc = step(0.5, kind) * (1.0 - step(1.5, kind));
  a *= mix(1.0, 0.84 + 0.16 * sin(uTime * 1.6 + aQ.x * 47.0), disc);
  // unas pocas estrellas destacan sobre el polvo
  float star = pow(aQ.y, 3.0);
  a *= mix(1.0, 0.7 + 2.1 * star, disc);

  vA = min(1.0, a);
  vK = kind;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = kind < 0.5 ? 1.05 : (disc > 0.5 ? (0.72 + 1.15 * star) : 1.45);
  gl_PointSize = uSize * sz * (3.4 / max(0.001, -mv.z));
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2;
varying float vA, vK;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.26, 0.5, length(d));
  if (m <= 0.0 || vA <= 0.004) discard;
  // el núcleo tira a claro, las soluciones al acento
  gl_FragColor = vec4(mix(uColor2, uColor, clamp(vK * 0.6, 0.0, 1.0)), vA * m);
}`;

export function initSolarSystem(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const narrow = Math.min(host.clientWidth || 540, window.innerWidth) < 640;
  const simple = still || narrow;

  let stopped = false, raf = 0, ro = null, disposer = null;

  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  const core = document.createElement('p');
  core.textContent = 'TU OPERACIÓN';
  core.style.cssText = 'position:absolute;left:0;top:0;margin:0;padding:5px 9px;font-family:' + MONO + ';' +
    'font-size:9.5px;letter-spacing:.18em;color:#fff;background:rgba(16,17,17,.9);' +
    'border:1px solid rgba(255,255,255,.14);opacity:0;white-space:nowrap;transform:translate(-50%,0)';
  layer.appendChild(core);

  const marks = SOL.map((P, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', P.l + '. ' + P.desc);
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:7px;padding:4px 8px;' +
      'background:rgba(16,17,17,.9);border:1px solid rgba(255,255,255,.14);cursor:pointer;pointer-events:none;' +
      'font:inherit;white-space:nowrap;opacity:0';
    b.tabIndex = -1;
    const dot = document.createElement('i');
    dot.style.cssText = 'flex:none;display:block;width:5px;height:5px;border-radius:50%;background:' + accent +
      ';transition:transform .3s,box-shadow .3s';
    const t = document.createElement('span');
    t.textContent = P.l;
    t.style.cssText = 'font-family:' + MONO + ';font-size:9.5px;letter-spacing:.14em;color:#fff';
    b.append(dot, t);
    layer.appendChild(b);
    return { P, i, b, dot, t, vis: 0, live: false, pos: [0, 0, 0] };
  });

  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:0;top:0;width:min(244px,78%);padding:13px 15px 14px;' +
    'background:rgba(16,17,17,.95);border:1px solid rgba(255,255,255,.14);opacity:0;pointer-events:none;' +
    'transition:opacity .25s;z-index:4';
  card.innerHTML =
    '<p data-k style="margin:0 0 7px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:' + accent + '"></p>' +
    '<p data-r style="margin:0 0 11px;font-size:13.5px;line-height:1.45;color:#fff;text-wrap:pretty"></p>' +
    '<a data-a href="#" style="display:inline-flex;align-items:center;gap:8px;font-family:' + MONO + ';font-size:10px;' +
    'letter-spacing:.14em;color:' + accent + ';border-bottom:1px solid ' + accent + ';padding-bottom:3px">VER SOLUCIÓN →</a>';
  layer.appendChild(card);
  const cardK = card.querySelector('[data-k]'), cardR = card.querySelector('[data-r]'), cardA = card.querySelector('[data-a]');

  const meter = document.createElement('div');
  meter.style.cssText = 'position:absolute;left:0;bottom:0;pointer-events:none';
  meter.innerHTML =
    '<p style="margin:0;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:rgba(255,255,255,.62)">DATOS EN TRÁNSITO</p>' +
    '<p style="margin:5px 0 0;display:flex;align-items:baseline;gap:10px">' +
      '<span data-n style="font-family:' + MONO + ';font-size:20px;color:#fff">0</span>' +
      '<span data-s style="font-family:' + MONO + ';font-size:10px;letter-spacing:.12em;color:' + accent + '">5 SOLUCIONES · 1 OPERACIÓN</span>' +
    '</p>';
  layer.appendChild(meter);
  const nEl = meter.querySelector('[data-n]');

  let hover = null, sticky = null;
  const showCard = m => {
    cardK.textContent = m.P.l;
    cardR.textContent = m.P.desc;
    cardA.setAttribute('href', m.P.href);
    card.style.opacity = '1';
  };
  marks.forEach(m => {
    const on = () => {
      hover = m;
      showCard(m);
      m.dot.style.transform = 'scale(1.5)';
      m.dot.style.boxShadow = '0 0 0 5px ' + accent + '2e';
    };
    const off = () => {
      if (sticky === m) return;
      if (hover === m) { hover = null; card.style.opacity = '0'; }
      m.dot.style.transform = 'none';
      m.dot.style.boxShadow = 'none';
    };
    m.b.addEventListener('mouseenter', on);
    m.b.addEventListener('focus', on);
    m.b.addEventListener('mouseleave', off);
    m.b.addEventListener('blur', off);
    m.b.addEventListener('click', () => { sticky = sticky === m ? null : m; hover = m; showCard(m); });
    m._off = off;
  });
  card.addEventListener('mouseenter', () => { card.style.pointerEvents = 'auto'; });

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
    camera.position.set(5.8, 4.55, 6.25);           // isométrica marcada, con aire alrededor
    camera.lookAt(0, 0, 0);

    const belt = narrow ? 11000 : 30000;
    const perPlanet = narrow ? 300 : 620;
    const coreN = narrow ? 1400 : 3400;
    const N = belt + perPlanet * 5 + coreN;

    const pos = new Float32Array(N * 3), aO = new Float32Array(N * 4), aC = new Float32Array(N * 4), aQ = new Float32Array(N * 2);
    let i = 0;
    const put = (r, ph, w, inc, ox, oy, oz, kind) => {
      aO[i * 4] = r; aO[i * 4 + 1] = ph; aO[i * 4 + 2] = w; aO[i * 4 + 3] = inc;
      aC[i * 4] = ox; aC[i * 4 + 1] = oy; aC[i * 4 + 2] = oz; aC[i * 4 + 3] = kind;
      aQ[i * 2] = Math.random(); aQ[i * 2 + 1] = Math.random();
      i++;
    };
    // núcleo: la operación del cliente
    for (let k = 0; k < coreN; k++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const rr = Math.pow(Math.random(), 0.65) * 0.2;
      put(0, 0, 0, 0,
        Math.sin(ph) * Math.cos(th) * rr, Math.cos(ph) * rr * 0.55, Math.sin(ph) * Math.sin(th) * rr, 0);
    }
    // disco: densidad exponencial, dos brazos espirales logarítmicos, halo disperso.
    // la rotación es casi rígida (velocidad de patrón) para que los brazos no se enrollen
    const ARMS = 2, PITCH = 0.72;
    for (let k = 0; k < belt; k++) {
      const halo = Math.random() < 0.07;
      let r = halo ? 1.9 + Math.random() * 1.2
                   : 0.34 - 0.62 * Math.log(1 - Math.random() * 0.94);
      r = Math.min(r, RMAX);
      const arm = Math.floor(Math.random() * ARMS) * (Math.PI * 2 / ARMS);
      const spiral = Math.log(Math.max(r, 0.22) / 0.3) / PITCH;
      const jit = (Math.random() + Math.random() + Math.random() - 1.5) * (halo ? 3.4 : 0.44);
      const thick = halo ? 0.16 : 0.055 * Math.exp(-r / 0.9) + 0.011;
      const w = 0.3 + 0.055 / Math.max(0.35, r);
      put(r, arm + spiral + jit, w, (Math.random() - 0.5) * (halo ? 0.55 : 0.1),
        0, (Math.random() + Math.random() - 1) * thick, 0, 1);
    }
    // cúmulos: una solución por planeta
    SOL.forEach((P, pi) => {
      for (let k = 0; k < perPlanet; k++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
        const rr = Math.pow(Math.random(), 0.55) * 0.072;
        put(P.r, P.node, P.w, P.inc,
          Math.sin(ph) * Math.cos(th) * rr, Math.cos(ph) * rr * 0.9, Math.sin(ph) * Math.sin(th) * rr, 2 + pi);
      }
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aO', new THREE.BufferAttribute(aO, 4));
    geo.setAttribute('aC', new THREE.BufferAttribute(aC, 4));
    geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4.2);

    const c1 = new THREE.Color(accent);
    const c2 = c1.clone().lerp(new THREE.Color('#ffffff'), 0.62);
    const U = {
      uClock: { value: 0 }, uTime: { value: 0 }, uBuild: { value: still ? 1 : 0 },
      uFocus: { value: -1 }, uPull: { value: 0 }, uSize: { value: Math.max(2.6, pix * 1.95) },
      uMouse: { value: new THREE.Vector3(9, 9, 9) },
      uColor: { value: c1 }, uColor2: { value: c2 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT.replace(/R_MAX/g, RMAX.toFixed(3)), fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.Points(geo, mat));

    // órbitas
    const rings = SOL.map(P => {
      const S = 128, v = [];
      for (let k = 0; k < S; k++) {
        for (const kk of [k, k + 1]) {
          const th = (kk / S) * Math.PI * 2;
          const x = Math.cos(th) * P.r, z = Math.sin(th) * P.r;
          v.push(x, -z * Math.sin(P.inc), z * Math.cos(P.inc));
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      const lm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
      const ls = new THREE.LineSegments(g, lm);
      scene.add(ls);
      return { P, ls, lm, g };
    });

    // líneas entre soluciones que trabajan juntas (se dibujan al enfocar una)
    const linkGeo = new THREE.BufferGeometry();
    const linkArr = new Float32Array(4 * 3);
    linkGeo.setAttribute('position', new THREE.BufferAttribute(linkArr, 3));
    const linkMat = new THREE.LineBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0, depthTest: false });
    const links = new THREE.LineSegments(linkGeo, linkMat);
    scene.add(links);

    let w = 0, h = 0;
    const resize = () => {
      w = host.clientWidth || 540;
      h = host.clientHeight || Math.round(w * 470 / 540);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    let overHost = false, pullT = 0;
    const mouseW = new THREE.Vector3(9, 9, 9);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const onMove = e => {
      const r = host.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (hit) mouseW.copy(hit);
      overHost = true;
    };
    const onLeave = () => {
      overHost = false;
      if (hover && !sticky) hover._off();
    };

    const buildTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.98 - r.top) / (vh * 0.5));
    };

    const v3 = new THREE.Vector3(), tmp = [0, 0, 0];
    const toScreen = (x, y, z) => {
      v3.set(x, y, z).project(camera);
      return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h, v3.z];
    };

    const place = () => {
      const k = U.uBuild.value;
      const [ccx, ccy] = toScreen(0, -0.42, 0);      // por debajo del plano del disco
      core.style.opacity = clamp01(k * 3).toFixed(2);
      core.style.left = Math.round(ccx) + 'px';
      core.style.top = Math.round(ccy + 10) + 'px';

      // los rótulos se empujan verticalmente cuando dos planetas se alinean
      const seen = [];
      const order = marks.map(m => {
        planetPos(m.P, U.uClock.value, m.pos);
        const sc = toScreen(m.pos[0] * 1.1, m.pos[1] + 0.14, m.pos[2] * 1.1);
        return { m, x: sc[0], y: sc[1] };
      }).sort((p, q) => p.y - q.y);
      order.forEach(o => {
        let yy = o.y;
        for (const s2 of seen) {
          if (Math.abs(yy - s2.y) < 16 && Math.abs(o.x - s2.x) < 280) yy = s2.y + 17;
        }
        seen.push({ x: o.x, y: yy });
        o.m.labelY = yy;
      });

      marks.forEach(m => {
        const [x] = toScreen(m.pos[0] * 1.1, m.pos[1] + 0.14, m.pos[2] * 1.1);
        const y = m.labelY != null ? m.labelY : 0;
        const right = x > w * 0.56;
        m.b.style.left = Math.round(Math.min(Math.max(x, 6), w - 6)) + 'px';
        m.b.style.top = Math.round(y) + 'px';
        m.b.style.transform = right ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
        m.b.style.flexDirection = right ? 'row-reverse' : 'row';
        const appear = clamp01((k - m.P.r / RMAX * 0.82) / 0.2);
        const target = (hover && hover !== m ? 0.42 : 1) * appear;
        if (Math.abs(target - m.vis) > 0.01) { m.vis = target; m.b.style.opacity = target.toFixed(2); }
        const live = appear > 0.5;
        if (live !== m.live) {
          m.live = live;
          m.b.style.pointerEvents = live ? 'auto' : 'none';
          m.b.tabIndex = live ? 0 : -1;
        }
      });

      if (hover) {
        const [x, y] = toScreen(hover.pos[0], hover.pos[1], hover.pos[2]);
        const right = x > w * 0.5;
        card.style.left = Math.round(right ? x - 18 : x + 18) + 'px';
        card.style.top = Math.round(Math.min(Math.max(y + 14, 6), Math.max(6, h - 150))) + 'px';
        card.style.transform = right ? 'translateX(-100%)' : 'none';
      } else {
        card.style.pointerEvents = 'none';
      }
    };

    let speed = 1;
    const draw = (t, dt) => {
      U.uTime.value = t;
      if (!still) U.uBuild.value += (buildTarget() - U.uBuild.value) * 0.06;
      // al enfocar una solución el sistema frena
      speed += ((hover ? 0.16 : 1) - speed) * 0.06;
      U.uClock.value += dt * speed;
      U.uFocus.value = hover ? 2 + hover.i : -1;
      if (!simple) {
        pullT += ((overHost ? 1 : 0) - pullT) * 0.08;
        U.uPull.value = pullT;
        U.uMouse.value.lerp(mouseW, 0.14);
      }

      const k = U.uBuild.value;
      rings.forEach(r => {
        const appear = clamp01((k - r.P.r / RMAX * 0.82) / 0.2);
        const sel = hover ? (hover.P === r.P ? 1 : 0.2) : 0.5;
        r.lm.opacity = 0.3 * appear * sel;
      });

      // vínculos de la solución enfocada
      if (hover) {
        const a = planetPos(hover.P, U.uClock.value, [0, 0, 0]);
        hover.P.pairs.forEach((pi, n) => {
          const b = planetPos(SOL[pi], U.uClock.value, [0, 0, 0]);
          linkArr[n * 6] = a[0]; linkArr[n * 6 + 1] = a[1]; linkArr[n * 6 + 2] = a[2];
          linkArr[n * 6 + 3] = b[0]; linkArr[n * 6 + 4] = b[1]; linkArr[n * 6 + 5] = b[2];
        });
        linkGeo.attributes.position.needsUpdate = true;
        linkMat.opacity += (0.5 - linkMat.opacity) * 0.15;
      } else {
        linkMat.opacity += (0 - linkMat.opacity) * 0.15;
      }

      nEl.textContent = Math.round(belt * k).toLocaleString('es-CO');
      renderer.render(scene, camera);
      place();
    };

    const onScreen = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return r.bottom > -180 && r.top < vh + 180;
    };
    let lastT = 0;
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
      U.uClock.value = 1.2;
      draw(2.2, 0);
      draw(2.2, 0);
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
      rings.forEach(r => { r.g.dispose(); r.lm.dispose(); });
      linkGeo.dispose(); linkMat.dispose();
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
