/* priority-matrix.js — del backlog a la prioridad (three.js, ESM por CDN).
   Cada punto es una iniciativa del diagnóstico. Sin priorizar es una nube; al
   bajar la página cada iniciativa migra a su lugar en la matriz de impacto y
   esfuerzo, y el orden aparece solo. Los cuadrantes explican qué se hace con
   cada grupo; los horizontes muestran en qué ola entra cada iniciativa.

   La migración se escalona por partícula (cada una tiene su propio retardo),
   así el orden se lee como un proceso, no como un corte. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const EX = 1.02, EY = 0.9, EZ = 0.46;   // extensión de la matriz (X esfuerzo, Y impacto, Z horizonte)

const QUADS = [
  { l: 'QUICK WINS', q: 0, x: -1, y:  1, w: 0.27, role: 'Alto impacto, esfuerzo bajo. Se ejecutan primero: financian y validan el resto del plan.' },
  { l: 'APUESTAS',   q: 1, x:  1, y:  1, w: 0.21, role: 'Alto impacto y alto esfuerzo. Necesitan roadmap, presupuesto y un dueño en el negocio.' },
  { l: 'AJUSTES',    q: 2, x: -1, y: -1, w: 0.32, role: 'Bajo impacto y bajo esfuerzo. Se resuelven en la operación, sin abrir un proyecto.' },
  { l: 'DESCARTAR',  q: 3, x:  1, y: -1, w: 0.20, role: 'Bajo impacto y alto esfuerzo. Salen del plan y se documenta por qué.' }
];

const HORIZONS = ['0-3 MESES', '3-6 MESES', '6-12 MESES'];
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

const VERT = `
attribute vec4 aT;              // xyz: destino en la matriz, w: ola (0..2)
attribute vec2 aS;              // x: retardo, y: semilla
uniform float uTime, uSort, uQuad, uWave, uPull, uSize;
uniform vec2 uMouse;
varying float vA, vQ;

void main(){
  // cada iniciativa migra en su momento: el orden se ve aparecer
  float k = clamp((uSort - aS.x * 0.34) / 0.66, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);

  vec3 cloud = position;
  float sp = uTime * 0.12 + aS.y * 6.28;
  cloud.x += sin(sp) * 0.09 * (1.0 - k);
  cloud.y += cos(sp * 1.21) * 0.07 * (1.0 - k);

  vec3 p = mix(cloud, aT.xyz, k);
  float sw = 0.55 + aS.y * 0.9;
  float orb = 0.018 + aS.x * 0.026;
  p.x += cos(uTime * sw + aS.y * 6.28) * orb * k;
  p.y += sin(uTime * sw * 0.82 + aS.x * 5.1) * orb * 0.8 * k;
  p.xy += vec2(sin(uTime * 0.18), cos(uTime * 0.145)) * 0.012 * k;

  float quad = 0.0;
  quad += step(0.0, aT.x) * 1.0;              // derecha = esfuerzo alto
  quad += step(aT.y, 0.0) * 2.0;              // abajo = impacto bajo
  vQ = quad;

  float a = 0.5 + 0.3 * k;

  // horizonte seleccionado: su ola queda al frente, las otras bajan
  float wSel = step(abs(uWave - aT.w), 0.5);
  float wOn = step(-0.5, uWave);
  a *= mix(1.0, mix(0.13, 1.0, wSel), wOn * k);
  p.z += mix(0.0, mix(-0.04, 0.1, wSel), wOn * k);

  // cuadrante en foco
  float qSel = step(abs(uQuad - quad), 0.5);
  float qOn = step(-0.5, uQuad);
  a *= mix(1.0, mix(0.2, 1.0, qSel), qOn * k);
  a += qOn * qSel * k * 0.35;

  float scan = smoothstep(0.34, 0.0, abs(p.x - sin(uTime * 0.22) * 1.05));
  a += scan * 0.16 * k;

  float dm = length(p.xy - uMouse);
  float wm = smoothstep(0.42, 0.0, dm) * uPull;
  p.xy += (uMouse - p.xy) * 0.16 * wm;
  a += wm * 0.4;

  vA = min(1.0, a);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.86 + 0.28 * sin(uTime * 1.25 + aS.y * 6.28)) * (3.0 / max(0.001, -mv.z));
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2;
varying float vA, vQ;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.26, 0.5, length(d));
  if (m <= 0.0 || vA <= 0.004) discard;
  // el cuadrante de quick wins tira a claro; el resto al acento
  gl_FragColor = vec4(mix(uColor, uColor2, 0.26 - vQ * 0.05), vA * m);
}`;

function goContact(text) {
  const sec = document.querySelector('#tm-contacto');
  const box = document.querySelectorAll('#tm-contacto [data-opt] input')[0];
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  const ta = document.querySelector('#tm-contacto #q7');
  if (ta && !ta.value.trim()) ta.value = text;
  if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 30, behavior: 'smooth' });
}

export function initPriorityMatrix(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const narrow = Math.min(host.clientWidth || 560, window.innerWidth) < 640;
  const simple = still || narrow;

  let stopped = false, raf = 0, ro = null, disposer = null;

  /* ---------- capa HTML ---------- */
  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  const cap = (text) => {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.cssText = 'position:absolute;left:0;top:0;margin:0;font-family:' + MONO + ';font-size:9.5px;' +
      'letter-spacing:.18em;color:rgba(255,255,255,.62);opacity:0;white-space:nowrap';
    layer.appendChild(p);
    return p;
  };
  const capX = cap('ESFUERZO →'), capY = cap('↑ IMPACTO'), capZ = cap('HORIZONTE ↘');

  const quads = QUADS.map(q => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', q.l + '. ' + q.role + '. Ir al formulario de contacto');
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;padding:5px 7px;' +
      'background:none;border:0;cursor:pointer;pointer-events:none;font:inherit;white-space:nowrap;opacity:0;' +
      'transition:opacity .4s';
    b.tabIndex = -1;
    const dot = document.createElement('i');
    dot.style.cssText = 'flex:none;display:block;width:6px;height:6px;border-radius:50%;background:' + accent +
      ';transition:transform .3s,box-shadow .3s';
    const t = document.createElement('span');
    t.textContent = q.l;
    t.style.cssText = 'font-family:' + MONO + ';font-size:10px;letter-spacing:.16em;color:rgba(255,255,255,.75);transition:color .3s';
    b.append(dot, t);
    b.addEventListener('click', () => goContact('Queremos un diagnóstico para priorizar: nos interesa el cuadrante de ' + q.l.toLowerCase() + '.'));
    layer.appendChild(b);
    return { q, b, dot, t, vis: 0, live: false };
  });

  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:0;top:0;width:min(252px,76%);padding:13px 15px 14px;' +
    'background:rgba(16,17,17,.94);border:1px solid rgba(255,255,255,.14);opacity:0;pointer-events:none;' +
    'transition:opacity .25s;z-index:3';
  card.innerHTML =
    '<p data-k style="margin:0 0 7px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:' + accent + '"></p>' +
    '<p data-r style="margin:0;font-size:13.5px;line-height:1.45;color:#fff;text-wrap:pretty"></p>';
  layer.appendChild(card);
  const cardK = card.querySelector('[data-k]'), cardR = card.querySelector('[data-r]');

  let hover = null;
  quads.forEach(m => {
    const on = () => {
      hover = m;
      cardK.textContent = m.q.l;
      cardR.textContent = m.q.role;
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

  /* ---------- horizontes (chips de la página) ---------- */
  let wave = -1;
  const chips = Array.from(document.querySelectorAll('[data-horizon]'));
  const paint = () => chips.forEach(c => {
    const on = HORIZONS.indexOf(c.dataset.horizon) === wave;
    c.style.background = on ? accent : 'transparent';
    c.style.color = on ? '#141414' : 'rgba(255,255,255,.82)';
    c.style.borderColor = on ? accent : 'rgba(255,255,255,.22)';
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  chips.forEach(c => c.addEventListener('click', () => {
    const i = HORIZONS.indexOf(c.dataset.horizon);
    wave = wave === i ? -1 : i;
    paint();
  }));
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
    camera.position.set(0, 0.3, 4.45);
    camera.lookAt(0, 0, 0);

    const N = narrow ? 5200 : 13000;
    const pos = new Float32Array(N * 3), aT = new Float32Array(N * 4), aS = new Float32Array(N * 2);
    // reparto por cuadrante: un backlog real tiene más ajustes menores que apuestas
    const cum = [];
    QUADS.reduce((s, q) => { cum.push(s + q.w); return s + q.w; }, 0);
    for (let i = 0; i < N; i++) {
      const r = Math.random() * cum[3];
      let qi = 0; while (qi < 3 && r > cum[qi]) qi++;
      const Q = QUADS[qi];
      const jx = (Math.random() + Math.random() + Math.random() - 1.5) * 0.62;
      const jy = (Math.random() + Math.random() + Math.random() - 1.5) * 0.52;
      aT[i * 4] = Q.x * (EX * 0.52) + jx * 0.78;
      aT[i * 4 + 1] = Q.y * (EY * 0.5) + jy * 0.66;
      const wv = qi === 0 ? (Math.random() < 0.78 ? 0 : 1)            // quick wins: primera ola
               : qi === 1 ? (Math.random() < 0.6 ? 2 : 1)             // apuestas: más adelante
               : Math.floor(Math.random() * 3);
      aT[i * 4 + 2] = (1 - wv) * EZ + (Math.random() - 0.5) * 0.07;    // el horizonte es el eje de profundidad
      aT[i * 4 + 3] = wv;
      // nube inicial: esfera suelta alrededor del centro
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const rr = 0.55 + Math.random() * 0.5;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * rr * 1.15;
      pos[i * 3 + 1] = Math.cos(ph) * rr * 0.85;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rr * 0.7;
      aS[i * 2] = Math.random();
      aS[i * 2 + 1] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 4));
    geo.setAttribute('aS', new THREE.BufferAttribute(aS, 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.4);

    const c1 = new THREE.Color(accent);
    const c2 = c1.clone().lerp(new THREE.Color('#ffffff'), 0.55);
    const U = {
      uTime: { value: 0 }, uSort: { value: still ? 1 : 0 }, uQuad: { value: -1 }, uWave: { value: -1 },
      uPull: { value: 0 }, uSize: { value: Math.max(2.3, pix * 1.7) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColor: { value: c1 }, uColor2: { value: c2 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    const field = new THREE.Group();
    scene.add(field);
    const pts = new THREE.Points(geo, mat);
    field.add(pts);

    // un marco por horizonte: la perspectiva se lee en los tres planos apilados
    const planes = [0, 1, 2].map(wv => {
      const z = (1 - wv) * EZ;
      const seg = [
        [-EX, -EY], [EX, -EY], [EX, -EY], [EX, EY], [EX, EY], [-EX, EY], [-EX, EY], [-EX, -EY],
        [-EX, 0], [EX, 0], [0, -EY], [0, EY]
      ];
      const v = new Float32Array(seg.length * 3);
      seg.forEach((p, i) => { v[i * 3] = p[0]; v[i * 3 + 1] = p[1]; v[i * 3 + 2] = z; });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      const lm = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
      const ls = new THREE.LineSegments(g, lm);
      field.add(ls);
      return { wv, ls, lm, g };
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

    let overHost = false, tmx = 0, tmy = 0, pullT = 0, gx = 0, gy = 0;
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

    const sortTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.94 - r.top) / (vh * 0.55));
    };

    const v3 = new THREE.Vector3(), vm = new THREE.Vector3();
    const toScreen = (x, y, z) => {
      v3.set(x, y, z || 0).applyMatrix4(field.matrixWorld).project(camera);
      return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h];
    };

    const place = () => {
      const k = U.uSort.value;
      const op = (k * 0.9).toFixed(2);
      const setCap = (el, x, y, anchor) => {
        el.style.opacity = op;
        el.style.left = Math.round(x) + 'px';
        el.style.top = Math.round(y) + 'px';
        el.style.transform = anchor;
      };
      const fz = EZ;
      setCap(capX, ...toScreen(EX * 0.98, -EY * 1.1, fz), 'translate(-100%,0)');
      setCap(capY, ...toScreen(-EX * 1.04, EY * 1.04, fz), 'translate(0,-100%)');
      setCap(capZ, ...toScreen(EX * 1.04, -EY * 0.52, 0), 'translate(-40%,0)');

      quads.forEach(m => {
        const [x, y] = toScreen(m.q.x * EX * 0.92, m.q.y * EY * 1.02, EZ);
        const right = m.q.x > 0;
        m.b.style.left = Math.round(right ? Math.min(x, w - 10) : Math.max(x, 10)) + 'px';
        m.b.style.top = Math.round(y) + 'px';
        m.b.style.transform = (right ? 'translate(-100%,-50%)' : 'translate(0,-50%)');
        m.b.style.flexDirection = right ? 'row-reverse' : 'row';
        const vis = clamp01((k - 0.72) / 0.22);
        const target = hover && hover !== m ? vis * 0.45 : vis;
        if (Math.abs(target - m.vis) > 0.01) { m.vis = target; m.b.style.opacity = target.toFixed(2); }
        const live = vis > 0.5;
        if (live !== m.live) {
          m.live = live;
          m.b.style.pointerEvents = live ? 'auto' : 'none';
          m.b.tabIndex = live ? 0 : -1;
        }
        if (hover === m) {
          card.style.left = Math.round(right ? x - 16 : x + 16) + 'px';
          card.style.top = Math.round(Math.min(Math.max(y - 14, 6), Math.max(6, h - 118))) + 'px';
          card.style.transform = right ? 'translateX(-100%)' : 'none';
        }
      });
    };

    const draw = t => {
      U.uTime.value = t;
      if (!still) U.uSort.value += (sortTarget() - U.uSort.value) * 0.055;
      if (!simple) {
        pullT += ((overHost ? 1 : 0) - pullT) * 0.08;
        U.uPull.value = pullT;
      }
      U.uQuad.value = hover ? hover.q.q : -1;
      U.uWave.value = wave;

      gx += ((simple ? 0 : tmx * 0.05) - gx) * 0.05;
      gy += ((simple ? 0 : tmy * 0.05) - gy) * 0.05;
      const k = U.uSort.value;
      field.rotation.y = (-0.3 + Math.sin(t * 0.12) * 0.11 + gx) * k;
      field.rotation.x = (0.13 + Math.sin(t * 0.09) * 0.04 - gy) * k;
      field.updateMatrixWorld();
      planes.forEach(p => {
        const sel = wave < 0 ? 0.62 : (wave === p.wv ? 1 : 0.16);
        p.lm.opacity = 0.26 * k * sel;
      });
      if (!simple) {
        vm.set(tmx, tmy, 0);
        field.worldToLocal(vm);
        U.uMouse.value.x += (vm.x - U.uMouse.value.x) * 0.12;
        U.uMouse.value.y += (vm.y - U.uMouse.value.y) * 0.12;
      }
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
      if (!onScreen()) return;
      draw((now - t0) / 1000);
    };

    if (still) {
      draw(2.4);
      quads.forEach(m => { m.b.style.transition = 'none'; });
      draw(2.4);
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
      planes.forEach(p => { p.g.dispose(); p.lm.dispose(); });
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
