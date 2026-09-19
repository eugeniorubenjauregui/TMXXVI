/* cloud-waves.js — la lámina de datos (three.js, ESM por CDN).
   El dato como superficie: miles de fibras paralelas que recorren el cuadro y se
   ondulan en olas viajeras. Las crestas se encienden en cian sobre el verde de
   marca; los bordes se disuelven en el fondo, así la lámina no tiene marco.
   Sobre ella quedan marcadas las cuatro capas de la arquitectura: en cada una la
   lámina se comprime y la fibra destella.

   Todo se resuelve en el vertex shader a partir de un reloj acumulado, así que
   cambiar el caudal acelera el flujo sin saltos y no hay buffers que reescribir. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const GATES = [
  { l: 'INGESTA', u: 0.14,
    role: 'Captura de eventos y cargas batch desde la operación.',
    svc: { AWS: 'Kinesis · DMS', Azure: 'Event Hubs · Data Factory', GCP: 'Pub/Sub · Dataflow' } },
  { l: 'ALMACENAMIENTO', u: 0.38,
    role: 'Data lake sobre almacenamiento de objetos, con histórico y gobierno.',
    svc: { AWS: 'S3 · Lake Formation', Azure: 'ADLS Gen2 · Purview', GCP: 'Cloud Storage · Dataplex' } },
  { l: 'TRANSFORMACIÓN', u: 0.63,
    role: 'Modelado, calidad y orquestación: el dato queda listo para usarse.',
    svc: { AWS: 'Glue · EMR', Azure: 'Databricks · Synapse', GCP: 'Dataproc · Dataflow' } },
  { l: 'CONSUMO', u: 0.87,
    role: 'Analítica, tableros y modelos sobre el dato ya modelado.',
    svc: { AWS: 'Redshift · QuickSight', Azure: 'Synapse · Power BI', GCP: 'BigQuery · Looker' } }
];

const SX = 3.35, SZ = 2.5;          // extensión de la lámina
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

/* campo de altura compartido con el shader, para colocar los rótulos */
function heightAt(u, v, t) {
  return 0.118 * Math.sin(u * 4.1 + v * 2.3 + t * 1.12)
       + 0.076 * Math.sin(u * 7.3 - v * 3.1 + t * 0.82)
       + 0.044 * Math.sin(u * 11.5 + v * 5.7 - t * 1.38)
       + 0.03 * Math.sin(v * 8.3 + t * 0.6);
}
function gateAt(u) {
  return GATES.reduce((s, g) => s + Math.exp(-Math.pow((u - g.u) / 0.045, 2)), 0);
}

