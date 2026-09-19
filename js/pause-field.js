/* pause-field.js — red neuronal que dispara señales (three.js, ESM por CDN).
   Nodos de posición orgánica unidos por dendritas curvas. Las señales no viajan
   sueltas: cuando un pulso llega a un nodo, el nodo se enciende y reemite por
   una o dos de sus otras conexiones, así la actividad se propaga en cascada por
   la red en vez de repetir un circuito fijo.

   Va sobre #F2F4F3 con texto oscuro encima, así que nada de blending aditivo:
   trazo fino en cian con alfa baja y blending normal, para que funcione como
   marca de agua sin restarle contraste al copy. El cursor atrae los nodos
   cercanos, enciende sus dendritas y provoca disparos. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const SEG = 7;                               // segmentos por dendrita (la curva)

const LINE_VERT = `
attribute float aA;
varying float vA;
void main(){
  vA = aA;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LINE_FRAG = `
precision mediump float;
uniform vec3 uColor;
varying float vA;
void main(){
  if (vA <= 0.002) discard;
  gl_FragColor = vec4(uColor, vA);
}`;

const PT_VERT = `
attribute float aA;
attribute float aS;
varying float vA;
void main(){
  vA = aA;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aS;
}`;

const PT_FRAG = `
precision mediump float;
uniform vec3 uColor;
varying float vA;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float m = 1.0 - smoothstep(0.24, 0.5, length(d));
  if (m <= 0.0 || vA <= 0.002) discard;
  gl_FragColor = vec4(uColor, vA * m);
}`;

export function initPauseField(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const color = opts.accent2 || '#52C7CF';
  const narrow = Math.min(host.clientWidth || 900, window.innerWidth) < 640;

  let stopped = false, raf = 0, ro = null, disposer = null;

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    const col = new THREE.Color(color);

    /* ---------- nodos: reparto por muestreo con distancia mínima ---------- */
    const target = narrow ? 34 : 62;
    const MIND = narrow ? 0.2 : 0.145;
    const nodes = [];
    for (let guard = 0; guard < 4000 && nodes.length < target; guard++) {
      const bx = (Math.random() - 0.5) * 2 * 1.08;
      const by = (Math.random() - 0.5) * 2 * 0.94;
      let ok = true;
      for (const n of nodes) {
        if (Math.hypot(n.bx - bx, n.by - by) < MIND) { ok = false; break; }
      }
      if (!ok) continue;
      nodes.push({
        bx, by, ph: Math.random() * 6.28, sp: 0.09 + Math.random() * 0.15,
        amp: 0.022 + Math.random() * 0.04,
        soma: Math.random() < 0.2,            // unos pocos cuerpos celulares mayores
        x: 0, y: 0, glow: 0, fire: 0, out: []
      });
    }

    // dendritas: vecinos cercanos, con más salidas en los cuerpos mayores
    const links = [];
    const MAXD = narrow ? 0.58 : 0.44;
    nodes.forEach((a, i) => {
      const near = nodes.map((b, j) => ({ j, d: Math.hypot(b.bx - a.bx, b.by - a.by) }))
        .filter(o => o.j !== i && o.d < MAXD)
        .sort((p, q) => p.d - q.d)
        .slice(0, a.soma ? 6 : 3);
      near.forEach(o => {
        if (nodes[o.j].soma && !a.soma && Math.random() < 0.3) return;
        if (links.some(l => (l.a === i && l.b === o.j) || (l.a === o.j && l.b === i))) return;
        links.push({
          a: i, b: o.j,
          base: a.soma || nodes[o.j].soma ? 0.24 : 0.15,
          bend: (Math.random() - 0.5) * 0.3          // la curva hace la dendrita
        });
      });
    });
    links.forEach((l, i) => { nodes[l.a].out.push(i); nodes[l.b].out.push(i); });

    /* punto sobre la dendrita: cuadrática con desvío perpendicular */
    const curveAt = (l, t, out) => {
      const A = nodes[l.a], B = nodes[l.b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1e-4;
      const nx = -dy / len, ny = dx / len;
      const bend = Math.sin(t * Math.PI) * l.bend * len * 0.5;
      out[0] = A.x + dx * t + nx * bend;
      out[1] = A.y + dy * t + ny * bend;
      return out;
    };

    const lPos = new Float32Array(links.length * SEG * 2 * 3);
    const lA = new Float32Array(links.length * SEG * 2);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(lPos, 3));
    lineGeo.setAttribute('aA', new THREE.BufferAttribute(lA, 1));
    lineGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG,
      uniforms: { uColor: { value: col } },
      transparent: true, depthWrite: false, depthTest: false
    });
    scene.add(new THREE.LineSegments(lineGeo, lineMat));

    /* ---------- señales: reserva fija, se reutilizan al propagarse ---------- */
    const POOL = narrow ? 26 : 46;
    const sig = [];
    for (let k = 0; k < POOL; k++) sig.push({ on: false, l: 0, from: 0, t: 0, sp: 0 });

    const emit = (nodeIdx, exceptLink) => {
      const outs = nodes[nodeIdx].out;
      if (!outs.length) return;
      const li = outs[Math.floor(Math.random() * outs.length)];
      if (li === exceptLink && outs.length > 1) return emit(nodeIdx, -1);
      const s = sig.find(x => !x.on);
      if (!s) return;
      s.on = true; s.l = li; s.from = nodeIdx; s.t = 0;
      s.sp = 0.5 + Math.random() * 0.55;
    };

    const total = nodes.length + POOL;
    const pPos = new Float32Array(total * 3);
    const pA = new Float32Array(total), pS = new Float32Array(total);
    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    ptGeo.setAttribute('aA', new THREE.BufferAttribute(pA, 1));
    ptGeo.setAttribute('aS', new THREE.BufferAttribute(pS, 1));
    ptGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    const ptMat = new THREE.ShaderMaterial({
      vertexShader: PT_VERT, fragmentShader: PT_FRAG,
      uniforms: { uColor: { value: col } },
      transparent: true, depthWrite: false, depthTest: false
    });
    scene.add(new THREE.Points(ptGeo, ptMat));

    let w = 0, h = 0, asp = 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = host.clientWidth || 900;
      h = host.clientHeight || 520;
      asp = w / Math.max(1, h);
      camera.left = -asp; camera.right = asp;
      camera.top = 1; camera.bottom = -1;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    let overHost = false, tmx = 9, tmy = 9, mx = 9, my = 9, pull = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      overHost = inside;
      if (!inside) return;
      tmx = (((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1) * asp;
      tmy = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
    };
    window.addEventListener('mousemove', onMove, { passive: true });

    const p2 = [0, 0];
    let lastT = 0, seedAcc = 0;

    const draw = (t, dt) => {
      pull += ((overHost ? 1 : 0) - pull) * 0.06;
      mx += (tmx - mx) * 0.1;
      my += (tmy - my) * 0.1;

      nodes.forEach(n => {
        let x = (n.bx + Math.cos(t * n.sp + n.ph) * n.amp) * asp;
        let y = n.by + Math.sin(t * n.sp * 0.85 + n.ph * 1.4) * n.amp;
        const dx = mx - x, dy = my - y;
        const g = Math.exp(-(dx * dx + dy * dy) / 0.15) * pull;
        x += dx * 0.12 * g;
        y += dy * 0.12 * g;
        n.x = x; n.y = y; n.glow = g;
        n.fire = Math.max(0, n.fire - dt * 2.2);
        // el cursor no solo ilumina: provoca actividad donde pasa
        if (g > 0.5 && Math.random() < dt * 2.4) emit(nodes.indexOf(n), -1);
      });

      // actividad de fondo: cada tanto se dispara un nodo al azar
      seedAcc += dt;
      if (seedAcc > 0.28) {
        seedAcc = 0;
        emit(Math.floor(Math.random() * nodes.length), -1);
      }

      // dendritas, con el brillo local del pulso que las recorre
      const pulses = sig.filter(s => s.on);
      links.forEach((l, i) => {
        const len = Math.hypot(nodes[l.b].x - nodes[l.a].x, nodes[l.b].y - nodes[l.a].y);
        const fade = 1 - Math.min(1, len / (MAXD * asp * 1.5));
        const glowA = nodes[l.a].glow * 0.45 + nodes[l.a].fire * 0.3;
        const glowB = nodes[l.b].glow * 0.45 + nodes[l.b].fire * 0.3;
        const here = pulses.filter(s => s.l === i);
        let k = i * SEG * 2;
        for (let s = 0; s < SEG; s++) {
          for (const f of [s / SEG, (s + 1) / SEG]) {
            curveAt(l, f, p2);
            lPos[k * 3] = p2[0]; lPos[k * 3 + 1] = p2[1]; lPos[k * 3 + 2] = 0;
            let a = l.base * (0.4 + 0.6 * fade);
            a += glowA * (1 - f) + glowB * f;
            for (const s2 of here) {
              const at = s2.from === l.a ? s2.t : 1 - s2.t;
              a += Math.exp(-Math.pow((f - at) / 0.2, 2)) * 0.42;   // estela del pulso
            }
            lA[k] = a;
            k++;
          }
        }
      });
      lineGeo.attributes.position.needsUpdate = true;
      lineGeo.attributes.aA.needsUpdate = true;

      nodes.forEach((n, i) => {
        pPos[i * 3] = n.x; pPos[i * 3 + 1] = n.y; pPos[i * 3 + 2] = 0;
        pA[i] = (n.soma ? 0.46 : 0.28) + n.glow * 0.5 + n.fire * 0.5;
        pS[i] = (n.soma ? 4.4 : 2.6) * dpr * (1 + n.glow * 0.45 + n.fire * 0.7);
      });

      sig.forEach((s, k) => {
        const i = nodes.length + k;
        if (!s.on) { pA[i] = 0; pS[i] = 0; pPos[i * 3] = 9; return; }
        s.t += s.sp * dt;
        if (s.t >= 1) {
          const l = links[s.l];
          const dest = s.from === l.a ? l.b : l.a;
          nodes[dest].fire = 1;                    // el nodo se enciende…
          s.on = false;
          const fanout = nodes[dest].soma ? 2 : 1; // …y reemite: la cascada sigue
          for (let q = 0; q < fanout; q++) emit(dest, s.l);
          pA[i] = 0; pS[i] = 0; pPos[i * 3] = 9;
          return;
        }
        const l = links[s.l];
        const tt = s.from === l.a ? s.t : 1 - s.t;
        curveAt(l, tt, p2);
        pPos[i * 3] = p2[0]; pPos[i * 3 + 1] = p2[1]; pPos[i * 3 + 2] = 0;
        pA[i] = 0.7;
        pS[i] = 3.2 * dpr;
      });
      ptGeo.attributes.position.needsUpdate = true;
      ptGeo.attributes.aA.needsUpdate = true;
      ptGeo.attributes.aS.needsUpdate = true;

      renderer.render(scene, camera);
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
      if (!onScreen()) { lastT = t; return; }
      const dt = Math.min(0.05, t - lastT);
      lastT = t;
      draw(t, dt);
    };

    if (still) {
      for (let k = 0; k < 14; k++) emit(Math.floor(Math.random() * nodes.length), -1);
      sig.forEach(s => { if (s.on) s.t = Math.random() * 0.85; });
      draw(2.4, 0.016);
    } else {
      raf = requestAnimationFrame(loop);
    }

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', resize);
      lineGeo.dispose(); lineMat.dispose(); ptGeo.dispose(); ptMat.dispose(); renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }).catch(e => { console.error('pause-field:', e && e.message); });

  return () => {
    stopped = true;
    if (ro) ro.disconnect();
    if (disposer) disposer();
  };
}
