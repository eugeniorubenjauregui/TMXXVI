/* broadcast-antenna.js — antena de transmisión emitiendo ondas concéntricas (three.js).
   Firma visual del hero de Noticias: una señal saliendo al mundo, igual que el blog
   emite contenido hacia afuera. Antena minimalista (mástil + base) a un costado,
   con anillos que nacen en la punta, crecen y se desvanecen en un ciclo continuo —
   calmo, no estridente. Cian Corriente para las ondas (dato en movimiento, según la
   Two-Accent Rule de DESIGN.md); la antena misma queda en blanco tenue, como
   estructura, no como señal. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const RING_COUNT = 4;
const CYCLE = 3.6;          // segundos por anillo, de nacer a desvanecerse del todo
const MAX_RADIUS = 1.55;    // en unidades del mundo (misma escala que rhizome/solar)

export function initBroadcastAntenna(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent2 = opts.accent2 || '#52C7CF';

  let stopped = false, raf = 0, ro = null, disposer = null;

  // #tm-mesh llega sin tamaño propio (div vacío, aria-hidden): el módulo que se
  // monta ahí es el que lo posiciona, igual que mesh-gradient.js con su host.
  // Sin esto, host.clientHeight lee 0 y el fallback de resize() infla el canvas.
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
    camera.position.set(0, 0, 4.4);
    camera.lookAt(0, 0, 0);

    // La antena vive corrida hacia el costado derecho del hero, de forma que las
    // ondas tengan sitio para crecer hacia la izquierda por debajo del texto.
    const originX = 0.55, originY = -0.05;
    const tipY = originY + 0.62;

    const structure = new THREE.Group();
    structure.position.set(originX, 0, 0);
    scene.add(structure);

    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const mastGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, originY, 0), new THREE.Vector3(0, tipY, 0)
    ]);
    structure.add(new THREE.Line(mastGeo, lineMat));
    const braceGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.09, tipY - 0.16, 0), new THREE.Vector3(0.09, tipY - 0.08, 0),
      new THREE.Vector3(0.09, tipY - 0.08, 0), new THREE.Vector3(-0.09, tipY - 0.0, 0)
    ]);
    structure.add(new THREE.LineSegments(braceGeo, lineMat));
    const baseGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.14, originY, 0), new THREE.Vector3(0.14, originY, 0)
    ]);
    structure.add(new THREE.Line(baseGeo, lineMat));

    const tipMat = new THREE.MeshBasicMaterial({ color: accent2 });
    const tip = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), tipMat);
    tip.position.set(originX, tipY, 0.001);
    scene.add(tip);

    // Los anillos son LineLoop (trazo fino, no relleno) escalados desde el mismo
    // punto de origen que la punta de la antena — nacen ahí y crecen hacia afuera.
    const circlePts = [];
    const SEG = 72;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      circlePts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(circlePts);
    const rings = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.LineBasicMaterial({
        color: accent2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending
      });
      const ring = new THREE.LineLoop(ringGeo, mat);
      ring.position.set(originX, tipY, 0);
      ring.scale.setScalar(0.001);
      scene.add(ring);
      rings.push({ mesh: ring, mat, phase: (i / RING_COUNT) * CYCLE });
    }

    let w = 0, h = 0;
    const resize = () => {
      w = host.clientWidth || 480;
      h = host.clientHeight || Math.round(w * 0.7);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); }
    else window.addEventListener('resize', resize);

    const setRing = (r, tNorm) => {
      // tNorm 0..1: crece con ease-out y se desvanece hacia el final del ciclo.
      const radius = MAX_RADIUS * (1 - Math.pow(1 - tNorm, 2));
      r.mesh.scale.setScalar(Math.max(0.001, radius));
      const fadeIn = Math.min(1, tNorm * 8);
      const fadeOut = 1 - Math.pow(tNorm, 2.2);
      r.mat.opacity = 0.5 * fadeIn * fadeOut;
    };

    if (still) {
      // Modo quieto: tres anillos fijos, sin animación — la señal "ya salió".
      rings.forEach((r, i) => setRing(r, 0.18 + i * 0.22));
      tipMat.opacity = 1;
      renderer.render(scene, camera);
    } else {
      const t0 = performance.now();
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        const t = (now - t0) / 1000;
        rings.forEach(r => setRing(r, ((t + r.phase) % CYCLE) / CYCLE));
        const pulse = 0.6 + 0.4 * Math.sin(t * 2.4);
        tipMat.opacity = pulse;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
    }

    disposer = () => {
      if (raf) cancelAnimationFrame(raf);
      if (!ro) window.removeEventListener('resize', resize);
      rings.forEach(r => r.mat.dispose());
      ringGeo.dispose(); mastGeo.dispose(); braceGeo.dispose(); baseGeo.dispose();
      lineMat.dispose(); tipMat.dispose();
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