const VERT = `
attribute float aU;               // 0..1 a lo largo de la fibra
attribute float aV;               // 0..1 a lo ancho de la lámina
attribute float aS;               // semilla de fibra
attribute float aR;               // reserva: entra con el caudal
uniform float uClock, uTime, uFill, uLoad, uGate, uPull, uAmp, uMist;
uniform vec2 uMouse;
varying float vA, vC;

float hf(float u, float v, float t){
  return 0.118 * sin(u * 4.1 + v * 2.3 + t * 1.12)
       + 0.076 * sin(u * 7.3 - v * 3.1 + t * 0.82)
       + 0.044 * sin(u * 11.5 + v * 5.7 - t * 1.38)
       + 0.03  * sin(v * 8.3 + t * 0.6);
}
float gate(float u){
  float s = 0.0;
  s += exp(-pow((u - 0.14) / 0.045, 2.0));
  s += exp(-pow((u - 0.38) / 0.045, 2.0));
  s += exp(-pow((u - 0.63) / 0.045, 2.0));
  s += exp(-pow((u - 0.87) / 0.045, 2.0));
  return min(1.0, s);
}

void main(){
  float u = aU, v = aV;
  float t = uClock;
  float g = gate(u);

  // en cada capa la lámina se comprime: el dato pasa por un paso estrecho
  float amp = uAmp * (1.0 - 0.42 * g);
  float y = hf(u, v, t) * amp;

  // ondulación fina propia de cada fibra: el trazo no es una malla rígida
  y += sin(u * 26.0 + aS * 6.28 + t * 1.9) * 0.008 * amp * 8.0 * 0.12;

  float x = (u - 0.5) * SX_;
  float z = (v - 0.5) * SZ_;

  // el cursor levanta la lámina donde señalas
  float dm = length(vec2(x, z) - uMouse);
  float wm = exp(-pow(dm / 0.52, 2.0)) * uPull;
  y += wm * 0.14;

  // pendiente: las crestas que miran hacia arriba son las que brillan
  float h1 = hf(u + 0.012, v, t) * amp;
  float h0 = hf(u - 0.012, v, t) * amp;
  float slope = (h1 - h0) / 0.024;
  float crest = smoothstep(-0.1, 0.55, y / max(0.02, uAmp) + slope * 0.16);

  float a = 0.46 + 1.6 * crest;
  a *= step(aR, 0.62 + 0.38 * uLoad);              // fibras en reserva
  a *= 0.96 + 0.22 * uLoad;

  // bordes disueltos: sin marco visible en ningún lado
  a *= smoothstep(0.0, 0.11, u) * (1.0 - smoothstep(0.87, 1.0, u));
  a *= smoothstep(0.0, 0.16, v) * (1.0 - smoothstep(0.8, 1.0, v));
  a *= mix(1.0, 0.3, pow(v, 1.5)) * uMist;        // profundidad: el fondo se va a bruma

  // la lámina se enciende de izquierda a derecha al bajar la página
  a *= 1.0 - smoothstep(uFill, uFill + 0.07, u);

  // capa en foco
  a *= (uGate < 0.0) ? 1.0 : mix(0.2, 1.0, smoothstep(0.1, 0.02, abs(u - uGate)));
  a += g * (0.16 + 0.2 * uLoad) * step(aR, 0.62 + 0.38 * uLoad)
       * smoothstep(0.0, 0.11, u) * (1.0 - smoothstep(0.87, 1.0, u))
       * (1.0 - smoothstep(0.8, 1.0, v));
  a += wm * 0.3;

  vA = min(1.0, a);
  vC = clamp(crest * 1.05 + g * 0.3, 0.0, 1.0);   // mezcla hacia la cresta
  gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uCrest;
varying float vA, vC;
void main(){
  if (vA <= 0.004) discard;
  gl_FragColor = vec4(mix(uColor, uCrest, vC), vA);
}`;

function goContact(text) {
  const sec = document.querySelector('#tm-contacto');
  const box = document.querySelectorAll('#tm-contacto [data-opt] input')[4];
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  const ta = document.querySelector('#tm-contacto #q7');
  if (ta && !ta.value.trim()) ta.value = text;
  if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 30, behavior: 'smooth' });
}

