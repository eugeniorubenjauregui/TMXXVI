/* rhizome.js — la operación como rizoma (three.js, ESM por CDN).
   Una red sin jerarquía: cinco núcleos de solución y un núcleo central enmarañados
   entre sí por filamentos orgánicos que se ramifican en uniones, puntas y pelos.
   Nada cuelga de un solo eje: cada núcleo se conecta con sus vecinos y con la
   maraña fina, así que mover uno mueve toda la red.

   La simulación es un sistema de resortes en CPU (pocos cientos de nodos): permite
   arrastrar cualquier núcleo y que la red se reacomode sola. Los filamentos se
   redibujan cada frame como curvas con ondulación propia — de ahí el trazo de tinta. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const SOL = [
  { l: 'STRATEGY & ADVISORY', href: 'strategy-advisory.html',
    desc: 'Diagnóstico, prioridades y hoja de ruta antes de construir.' },
  { l: 'AI & CUSTOM SOLUTIONS', href: 'ai-custom-solutions.html',
    desc: 'Agentes conectados a los sistemas donde vive la operación.' },
  { l: 'COMMERCE SOLUTIONS', href: 'commerce-solutions.html',
    desc: 'Plataforma, integraciones y omnicanalidad sobre un solo inventario.' },
  { l: 'RETAIL GROWTH', href: 'retail-growth.html',
    desc: 'SEO, GEO, AEO, CRO y paid media sobre el mismo funnel.' },
  { l: 'CLOUD & DATA', href: 'cloud-data.html',
    desc: 'Infraestructura y datos que sostienen todo lo demás.' }
];

const MONO = "'IBM Plex Mono',ui-monospace,monospace";
const clamp01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
const SEG = 9;                       // segmentos por filamento

const LINE_VERT = `
attribute float aA;                  // alfa base del filamento
attribute float aT;                  // 0..1 a lo largo del filamento
attribute float aS;                  // solución a la que pertenece (-1 neutro)
uniform float uTime, uActive, uBuild;
varying float vA;
void main(){
  float pulse = fract(uTime * 0.16 + aS * 0.21 + aA * 3.7);
  float d = abs(aT - pulse);
  d = min(d, 1.0 - d);
  float glow = exp(-pow(d / 0.13, 2.0));
  float sel = (uActive < -0.5) ? 1.0 : ((abs(uActive - aS) < 0.5) ? 1.35 : 0.3);
  vA = aA * (0.85 + glow * 1.5) * sel * uBuild;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LINE_FRAG = `
precision mediump float;
uniform vec3 uColor;
varying float vA;
void main(){
  if (vA <= 0.004) discard;
  gl_FragColor = vec4(uColor, min(1.0, vA));
}`;

const PT_VERT = `
attribute float aA;
attribute float aS;
attribute float aK;                  // 0 maraña de núcleo, 1 nodo de la red
uniform float uTime, uActive, uBuild, uSize;
varying float vA, vK;
void main(){
  float sel = (uActive < -0.5) ? 1.0 : ((abs(uActive - aS) < 0.5) ? 1.4 : 0.34);
  vA = aA * sel * uBuild;
  vK = aK;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (aK > 0.5 ? 1.25 : 0.92);
}`;

const PT_FRAG = `
precision mediump float;
uniform vec3 uColor, uColor2;
varying float vA, vK;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.26, 0.5, length(d));
  if (m <= 0.0 || vA <= 0.004) discard;
  gl_FragColor = vec4(mix(uColor2, uColor, clamp(vK, 0.0, 1.0)), vA * m);
}`;

export function initRhizome(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const narrow = Math.min(host.clientWidth || 540, window.innerWidth) < 640;

  let stopped = false, raf = 0, ro = null, disposer = null;

  host.style.position = 'relative';
  host.style.touchAction = 'pan-y';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  host.appendChild(layer);

  const chip = (text, accentText) => {
    const p = document.createElement('p');
    p.textContent = text;
    p.style.cssText = 'position:absolute;left:0;top:0;margin:0;padding:5px 9px;font-family:' + MONO + ';' +
      'font-size:9.5px;letter-spacing:.18em;color:' + (accentText ? accent : '#fff') + ';' +
      'background:rgba(16,17,17,.9);border:1px solid rgba(255,255,255,.14);opacity:0;white-space:nowrap;' +
      'transform:translate(-50%,-50%)';
    layer.appendChild(p);
    return p;
  };
  const coreLabel = chip('TU OPERACIÓN', false);

  const marks = SOL.map((P, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', P.l + '. ' + P.desc);
    b.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:7px;padding:4px 8px;' +
      'background:rgba(16,17,17,.9);border:1px solid rgba(255,255,255,.14);cursor:grab;pointer-events:none;' +
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
    return { P, i, b, dot, vis: 0, live: false, sx: 0, sy: 0 };
  });

  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:0;top:0;width:min(244px,80%);padding:13px 15px 14px;' +
    'background:rgba(16,17,17,.95);border:1px solid rgba(255,255,255,.14);opacity:0;pointer-events:none;' +
    'transition:opacity .25s;z-index:4';
  card.innerHTML =
    '<p data-k style="margin:0 0 7px;font-family:' + MONO + ';font-size:9.5px;letter-spacing:.18em;color:' + accent + '"></p>' +
    '<p data-r style="margin:0 0 11px;font-size:13.5px;line-height:1.45;color:#fff;text-wrap:pretty"></p>' +
    '<a data-a href="#" style="display:inline-flex;align-items:center;gap:8px;font-family:' + MONO + ';font-size:10px;' +
    'letter-spacing:.14em;color:' + accent + ';border-bottom:1px solid ' + accent + ';padding-bottom:3px">VER SOLUCIÓN →</a>';
  layer.appendChild(card);
  const cardK = card.querySelector('[data-k]'), cardR = card.querySelector('[data-r]'), cardA = card.querySelector('[data-a]');

  const hint = document.querySelector('[data-rhizome-hint]');
  if (hint) hint.textContent = still ? '5 SOLUCIONES · 1 OPERACIÓN' : 'ARRASTRA LOS NÚCLEOS';

  let hover = null;
  marks.forEach(m => {
    const on = () => {
      hover = m;
      cardK.textContent = m.P.l;
      cardR.textContent = m.P.desc;
      cardA.setAttribute('href', m.P.href);
      card.style.opacity = '1';
      m.dot.style.transform = 'scale(1.5)';
      m.dot.style.boxShadow = '0 0 0 5px ' + accent + '2e';
    };
    const off = () => {
      if (hover === m) { hover = null; card.style.opacity = '0'; }
      m.dot.style.transform = 'none';
      m.dot.style.boxShadow = 'none';
    };
    m.b.addEventListener('mouseenter', on);
    m.b.addEventListener('focus', on);
    m.b.addEventListener('mouseleave', off);
    m.b.addEventListener('blur', off);
    m._on = on; m._off = off;
  });

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix);
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:grab';
    host.insertBefore(canvas, layer);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 4.05);
    camera.lookAt(0, 0, 0);

    /* ---------- la red ---------- */
    // kind: 0 núcleo central, 1 núcleo de solución, 2 unión, 3 punta, 4 pelo
    const nodes = [], edges = [];
    const addNode = (x, y, kind, sol, m) => {
      nodes.push({ x, y, z: (Math.random() - 0.5) * 0.06, vx: 0, vy: 0, kind, sol, m: m || 1, fx: 0, fy: 0 });
      return nodes.length - 1;
    };
    const addEdge = (a, b, sol, a0) => {
      const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y;
      edges.push({ a, b, rest: Math.hypot(dx, dy), sol, alpha: a0, seed: Math.random() * 6.28,
        wob: 0.08 + Math.random() * 0.14 });
    };

    const core = addNode(0, 0, 0, -1, 14);
    const hubs = SOL.map((P, i) => {
      const th = -Math.PI / 2 + (i / SOL.length) * Math.PI * 2 + 0.22;
      const r = 0.4 + (i % 2) * 0.08;
      return addNode(Math.cos(th) * r * 1.22, Math.sin(th) * r, 1, i, 5);
    });
    hubs.forEach(hi => addEdge(core, hi, nodes[hi].sol, 0.5));
    // anillo + cuerdas: la red se sostiene entre pares, no desde el centro
    hubs.forEach((hi, i) => addEdge(hi, hubs[(i + 1) % hubs.length], nodes[hi].sol, 0.42));
    addEdge(hubs[0], hubs[2], 0, 0.3);
    addEdge(hubs[1], hubs[3], 1, 0.3);
    addEdge(hubs[2], hubs[4], 2, 0.3);

    // maraña fina: uniones alrededor de cada núcleo, puntas y pelos
    const junctions = [];
    hubs.forEach((hi, si) => {
      const n = narrow ? 4 : 6;
      for (let k = 0; k < n; k++) {
        const th = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 0.24;
        const j = addNode(nodes[hi].x + Math.cos(th) * r, nodes[hi].y + Math.sin(th) * r, 2, si, 1);
        addEdge(hi, j, si, 0.3);
        junctions.push(j);
        const tips = 2 + Math.floor(Math.random() * 3);
        for (let q = 0; q < tips; q++) {
          const tth = th + (Math.random() - 0.5) * 2.1;
          const tr = 0.12 + Math.random() * 0.18;
          const tp = addNode(nodes[j].x + Math.cos(tth) * tr, nodes[j].y + Math.sin(tth) * tr, 3, si, 0.55);
          addEdge(j, tp, si, 0.22);
          for (let hh = 0; hh < 2; hh++) {
            const hth = tth + (Math.random() - 0.5) * 2.4;
            const hr = 0.05 + Math.random() * 0.09;
            const hp = addNode(nodes[tp].x + Math.cos(hth) * hr, nodes[tp].y + Math.sin(hth) * hr, 4, si, 0.3);
            addEdge(tp, hp, si, 0.17);
          }
        }
      }
    });
    // cruces entre uniones de distintas soluciones: el rizoma no tiene ramas aisladas
    for (let k = 0; k < (narrow ? 18 : 34); k++) {
      const a = junctions[Math.floor(Math.random() * junctions.length)];
      const b = junctions[Math.floor(Math.random() * junctions.length)];
      if (a === b || nodes[a].sol === nodes[b].sol) continue;
      if (Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) > 0.95) continue;
      addEdge(a, b, -1, 0.2);
    }

    /* ---------- geometría de filamentos ---------- */
    const lineVerts = edges.length * SEG * 2;
    const lPos = new Float32Array(lineVerts * 3);
    const lA = new Float32Array(lineVerts), lT = new Float32Array(lineVerts), lS = new Float32Array(lineVerts);
    let vi = 0;
    edges.forEach(e => {
      for (let k = 0; k < SEG; k++) {
        for (const f of [k / SEG, (k + 1) / SEG]) {
          lA[vi] = e.alpha; lT[vi] = f; lS[vi] = e.sol;
          vi++;
        }
      }
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lineGeo.setAttribute('aA', new THREE.BufferAttribute(lA, 1));
    lineGeo.setAttribute('aT', new THREE.BufferAttribute(lT, 1));
    lineGeo.setAttribute('aS', new THREE.BufferAttribute(lS, 1));
    lineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const lineU = {
      uTime: { value: 0 }, uActive: { value: -1 }, uBuild: { value: still ? 1 : 0 },
      uColor: { value: new THREE.Color(accent) }
    };
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: lineU,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.LineSegments(lineGeo, lineMat));

    /* ---------- marañas y nodos ---------- */
    const tangle = [];                       // puntos que orbitan su núcleo
    const per = narrow ? 260 : 460;
    const coreTangle = narrow ? 380 : 680;
    [[core, coreTangle, 0.125]].concat(hubs.map(h => [h, per, 0.095])).forEach(([ni, cnt, rad]) => {
      for (let k = 0; k < cnt; k++) {
        tangle.push({ n: ni, r: (0.35 + Math.pow(Math.random(), 0.7) * 0.65) * rad,
          th: Math.random() * Math.PI * 2,
          w: (0.2 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1),
          sq: 2 + Math.floor(Math.random() * 4), ph: Math.random() * 6.28,
          a: 0.16 + Math.random() * 0.26 });
      }
    });
    const netNodes = nodes.map((n, i) => i).filter(i => nodes[i].kind >= 2);
    const ptCount = tangle.length + netNodes.length;
    const pPos = new Float32Array(ptCount * 3);
    const pA = new Float32Array(ptCount), pS = new Float32Array(ptCount), pK = new Float32Array(ptCount);
    tangle.forEach((t, i) => { pA[i] = t.a; pS[i] = nodes[t.n].sol; pK[i] = 0; });
    netNodes.forEach((ni, i) => {
      const k = tangle.length + i;
      pA[k] = nodes[ni].kind === 2 ? 0.8 : (nodes[ni].kind === 3 ? 0.5 : 0.3);
      pS[k] = nodes[ni].sol; pK[k] = 1;
    });
    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    ptGeo.setAttribute('aA', new THREE.BufferAttribute(pA, 1));
    ptGeo.setAttribute('aS', new THREE.BufferAttribute(pS, 1));
    ptGeo.setAttribute('aK', new THREE.BufferAttribute(pK, 1));
    ptGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const coreColor = new THREE.Color('#52C7CF');
    const ptU = {
      uTime: { value: 0 }, uActive: { value: -1 }, uBuild: { value: still ? 1 : 0 },
      uSize: { value: Math.max(1.9, pix * 1.4) },
      uColor: { value: new THREE.Color(accent) },
      uColor2: { value: coreColor }
    };
    const ptMat = new THREE.ShaderMaterial({
      vertexShader: PT_VERT, fragmentShader: PT_FRAG, uniforms: ptU,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
    });
    scene.add(new THREE.Points(ptGeo, ptMat));

    let w = 0, h = 0, padL = 0;
    const resize = () => {
      w = host.clientWidth || 540;
      h = host.clientHeight || Math.round(w * 470 / 540);
      // el desborde del lienzo no es zona utilizable: ahí abajo está el copy del hero
      const ml = parseFloat(getComputedStyle(host).marginLeft) || 0;
      padL = Math.max(0, -ml);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    /* ---------- arrastre ---------- */
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitV = new THREE.Vector3();
    const toWorld = (cxp, cyp) => {
      const r = host.getBoundingClientRect();
      ndc.set(((cxp - r.left) / Math.max(1, r.width)) * 2 - 1, -((cyp - r.top) / Math.max(1, r.height)) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, hitV) ? hitV : null;
    };

    let drag = null, mouseW = null, overHost = false;
    const grabbable = [core].concat(hubs);
    const pick = p => {
      let best = -1, bd = 0.42;
      grabbable.forEach(ni => {
        const d = Math.hypot(nodes[ni].x - p.x, nodes[ni].y - p.y);
        if (d < bd) { bd = d; best = ni; }
      });
      return best;
    };
    const onDown = e => {
      const p = toWorld(e.clientX, e.clientY);
      if (!p) return;
      const ni = pick(p);
      if (ni < 0) return;
      drag = { ni, dx: nodes[ni].x - p.x, dy: nodes[ni].y - p.y };
      canvas.style.cursor = 'grabbing';
      if (host.setPointerCapture && e.pointerId != null) host.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = e => {
      overHost = true;
      const p = toWorld(e.clientX, e.clientY);
      if (!p) return;
      mouseW = { x: p.x, y: p.y };
      if (drag) { drag.tx = p.x + drag.dx; drag.ty = p.y + drag.dy; }
      else canvas.style.cursor = pick(p) >= 0 ? 'grab' : 'default';
    };
    const onUp = () => { drag = null; canvas.style.cursor = 'grab'; };
    const onLeave = () => { overHost = false; mouseW = null; };

    // los chips también arrastran su núcleo
    marks.forEach(m => m.b.addEventListener('pointerdown', e => {
      const ni = hubs[m.i];
      const p = toWorld(e.clientX, e.clientY);
      drag = { ni, dx: p ? nodes[ni].x - p.x : 0, dy: p ? nodes[ni].y - p.y : 0 };
      m.b.style.cursor = 'grabbing';
      if (m.b.setPointerCapture && e.pointerId != null) m.b.setPointerCapture(e.pointerId);
      e.preventDefault();
    }));
    marks.forEach(m => m.b.addEventListener('pointerup', () => { drag = null; m.b.style.cursor = 'grab'; }));
    marks.forEach(m => m.b.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = toWorld(e.clientX, e.clientY);
      if (p) { drag.tx = p.x + drag.dx; drag.ty = p.y + drag.dy; }
    }));

    /* ---------- física ---------- */
    const K = 0.12, DAMP = 0.88, CENTER = 0.022, REPEL = 0.022;
    const step = (dt, t) => {
      const f = Math.min(2.4, dt * 60);
      nodes.forEach(n => { n.fx = 0; n.fy = 0; });
      edges.forEach(e => {
        const A = nodes[e.a], B = nodes[e.b];
        let dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        const s = (d - e.rest) * K;
        dx /= d; dy /= d;
        A.fx += dx * s; A.fy += dy * s;
        B.fx -= dx * s; B.fy -= dy * s;
      });
      // los núcleos se repelen para que la maraña no se cierre sobre sí misma
      for (let i = 0; i < grabbable.length; i++) {
        for (let j = i + 1; j < grabbable.length; j++) {
          const A = nodes[grabbable[i]], B = nodes[grabbable[j]];
          let dx = B.x - A.x, dy = B.y - A.y;
          const d2 = Math.max(0.05, dx * dx + dy * dy);
          const s = REPEL / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          A.fx -= dx * s; A.fy -= dy * s;
          B.fx += dx * s; B.fy += dy * s;
        }
      }
      nodes.forEach((n, i) => {
        if (drag && drag.ni === i && drag.tx != null) {
          n.vx = 0; n.vy = 0;
          n.x += (drag.tx - n.x) * 0.45;
          n.y += (drag.ty - n.y) * 0.45;
          return;
        }
        n.fx += -n.x * CENTER * n.m;
        n.fy += -n.y * CENTER * n.m;
        const BX = 1.04, BY = 0.74;
        // el correctivo de borde es proporcional al desborde: si algo (una caída
        // de fps, un frame con dt grande) empuja un nodo bien lejos del límite,
        // la fuerza de vuelta también crece sin techo y con el integrador
        // explícito eso diverge (rebota cada vez más lejos en vez de asentarse).
        // Se limita cuánto desborde "cuenta" para que el correctivo nunca supere
        // un empujón razonable, sea cual sea la distancia real.
        if (Math.abs(n.x) > BX) n.fx -= Math.sign(n.x) * Math.min(Math.abs(n.x) - BX, 0.3) * 0.9 * n.m;
        if (Math.abs(n.y) > BY) n.fy -= Math.sign(n.y) * Math.min(Math.abs(n.y) - BY, 0.3) * 0.9 * n.m;
        // deriva lenta: el trazo nunca queda del todo quieto
        if (n.kind >= 2) {
          n.fx += Math.sin(t * 0.5 + i * 1.7) * 0.0022;
          n.fy += Math.cos(t * 0.43 + i * 2.3) * 0.0022;
        }
        n.vx = (n.vx + n.fx / n.m * f) * DAMP;
        n.vy = (n.vy + n.fy / n.m * f) * DAMP;
        n.x += n.vx * f;
        n.y += n.vy * f;
      });
    };

    /* ---------- dibujo ---------- */
    const writeLines = t => {
      let k = 0;
      edges.forEach(e => {
        const A = nodes[e.a], B = nodes[e.b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy) || 1e-4;
        const nx = -dy / len, ny = dx / len;
        const amp = Math.min(len * e.wob, 0.075);
        const pt = f => {
          const bend = Math.sin(f * Math.PI) * Math.sin(e.seed + t * 0.35 + f * 3.4) * amp;
          const bend2 = Math.sin(f * Math.PI * 2) * Math.cos(e.seed * 1.7 + t * 0.22) * amp * 0.45;
          return [A.x + dx * f + nx * (bend + bend2), A.y + dy * f + ny * (bend + bend2),
            A.z + (B.z - A.z) * f];
        };
        for (let s = 0; s < SEG; s++) {
          for (const f of [s / SEG, (s + 1) / SEG]) {
            const p = pt(f);
            lPos[k * 3] = p[0]; lPos[k * 3 + 1] = p[1]; lPos[k * 3 + 2] = p[2];
            k++;
          }
        }
      });
      lineGeo.attributes.position.needsUpdate = true;
    };

    const writePoints = t => {
      tangle.forEach((g, i) => {
        const n = nodes[g.n];
        const th = g.th + t * g.w;
        // radio modulado: la maraña se lee como garabato, no como disco
        // lissajous: cada punto recorre su propio bucle dentro del ovillo
        const rr = g.r * (0.88 + 0.12 * Math.sin(th * g.sq + g.ph));
        pPos[i * 3] = n.x + Math.cos(th) * rr + Math.sin(th * g.sq + g.ph) * g.r * 0.1;
        pPos[i * 3 + 1] = n.y + Math.sin(th * 0.97 + g.ph) * rr * 0.92 + Math.cos(th * g.sq) * g.r * 0.1;
        pPos[i * 3 + 2] = n.z + Math.sin(th * 1.7) * 0.02;
      });
      netNodes.forEach((ni, i) => {
        const k = tangle.length + i, n = nodes[ni];
        pPos[k * 3] = n.x; pPos[k * 3 + 1] = n.y; pPos[k * 3 + 2] = n.z;
      });
      ptGeo.attributes.position.needsUpdate = true;
    };

    const v3 = new THREE.Vector3();
    const toScreen = (x, y, z) => {
      v3.set(x, y, z).project(camera);
      return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h];
    };

    const place = () => {
      const k = lineU.uBuild.value;
      const [ccx, ccy] = toScreen(nodes[core].x, nodes[core].y - 0.26, nodes[core].z);
      coreLabel.style.opacity = clamp01(k * 2).toFixed(2);
      coreLabel.style.left = Math.round(Math.max(ccx, padL + 60)) + 'px';
      coreLabel.style.top = Math.round(ccy) + 'px';

      const seen = [];
      marks.map(m => {
        const n = nodes[hubs[m.i]];
        const sc = toScreen(n.x, n.y - 0.2, n.z);
        // el des-colisionador tiene que trabajar sobre la MISMA posición que
        // termina en pantalla: si calculaba sobre sc[0] crudo y el render de
        // más abajo lo clampeaba al borde (right ? w-6 : w-100), dos chips que
        // el proyector ponía lejos podían terminar pegadas al mismo borde sin
        // que el des-colisionador se enterara — de ahí las superposiciones.
        const right = sc[0] > w * 0.6;
        m.right = right;
        m.sx = Math.min(Math.max(sc[0], right ? padL + 100 : padL + 6), right ? w - 6 : w - 100);
        // mismo motivo que sx: si el des-colisionador empuja "yy" más allá de lo
        // que el render final permite (12..h-12), el clamp de abajo puede volver
        // a juntar dos chips que el des-colisionador ya había separado.
        m.sy = Math.min(Math.max(sc[1], 12), h - 12);
        return m;
      }).sort((a, b) => a.sy - b.sy).forEach(m => {
        // empuja hacia abajo hasta no chocar con ninguna chip ya ubicada — un solo
        // pase con un salto menor a la altura real de la chip (23px) dejaba
        // superposiciones residuales cuando 2+ etiquetas caían cerca; ahora repite
        // hasta estabilizar y el salto (28px) sí excede esa altura.
        let yy = m.sy, moved = true;
        while (moved) {
          moved = false;
          for (const p of seen) {
            if (Math.abs(yy - p.y) < 28 && Math.abs(m.sx - p.x) < 210) { yy = p.y + 28; moved = true; }
          }
        }
        seen.push({ x: m.sx, y: yy });
        m.sy = yy;
      });

      marks.forEach(m => {
        const right = m.right;
        m.b.style.left = Math.round(m.sx) + 'px';
        m.b.style.top = Math.round(m.sy) + 'px';
        m.b.style.transform = right ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
        m.b.style.flexDirection = right ? 'row-reverse' : 'row';
        const target = (hover && hover !== m ? 0.45 : 1) * clamp01(k * 1.6 - 0.2);
        if (Math.abs(target - m.vis) > 0.01) { m.vis = target; m.b.style.opacity = target.toFixed(2); }
        const live = k > 0.5;
        if (live !== m.live) {
          m.live = live;
          m.b.style.pointerEvents = live ? 'auto' : 'none';
          m.b.tabIndex = live ? 0 : -1;
        }
      });

      if (hover) {
        const right = hover.sx > w * 0.5;
        card.style.left = Math.round(Math.max(right ? hover.sx - 18 : hover.sx + 18, padL + 6)) + 'px';
        card.style.top = Math.round(Math.min(Math.max(hover.sy + 14, 6), Math.max(6, h - 150))) + 'px';
        card.style.transform = right ? 'translateX(-100%)' : 'none';
      }
    };

    const buildTarget = () => {
      const r = host.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      return clamp01((vh * 0.98 - r.top) / (vh * 0.5));
    };

    const draw = (t, dt) => {
      if (!still) {
        const b = buildTarget();
        lineU.uBuild.value += (b - lineU.uBuild.value) * 0.06;
        ptU.uBuild.value = lineU.uBuild.value;
      }
      lineU.uTime.value = t; ptU.uTime.value = t;
      const act = hover ? hover.i : -1;
      lineU.uActive.value = act; ptU.uActive.value = act;
      step(dt, t);
      writeLines(t);
      writePoints(t);
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
      for (let k = 0; k < 90; k++) step(1 / 60, 0);
      draw(1.4, 0);
      marks.forEach(m => { m.b.style.transition = 'none'; });
      draw(1.4, 0);
    } else {
      for (let k = 0; k < 40; k++) step(1 / 60, 0);   // asienta la red antes del primer frame
      raf = requestAnimationFrame(loop);
      host.addEventListener('pointerdown', onDown);
      host.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      host.addEventListener('pointerleave', onLeave);
    }

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', resize);
      lineGeo.dispose(); lineMat.dispose(); ptGeo.dispose(); ptMat.dispose(); renderer.dispose();
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
