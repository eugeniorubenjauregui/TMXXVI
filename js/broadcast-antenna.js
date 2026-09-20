/* broadcast-antenna.js — torre de transmisión disparando información en ondas (three.js).
   Firma visual del hero de Noticias. Dos capas de movimiento distintas, a propósito:
   - una torre reticulada (celosía con arriostramiento en X, como una torre de radio
     real) que da la densidad/detalle que tienen el rizoma y el sistema solar — nada
     de "tres líneas y ya".
   - un pulso calmo de anillos concéntricos (la señal "de fondo", broadcasting
     continuo) y, encima, ráfagas de rayos quebrados tipo Tesla-coil que disparan
     desde la punta en momentos puntuales — la "información" saliendo en destellos,
     no un zumbido constante.
   Verde Rizoma marca el origen (la señal, acción); Cian Corriente es el dato que
   viaja — Two-Accent Rule de DESIGN.md. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const RING_COUNT = 3;
const RING_CYCLE = 4.2;
const RING_MAX_RADIUS = 1.05;

const BOLT_COUNT = 8;
const BOLT_CYCLE = 2.6;      // segundos entre disparos de un mismo rayo
const BOLT_FLASH = 0.3;      // ventana visible del destello, en segundos
const BOLT_LEN_MIN = 0.55, BOLT_LEN_MAX = 1.1;

export function initBroadcastAntenna(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const accent2 = opts.accent2 || '#52C7CF';

  let stopped = false, raf = 0, ro = null, disposer = null;

  // #tm-antenna llega vacío, sin tamaño propio — el módulo que se monta ahí es
  // el que lo posiciona (mismo motivo que mesh-gradient.js con su host).
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none';

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0.05, 4.6);
    camera.lookAt(0, 0.05, 0);

    const tower = new THREE.Group();
    scene.add(tower);

    /* ---------- torre reticulada: celosía tronco-cónica con arriostramiento en X --- */
    const LEVELS = 6;
    const baseW = 0.46, topW = 0.05;
    const baseY = -0.98, topY = 0.62;
    const towerPts = [];
    const seg = (ax, ay, bx, by) => { towerPts.push(new THREE.Vector3(ax, ay, 0), new THREE.Vector3(bx, by, 0)); };
    for (let i = 0; i < LEVELS; i++) {
      const t0 = i / LEVELS, t1 = (i + 1) / LEVELS;
      const y0 = baseY + (topY - baseY) * t0, y1 = baseY + (topY - baseY) * t1;
      const w0 = baseW + (topW - baseW) * t0, w1 = baseW + (topW - baseW) * t1;
      seg(-w0, y0, -w1, y1);           // pata izquierda
      seg(w0, y0, w1, y1);             // pata derecha
      seg(-w0, y0, w0, y0);            // travesaño
      seg(-w0, y0, w1, y1);            // diagonal \
      seg(w0, y0, -w1, y1);            // diagonal /
    }
    seg(-topW, topY, topW, topY);      // travesaño superior
    // mástil + antena corta en la punta
    seg(0, topY, 0, topY + 0.22);
    seg(-0.07, topY + 0.14, 0.07, topY + 0.09);
    seg(0.07, topY + 0.14, -0.07, topY + 0.09);
    const towerGeo = new THREE.BufferGeometry().setFromPoints(towerPts);
    const towerMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 });
    tower.add(new THREE.LineSegments(towerGeo, towerMat));

    const tipY = topY + 0.22;
    const tipMat = new THREE.MeshBasicMaterial({ color: accent });
    const tip = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), tipMat);
    tip.position.set(0, tipY, 0.002);
    tower.add(tip);

    /* ---------- anillos concéntricos: el pulso calmo de fondo ---------- */
    const ringSegPts = [];
    const RSEG = 72;
    for (let i = 0; i <= RSEG; i++) {
      const a = (i / RSEG) * Math.PI * 2;
      ringSegPts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringSegPts);
    const rings = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.LineBasicMaterial({ color: accent2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const ring = new THREE.LineLoop(ringGeo, mat);
      ring.position.set(0, tipY, 0);
      ring.scale.setScalar(0.001);
      tower.add(ring);
      rings.push({ mesh: ring, mat, phase: (i / RING_COUNT) * RING_CYCLE });
    }
    const setRing = (r, tNorm) => {
      const radius = RING_MAX_RADIUS * (1 - Math.pow(1 - tNorm, 2));
      r.mesh.scale.setScalar(Math.max(0.001, radius));
      r.mat.opacity = 0.4 * Math.min(1, tNorm * 8) * (1 - Math.pow(tNorm, 2.2));
    };

    /* ---------- rayos quebrados: ráfagas puntuales tipo bobina Tesla ---------- */
    const boltAngleFor = (i) => (i / BOLT_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const jaggedPoints = (angle, length) => {
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      const perp = { x: -dir.y, y: dir.x };
      const SEGN = 4;
      const pts = [new THREE.Vector3(0, 0, 0)];
      for (let s = 1; s <= SEGN; s++) {
        const t = s / SEGN;
        const jitter = (Math.random() - 0.5) * 0.16 * (1 - t * 0.55);
        pts.push(new THREE.Vector3(
          dir.x * length * t + perp.x * jitter,
          dir.y * length * t + perp.y * jitter,
          0
        ));
      }
      return pts;
    };
    const bolts = [];
    for (let i = 0; i < BOLT_COUNT; i++) {
      const mat = new THREE.LineBasicMaterial({ color: accent2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
      const angle0 = boltAngleFor(i);
      const geo = new THREE.BufferGeometry().setFromPoints(
        jaggedPoints(angle0, BOLT_LEN_MIN + Math.random() * (BOLT_LEN_MAX - BOLT_LEN_MIN))
      );
      const line = new THREE.Line(geo, mat);
      line.position.set(0, tipY, 0.001);
      tower.add(line);
      bolts.push({ mesh: line, geo, mat, angle0, phase: (i / BOLT_COUNT) * BOLT_CYCLE, lastCycle: -1 });
    }

    let w = 0, h = 0;
    const resize = () => {
      w = host.clientWidth || 480;
      h = host.clientHeight || Math.round(w * 0.9);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    if (still) {
      rings.forEach((r, i) => setRing(r, 0.2 + i * 0.24));
      bolts.forEach((b, i) => { b.mat.opacity = i % 3 === 0 ? 0.55 : 0; });
      renderer.render(scene, camera);
    } else {
      const t0 = performance.now();
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        const t = (now - t0) / 1000;

        rings.forEach(r => setRing(r, ((t + r.phase) % RING_CYCLE) / RING_CYCLE));

        bolts.forEach(b => {
          const local = (t + b.phase) % BOLT_CYCLE;
          const cycleIdx = Math.floor((t + b.phase) / BOLT_CYCLE);
          if (cycleIdx !== b.lastCycle) {
            b.lastCycle = cycleIdx;
            const angle = boltAngleFor(bolts.indexOf(b));
            const len = BOLT_LEN_MIN + Math.random() * (BOLT_LEN_MAX - BOLT_LEN_MIN);
            b.geo.setFromPoints(jaggedPoints(angle, len));
          }
          if (local < BOLT_FLASH) {
            const p = local / BOLT_FLASH;
            b.mat.opacity = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
          } else {
            b.mat.opacity = 0;
          }
        });

        const pulse = 0.65 + 0.35 * Math.sin(t * 2.6);
        tipMat.opacity = pulse;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
    }

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      if (!ro) window.removeEventListener('resize', resize);
      rings.forEach(r => r.mat.dispose());
      bolts.forEach(b => { b.geo.dispose(); b.mat.dispose(); });
      towerGeo.dispose(); towerMat.dispose(); ringGeo.dispose(); tipMat.dispose();
      renderer.dispose();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }).catch(() => {});

  return () => {
    stopped = true;
    if (ro) ro.disconnect();
    if (disposer) disposer();
  };
}
