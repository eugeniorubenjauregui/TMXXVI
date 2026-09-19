/* commerce-ring.js — la cinta de Möbius omnicanal (three.js, ESM por CDN).
   Una sola superficie con medio giro: las transacciones recorren la cinta y a la
   vuelta salen por la otra cara, así que no hay "lado del ecommerce" y "lado de la
   tienda" — hay una sola operación. Los tres canales son franjas a lo ancho de la
   cinta y el giro las intercambia de cara en cada lapso; los ocho sistemas viven
   sobre el recorrido.

   Todo se resuelve en el vertex shader desde un reloj acumulado (uClock), así que
   subir el ritmo no produce saltos y no hay buffers que reescribir por frame. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const CHANNELS = ['ECOMMERCE', 'MARKETPLACE', 'TIENDA'];

const SYSTEMS = [
  { l: 'CATÁLOGO',    ang: 0.30, role: 'Fichas, atributos y publicación en todos los canales' },
  { l: 'PRECIOS',     ang: 1.08, role: 'Listas, reglas y promociones por canal y categoría' },
  { l: 'OMS',         ang: 1.86, role: 'Orquesta la orden desde la captura hasta el cierre' },
  { l: 'INVENTARIO',  ang: 2.64, role: 'Un solo stock disponible para todos los canales' },
  { l: 'PAGOS',       ang: 3.42, role: 'Autoriza, captura y concilia cada transacción' },
  { l: 'ERP',         ang: 4.20, role: 'Sincroniza costos, documentos y contabilidad con la venta' },
  { l: 'FULFILLMENT', ang: 4.98, role: 'Asigna el origen de despacho y libera la entrega' },
  { l: 'POSVENTA',    ang: 5.76, role: 'Devoluciones, cambios y servicio con datos del pedido' }
];

// cada plataforma organiza el mismo flujo distinto
const PLATFORMS = {
  VTEX:          { band: 0.42, ripple: 1.0, gap: 0.0,  rate: 1.0 },
  Shopify:       { band: 0.32, ripple: 0.45, gap: 0.0,  rate: 1.22 },
  commercetools: { band: 0.38, ripple: 0.7, gap: 0.34, rate: 1.05 }
};

const R = 1.0;
const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);

/* el punto de la cinta, misma fórmula que el shader (para colocar rótulos) */
function mobiusPoint(ang, lane, band) {
  const rot = ang * 0.5;                       // medio giro por vuelta completa
  const cx = Math.cos(ang), cz = Math.sin(ang);
  const o = lane * band;
  return [cx * (R + o * Math.cos(rot)), o * Math.sin(rot), cz * (R + o * Math.cos(rot))];
}

const VERT = `
attribute vec4 aP;              // x: fase, y: franja a lo ancho (-1..1), z: reserva, w: velocidad
attribute vec3 aQ;              // x: canal, y: umbral de densidad, z: jitter
uniform float uClock, uTime, uFill, uPull, uBand, uRipple, uGap, uChan,
              uNode, uNodeAng, uDensity, uPeak, uSize;
uniform vec2 uMouse;
varying float vA, vC;

void main(){
  float v = fract(aP.x + uClock * aP.w);
  // oleadas: en pico las transacciones se agrupan y la cinta se tensiona
  v += uPeak * 0.03 * sin(v * 18.85 + uTime * 1.7);
  float ang = v * 6.28318;
  float rot = ang * 0.5;                       // MEDIO giro: de ahí la cinta de Möbius

  float lane = aP.y;
  float band = uBand * mix(1.0, 0.86, uPeak);
  float ripple = sin(ang * 3.0 + uTime * 0.9 + aQ.z * 6.28) * 0.035 * uRipple;
  float o = lane * band + ripple;

  vec3 radial = vec3(cos(ang), 0.0, sin(ang));
  vec3 across = radial * cos(rot) + vec3(0.0, 1.0, 0.0) * sin(rot);
  vec3 p = radial * R_MAJ + across * o;
  p += across * sin(uTime * 0.7 + aQ.z * 6.28) * 0.006;

  // el cursor atrae el tramo que tiene enfrente
  float dm = length(p.xy - uMouse);
  float wm = smoothstep(0.85, 0.0, dm) * uPull;
  p.xy += (uMouse - p.xy) * 0.2 * wm;

  float edge = abs(lane);
  float a = 0.5 + 0.42 * edge;                 // los bordes de la cinta dibujan su silueta

  // canal seleccionado: su franja queda encendida, las otras bajan
  float sel = step(-0.5, uChan) * step(abs(uChan - aQ.x), 0.5);
  a *= (uChan < -0.5) ? 1.0 : mix(0.14, 1.0, sel);

  // commercetools: la cinta se lee por bloques componibles
  float seg = smoothstep(0.0, 0.06, 0.5 - abs(fract(v * 6.0) - 0.5) - uGap * 0.5);
  a *= mix(1.0, seg, step(0.01, uGap));

  // la cinta se enciende por tramos al bajar
  a *= 1.0 - smoothstep(uFill, uFill + 0.035, v);
  a *= 0.72 + 0.28 * uFill;

  // sistema en foco: se ilumina su arco
  float dn = abs(mod(ang - uNodeAng + 3.14159, 6.28318) - 3.14159);
  a += smoothstep(0.42, 0.0, dn) * uNode * 0.5;

  a *= step(aQ.y, uDensity);                   // densidad: en pico entran más
  a += wm * 0.35 + uPeak * 0.1;

  vA = min(1.0, a);
  vC = edge;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (5.2 / max(0.001, -mv.z));
}`;

const FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2;
varying float vA, vC;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.24, 0.5, length(d));
  if (m <= 0.0 || vA <= 0.004) discard;
  gl_FragColor = vec4(mix(uColor, uColor2, clamp(vC * 0.7, 0.0, 1.0)), vA * m);
}`;

function goContact(text) {
  const sec = document.querySelector('#tm-contacto');
  const box = document.querySelectorAll('#tm-contacto [data-opt] input')[2];
  if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
  const ta = document.querySelector('#tm-contacto #q7');
  if (ta && !ta.value.trim()) ta.value = text;
  if (sec) window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - 30, behavior: 'smooth' });
}

export function initCommerceRing(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const narrow = Math.min(host.clientWidth || 560, window.innerWidth) < 640;
  const simple = still || narrow;

  let stopped = false, raf = 0, ro = null, disposer = null;

  host.style.position = 'relative';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  const marks = SYSTEMS.map(s => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', s.l + '. ' + s.role + '. Ir al formulario de contacto');
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:7px;' +
      'padding:4px 8px;margin:0;background:rgba(16,17,17,.9);border:1px solid rgba(255,255,255,.14);' +
      'cursor:pointer;pointer-events:none;font:inherit;white-space:nowrap;opacity:0;transition:opacity .35s';
    b.tabIndex = -1;
    const dot = document.createElement('i');
    dot.style.cssText = 'flex:none;display:block;width:6px;height:6px;border-radius:50%;background:' + accent +
      ';transition:transform .3s,box-shadow .3s';
    const t = document.createElement('span');
    t.textContent = s.l;
    t.style.cssText = 'font-family:' + MONO + ';font-size:9.5px;letter-spacing:.14em;color:#fff';
    b.append(dot, t);
    b.addEventListener('click', () => goContact('Queremos revisar la integración con ' + s.l.toLowerCase() + '.'));
    layer.appendChild(b);
    return { s, b, dot, t, vis: 0, live: false, sx: 0, sy: 0 };
  });

  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:0;top:0;width:min(250px,74%);padding:13px 15px 14px;' +
    'background:rgba(16,17,17,.95);border:1px solid rgba(255,255,255,.14);opacity:0;pointer-events:none;' +
    'transition:opacity .25s;z-index:3';
  card.innerHTML =
    '<p data-k style="margin:0 0 7px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:' + accent + '"></p>' +
    '<p data-r style="margin:0;font-size:13.5px;line-height:1.45;color:#fff;text-wrap:pretty"></p>';
  layer.appendChild(card);
  const cardK = card.querySelector('[data-k]'), cardR = card.querySelector('[data-r]');

  const meter = document.createElement('div');
  meter.style.cssText = 'position:absolute;left:0;bottom:0;pointer-events:none';
  meter.innerHTML =
    '<p style="margin:0;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:rgba(255,255,255,.62)">TRANSACCIONES PROCESADAS</p>' +
    '<p style="margin:5px 0 0;display:flex;align-items:baseline;gap:10px">' +
      '<span data-n style="font-family:' + MONO + ';font-size:21px;color:#fff">0</span>' +
      '<span data-s style="font-family:' + MONO + ';font-size:10.5px;letter-spacing:.12em;color:' + accent + '">FLUJO NORMAL</span>' +
    '</p>';
  layer.appendChild(meter);
  const nEl = meter.querySelector('[data-n]'), sEl = meter.querySelector('[data-s]');

  let hover = null;
  marks.forEach(m => {
    const on = () => {
      hover = m;
      cardK.textContent = m.s.l;
      cardR.textContent = m.s.role;
      m.dot.style.transform = 'scale(1.3)';
      m.dot.style.boxShadow = '0 0 0 5px ' + accent + '2e';
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

  /* ---------- controles de la página ---------- */
  let channel = -1, platform = 'VTEX', peakUntil = 0;
  const chChips = Array.from(document.querySelectorAll('[data-channel]'));
  const pfChips = Array.from(document.querySelectorAll('[data-platform]'));
  const peakBtn = document.querySelector('[data-peak]');

  const style = (c, on) => {
    c.style.background = on ? accent : 'transparent';
    c.style.color = on ? '#141414' : 'rgba(255,255,255,.82)';
    c.style.borderColor = on ? accent : 'rgba(255,255,255,.22)';
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  const paint = () => {
    chChips.forEach(c => style(c, CHANNELS.indexOf(c.dataset.channel) === channel));
    pfChips.forEach(c => style(c, c.dataset.platform === platform));
  };
  chChips.forEach(c => c.addEventListener('click', () => {
    const i = CHANNELS.indexOf(c.dataset.channel);
    channel = channel === i ? -1 : i;
    paint();
  }));
  pfChips.forEach(c => c.addEventListener('click', () => { platform = c.dataset.platform; paint(); }));
  if (peakBtn) peakBtn.addEventListener('click', () => { peakUntil = performance.now() + 7000; });
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
    camera.position.set(0, 2.05, 4.5);
    camera.lookAt(0, 0, 0);

    const N = narrow ? 10000 : 26000;
    const aP = new Float32Array(N * 4), aQ = new Float32Array(N * 3), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const ch = i % 3;                                  // tres canales, una sola cinta
      aP[i * 4] = Math.random();
      // franja del canal a lo ancho de la cinta, con algo de dispersión
      aP[i * 4 + 1] = [-0.68, 0, 0.68][ch] + (Math.random() + Math.random() - 1) * 0.24;
      aP[i * 4 + 2] = Math.random();
      aP[i * 4 + 3] = 0.9 + Math.random() * 0.22;
      aQ[i * 3] = ch;
      aQ[i * 3 + 1] = Math.random();                     // umbral de densidad
      aQ[i * 3 + 2] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(aP, 4));
    geo.setAttribute('aQ', new THREE.BufferAttribute(aQ, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.2);

    const c1 = new THREE.Color(accent);
    const c2 = c1.clone().lerp(new THREE.Color('#ffffff'), 0.5);
    const U = {
      uClock: { value: 0 }, uTime: { value: 0 }, uFill: { value: still ? 1 : 0 },
      uPull: { value: 0 }, uBand: { value: PLATFORMS.VTEX.band }, uRipple: { value: PLATFORMS.VTEX.ripple },
      uGap: { value: 0 }, uChan: { value: -1 }, uNode: { value: 0 }, uNodeAng: { value: 0 },
      uDensity: { value: 0.6 }, uPeak: { value: 0 }, uSize: { value: Math.max(2.4, pix * 1.75) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColor: { value: c1 }, uColor2: { value: c2 }
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT.replace(/R_MAJ/g, R.toFixed(3)), fragmentShader: FRAG, uniforms: U,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    // la cinta gira despacio: los ocho sistemas pasan al frente por turnos
    const band = new THREE.Group();
    scene.add(band);
    const pts = new THREE.Points(geo, mat);
    band.add(pts);

    // los dos bordes de la cinta: una sola curva continua que da dos vueltas
    const edgeGeo = (() => {
      const S = 420, v = [];
      for (let k = 0; k < S; k++) {
        for (const kk of [k, k + 1]) {
          const ang = (kk / S) * Math.PI * 4;            // dos lapsos: el borde es uno solo
          const p = mobiusPoint(ang, 1, PLATFORMS.VTEX.band);
          v.push(p[0], p[1], p[2]);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
      return g;
    })();
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false });
    const edge = new THREE.LineSegments(edgeGeo, edgeMat);
    band.add(edge);

    let w = 0, h = 0, padL = 0;
    const resize = () => {
      w = host.clientWidth || 560;
      h = host.clientHeight || Math.round(w * 470 / 560);
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
    const onLeave = () => {
      overHost = false;
      if (hover) hover._off();
    };

    const fillTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.98 - r.top) / (vh * 0.62));
    };

    const v3 = new THREE.Vector3();
    const place = () => {
      const bandW = U.uBand.value;
      const seen = [];
      marks.map(m => {
        const p = mobiusPoint(m.s.ang, 1.45, bandW);
        v3.set(p[0], p[1], p[2]).applyMatrix4(band.matrixWorld);
        const front = v3.z;
        v3.project(camera);
        m.sx = (v3.x * 0.5 + 0.5) * w;
        m.sy = (-v3.y * 0.5 + 0.5) * h;
        m.front = front;
        return m;
      }).sort((a, b) => a.sy - b.sy).forEach(m => {
        let yy = m.sy;
        for (const p of seen) {
          if (Math.abs(yy - p.y) < 16 && Math.abs(m.sx - p.x) < 170) yy = p.y + 17;
        }
        seen.push({ x: m.sx, y: yy });
        m.sy = yy;
      });

      marks.forEach(m => {
        const vis = clamp01((m.front + 0.25) / 0.5) * clamp01(U.uFill.value * 1.4 - 0.25);
        const target = hover && hover !== m ? vis * 0.45 : vis;
        if (Math.abs(target - m.vis) > 0.01) { m.vis = target; m.b.style.opacity = target.toFixed(2); }
        const live = vis > 0.5;
        if (live !== m.live) {
          m.live = live;
          m.b.style.pointerEvents = live ? 'auto' : 'none';
          m.b.tabIndex = live ? 0 : -1;
        }
        const right = m.sx > w * 0.62;
        m.b.style.left = Math.round(Math.min(Math.max(m.sx, right ? padL + 108 : padL + 6), right ? w - 6 : w - 108)) + 'px';
        m.b.style.top = Math.round(Math.min(Math.max(m.sy, 12), h - 58)) + 'px';
        m.b.style.transform = right ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
        m.b.style.flexDirection = right ? 'row-reverse' : 'row';
        if (hover === m) {
          const right2 = m.sx > w * 0.5;
          card.style.left = Math.round(Math.max(right2 ? m.sx - 16 : m.sx + 16, padL + 6)) + 'px';
          card.style.top = Math.round(Math.min(Math.max(m.sy + 14, 6), Math.max(6, h - 120))) + 'px';
          card.style.transform = right2 ? 'translateX(-100%)' : 'none';
        }
      });
    };

    let count = 0, lastT = 0, spin = 1;
    const fmt = n => Math.floor(n).toLocaleString('es-CO');

    const draw = (t, dt) => {
      U.uTime.value = t;
      const peak = performance.now() < peakUntil;
      U.uPeak.value += ((peak ? 1 : 0) - U.uPeak.value) * 0.06;
      const P = PLATFORMS[platform] || PLATFORMS.VTEX;
      U.uBand.value += (P.band - U.uBand.value) * 0.07;
      U.uRipple.value += (P.ripple - U.uRipple.value) * 0.07;
      U.uGap.value += (P.gap - U.uGap.value) * 0.07;
      U.uDensity.value += ((peak ? 1 : 0.6) - U.uDensity.value) * 0.05;
      U.uChan.value = channel;
      const rate = P.rate * (1 + U.uPeak.value * 0.7);
      U.uClock.value += dt * 0.115 * rate;

      if (!still) U.uFill.value += (fillTarget() - U.uFill.value) * 0.07;
      if (!simple) {
        pullT += ((overHost ? 1 : 0) - pullT) * 0.08;
        U.uPull.value = pullT;
        U.uMouse.value.x += (tmx - U.uMouse.value.x) * 0.12;
        U.uMouse.value.y += (tmy - U.uMouse.value.y) * 0.12;
      }
      U.uNode.value += ((hover ? 1 : 0) - U.uNode.value) * 0.12;
      if (hover) U.uNodeAng.value = hover.s.ang;

      // al enfocar un sistema el giro casi se detiene
      spin += ((hover ? 0.12 : 1) - spin) * 0.05;
      band.rotation.y += dt * 0.135 * spin;
      band.rotation.x = -0.06 + Math.sin(t * 0.09) * 0.03;
      band.updateMatrixWorld();
      edgeMat.opacity = 0.16 * U.uFill.value * (hover ? 0.5 : 1);

      count += dt * N * 0.115 * rate * U.uDensity.value * (channel < 0 ? 1 : 0.34);
      nEl.textContent = fmt(count);
      sEl.textContent = U.uPeak.value > 0.5 ? 'PICO DE DEMANDA · ABSORBIDO' : 'FLUJO NORMAL';

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
      U.uClock.value = 0.4;
      draw(3.2, 0);
      count = 12480; nEl.textContent = fmt(count);
      marks.forEach(m => { m.b.style.transition = 'none'; });
      draw(3.2, 0);
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
      geo.dispose(); mat.dispose(); edgeGeo.dispose(); edgeMat.dispose(); renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }).catch(e => { console.error('commerce-ring:', e && e.message); });

  return () => {
    stopped = true;
    if (ro) ro.disconnect();
    if (disposer) disposer();
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  };
}