export function initCloudWaves(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const crestHex = accent.toLowerCase() === '#52c7cf' ? '#80E593' : '#52C7CF';
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
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;padding:4px 8px;' +
      'background:rgba(16,17,17,.88);border:1px solid rgba(255,255,255,.14);cursor:pointer;pointer-events:none;' +
      'font:inherit;white-space:nowrap;opacity:0;transition:opacity .4s';
    b.tabIndex = -1;
    const dot = document.createElement('i');
    dot.style.cssText = 'flex:none;display:block;width:6px;height:6px;border-radius:50%;background:' + crestHex +
      ';transition:transform .3s,box-shadow .3s';
    const t = document.createElement('span');
    t.textContent = G.l;
    t.style.cssText = 'font-family:' + MONO + ';font-size:10px;letter-spacing:.16em;color:#fff';
    b.append(dot, t);
    b.addEventListener('click', () => goContact('Queremos revisar la capa de ' + G.l.toLowerCase() + ' de nuestra arquitectura de datos.'));
    layer.appendChild(b);
    return { G, b, dot, vis: 0, live: false, sx: 0, sy: 0 };
  });

  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:0;top:0;width:min(250px,78%);padding:13px 15px 14px;' +
    'background:rgba(16,17,17,.95);border:1px solid rgba(255,255,255,.14);opacity:0;pointer-events:none;' +
    'transition:opacity .25s;z-index:3';
  card.innerHTML =
    '<p data-k style="margin:0 0 7px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:' + crestHex + '"></p>' +
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
      '<span data-s style="font-family:' + MONO + ';font-size:10.5px;letter-spacing:.12em;color:' + crestHex + '">CAUDAL NORMAL</span>' +
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
      m.dot.style.boxShadow = '0 0 0 5px ' + crestHex + '2e';
      card.style.opacity = '1';
    };
    const off = () => {
      if (hover === m) { hover = null; card.style.opacity = '0'; }
      m.dot.style.transform = 'none';
      m.dot.style.boxShadow = 'none';
    };
    m.b.addEventListener('mouseenter', on); m.b.addEventListener('focus', on);
    m.b.addEventListener('mouseleave', off); m.b.addEventListener('blur', off);
    m._off = off;
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix);
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.insertBefore(canvas, layer);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(0, 0.62, 2.28);            // vista baja: la lámina se lee de canto
    camera.lookAt(0, -0.02, -0.1);

    const lanes = narrowView ? 110 : 230;
    const segs = narrowView ? 84 : 132;
    const count = lanes * segs * 2;
    const pos = new Float32Array(count * 3);       // el shader calcula la posición real
    const aU = new Float32Array(count), aV = new Float32Array(count);
    const aS = new Float32Array(count), aR = new Float32Array(count);
    let i = 0;
    for (let l = 0; l < lanes; l++) {
      const v = l / (lanes - 1);
      const seed = Math.random();
      const res = Math.random();
      for (let s = 0; s < segs; s++) {
        for (const f of [s / segs, (s + 1) / segs]) {
          aU[i] = f; aV[i] = v; aS[i] = seed; aR[i] = res;
          i++;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aU', new THREE.BufferAttribute(aU, 1));
    geo.setAttribute('aV', new THREE.BufferAttribute(aV, 1));
    geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    geo.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

    const U = {
      uClock: { value: 0 }, uTime: { value: 0 }, uFill: { value: still ? 1 : 0 },
      uLoad: { value: 0 }, uGate: { value: -1 }, uPull: { value: 0 },
      uAmp: { value: 1 }, uMist: { value: 1 },
      uMouse: { value: new THREE.Vector2(9, 9) },
      uColor: { value: new THREE.Color(accent).lerp(new THREE.Color('#0B2E24'), 0.22) },
      uCrest: { value: new THREE.Color(crestHex).lerp(new THREE.Color('#ffffff'), 0.22) }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT.replace(/SX_/g, SX.toFixed(3)).replace(/SZ_/g, SZ.toFixed(3)),
      fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.LineSegments(geo, mat));

    let w = 0, h = 0, padL = 0;
    const resize = () => {
      w = host.clientWidth || 560;
      h = host.clientHeight || Math.round(w * 470 / 560);
      // el desborde del lienzo no es zona utilizable: ahí abajo está el copy del hero
      const ml = parseFloat(getComputedStyle(host).marginLeft) || 0;
      padL = Math.max(0, -ml);
      meter.style.left = Math.round(padL) + 'px';
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    let overHost = false, pullT = 0;
    const mouseW = new THREE.Vector2(9, 9);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitV = new THREE.Vector3();
    const onMove = e => {
      const r = host.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hitV)) mouseW.set(hitV.x, hitV.z);
      overHost = true;
    };
    const onLeave = () => {
      overHost = false;
      if (hover) hover._off();
    };

    const fillTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.96 - r.top) / (vh * 0.56));
    };

    const v3 = new THREE.Vector3();
    const place = () => {
      const fill = U.uFill.value, t = U.uClock.value, amp = U.uAmp.value;
      const seen = [];
      marks.map(m => {
        const u = m.G.u, v = 0.3;
        const y = heightAt(u, v, t) * amp * (1 - 0.42 * Math.min(1, gateAt(u)));
        v3.set((u - 0.5) * SX, y + 0.2, (v - 0.5) * SZ).project(camera);
        m.sx = (v3.x * 0.5 + 0.5) * w;
        m.sy = (-v3.y * 0.5 + 0.5) * h;
        return m;
      }).sort((a, b) => a.sy - b.sy).forEach(m => {
        let yy = m.sy;
        for (const p of seen) {
          if (Math.abs(yy - p.y) < 17 && Math.abs(m.sx - p.x) < 200) yy = p.y + 18;
        }
        seen.push({ x: m.sx, y: yy });
        m.sy = yy;
      });

      marks.forEach(m => {
        const right = m.sx > w * 0.7;
        m.b.style.left = Math.round(Math.min(Math.max(m.sx, right ? padL + 110 : padL + 6), right ? w - 6 : w - 110)) + 'px';
        m.b.style.top = Math.round(Math.min(Math.max(m.sy, 12), h - 60)) + 'px';
        m.b.style.transform = right ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
        m.b.style.flexDirection = right ? 'row-reverse' : 'row';
        const reached = clamp01((fill - m.G.u + 0.06) / 0.09);
        const target = (hover && hover !== m ? 0.45 : 1) * reached;
        if (Math.abs(target - m.vis) > 0.01) { m.vis = target; m.b.style.opacity = target.toFixed(2); }
        const live = reached > 0.5;
        if (live !== m.live) {
          m.live = live;
          m.b.style.pointerEvents = live ? 'auto' : 'none';
          m.b.tabIndex = live ? 0 : -1;
        }
        if (hover === m) {
          const right2 = m.sx > w * 0.5;
          card.style.left = Math.round(Math.max(right2 ? m.sx - 14 : m.sx + 14, padL + 6)) + 'px';
          card.style.top = Math.round(Math.min(Math.max(m.sy + 14, 6), Math.max(6, h - 165))) + 'px';
          card.style.transform = right2 ? 'translateX(-100%)' : 'none';
        }
      });
    };

    let count2 = 0, lastT = 0;
    const fmt = n => Math.floor(n).toLocaleString('es-CO');

    const draw = (t, dt) => {
      U.uTime.value = t;
      const load = performance.now() < loadUntil;
      U.uLoad.value += ((load ? 1 : 0) - U.uLoad.value) * 0.05;
      U.uAmp.value += ((load ? 1.32 : 1) - U.uAmp.value) * 0.05;
      const rate = 1 + U.uLoad.value * 0.7;
      U.uClock.value += dt * 0.34 * rate;
      if (!still) U.uFill.value += (fillTarget() - U.uFill.value) * 0.06;
      if (!simple) {
        pullT += ((overHost ? 1 : 0) - pullT) * 0.08;
        U.uPull.value = pullT;
        U.uMouse.value.lerp(mouseW, 0.12);
      }
      U.uGate.value = hover ? hover.G.u : -1;

      count2 += dt * lanes * segs * 0.55 * rate * U.uFill.value;
      nEl.textContent = fmt(count2);
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
      U.uClock.value = 1.6;
      draw(1.6, 0);
      count2 = 68400; nEl.textContent = fmt(count2);
      marks.forEach(m => { m.b.style.transition = 'none'; });
      draw(1.6, 0);
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
  }).catch(e => { console.error('cloud-waves:', e && e.message); });

  return () => {
    stopped = true;
    if (ro) ro.disconnect();
    if (disposer) disposer();
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  };
}
