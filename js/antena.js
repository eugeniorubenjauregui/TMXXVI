/* antena.js — la torre transmisora (three.js, ESM por CDN).
   Wardenclyffe: una estructura de celosía, un domo de alambre y descargas que
   salen del domo hacia afuera. Alrededor, anillos de emisión que se expanden y
   se apagan — la noticia que se propaga.

   Mismo lenguaje que rhizome.js y la Two-Accent Rule de DESIGN.md: la
   estructura (celosía, domo, collar) es Verde Rizoma — el origen, la acción.
   Las descargas son Cian Corriente — el dato viajando. Nunca al revés, y
   nunca mezclados en el mismo elemento.

   initAntena(host, { accent, motion, tint }) -> dispose() */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const SEG_BOLT = 11;      // vértices por descarga
const MAX_BOLT = 20;
const MAX_WAVE = 5;
const WAVE_SEG = 84;

const hexToRgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};
const rand = (a, b) => a + Math.random() * (b - a);

export function initAntena(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent = opts.accent || '#80E593';
  const tint = opts.tint || '#52C7CF';

  let stopped = false, raf = 0, ro = null, io = null, visible = true, disposer = null;

  host.style.position = 'relative';
  host.style.touchAction = 'pan-y';

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    const cv = renderer.domElement;
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(cv);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const world = new THREE.Group();
    scene.add(world);

    const A = new THREE.Color(...hexToRgb(accent));
    const T = new THREE.Color(...hexToRgb(tint));

    /* ---------- torre de celosía ---------- */
    const H = 6.2, LEVELS = 7, wB = 1.65, wT = 0.46;
    const halfAt = y => wB + (wT - wB) * Math.pow(y / H, 0.82);
    const corner = (i, y) => {
      const w = halfAt(y), a = i * Math.PI / 2 + Math.PI / 4;
      return [Math.cos(a) * w * Math.SQRT2 * 0.72, y, Math.sin(a) * w * Math.SQRT2 * 0.72];
    };

    const sPos = [];
    const push = (p, q) => { sPos.push(p[0], p[1], p[2], q[0], q[1], q[2]); };

    for (let i = 0; i < 4; i++) {           // montantes
      for (let s = 0; s < LEVELS; s++) {
        push(corner(i, H * s / LEVELS), corner(i, H * (s + 1) / LEVELS));
      }
    }
    for (let s = 0; s <= LEVELS; s++) {     // anillos horizontales
      const y = H * s / LEVELS;
      for (let i = 0; i < 4; i++) push(corner(i, y), corner((i + 1) % 4, y));
    }
    for (let s = 0; s < LEVELS; s++) {      // cruces en cada cara
      const y0 = H * s / LEVELS, y1 = H * (s + 1) / LEVELS;
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        push(corner(i, y0), corner(j, y1));
        push(corner(j, y0), corner(i, y1));
      }
    }
    for (let k = 0; k < 4; k++) {           // basamento escalonado
      const y = -0.1 - k * 0.13, w = 1.95 + k * 0.16;
      const c = [[-w, y, -w], [w, y, -w], [w, y, w], [-w, y, w]];
      for (let i = 0; i < 4; i++) push(c[i], c[(i + 1) % 4]);
    }

    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
    const sCol = new Float32Array(sPos.length / 3 * 4);
    for (let i = 0; i < sPos.length / 3; i++) {
      const y = sPos[i * 3 + 1];
      const t = Math.max(0, Math.min(1, y / H));
      sCol.set([A.r, A.g, A.b, 0.2 + t * 0.32], i * 4);
    }
    sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 4));
    const structure = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false
    }));
    world.add(structure);

    /* ---------- domo de alambre ---------- */
    const DY = H + 0.92, R = 1.02;
    const sph = (u, v) => [Math.cos(u) * Math.sin(v) * R, DY + Math.cos(v) * R, Math.sin(u) * Math.sin(v) * R];
    const domeGeo = new THREE.BufferGeometry();
    const domePos = [];
    const pushD = (p, q) => { domePos.push(p[0], p[1], p[2], q[0], q[1], q[2]); };
    for (let m = 0; m < 16; m++) {
      const u = m / 16 * Math.PI * 2;
      for (let s = 0; s < 22; s++) pushD(sph(u, s / 22 * Math.PI), sph(u, (s + 1) / 22 * Math.PI));
    }
    for (let p = 1; p < 8; p++) {
      const v = p / 8 * Math.PI;
      for (let s = 0; s < 40; s++) pushD(sph(s / 40 * Math.PI * 2, v), sph((s + 1) / 40 * Math.PI * 2, v));
    }
    domeGeo.setAttribute('position', new THREE.Float32BufferAttribute(domePos, 3));
    const dome = new THREE.LineSegments(domeGeo, new THREE.LineBasicMaterial({
      color: A, transparent: true, opacity: 0.42, depthWrite: false
    }));
    world.add(dome);

    /* collar acampanado bajo el domo */
    const cPos = [];
    for (let k = 0; k < 5; k++) {
      const y = DY - R - 0.12 - k * 0.15, rr = 0.86 - k * 0.11;
      for (let s = 0; s < 36; s++) {
        const a0 = s / 36 * Math.PI * 2, a1 = (s + 1) / 36 * Math.PI * 2;
        cPos.push(Math.cos(a0) * rr, y, Math.sin(a0) * rr, Math.cos(a1) * rr, y, Math.sin(a1) * rr);
      }
    }
    const collarGeo = new THREE.BufferGeometry();
    collarGeo.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    world.add(new THREE.LineSegments(collarGeo, new THREE.LineBasicMaterial({
      color: A, transparent: true, opacity: 0.26, depthWrite: false
    })));

    /* ---------- descargas ---------- */
    const bPos = new Float32Array(MAX_BOLT * (SEG_BOLT - 1) * 2 * 3);
    const bCol = new Float32Array(MAX_BOLT * (SEG_BOLT - 1) * 2 * 4);
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3).setUsage(THREE.DynamicDrawUsage));
    bGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 4).setUsage(THREE.DynamicDrawUsage));
    const bolts = new THREE.LineSegments(bGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    world.add(bolts);

    const newBolt = () => ({
      ang: rand(-0.42, Math.PI + 0.42),
      len: rand(2.2, 4.6),
      z: rand(-0.9, 0.9),
      jit: rand(0.12, 0.34),
      life: 0,
      dur: rand(0.3, 0.7),
      wait: rand(0, 1.1),
      seed: Math.random() * 100
    });
    const B = Array.from({ length: MAX_BOLT }, newBolt);

    const writeBolts = (t) => {
      let vi = 0;
      for (const b of B) {
        const on = b.wait <= 0 && b.life < b.dur;
        const k = on ? Math.sin(Math.PI * Math.min(1, b.life / b.dur)) : 0;
        const dirX = Math.cos(b.ang), dirY = Math.sin(b.ang) * 0.86 + 0.06;
        const pts = [];
        for (let s = 0; s < SEG_BOLT; s++) {
          const u = s / (SEG_BOLT - 1);
          const wob = (Math.sin(b.seed + u * 17.3 + t * 9) + Math.sin(b.seed * 1.7 + u * 31.1)) * 0.5;
          const nx = -dirY, ny = dirX;
          const off = u === 0 ? 0 : wob * b.jit * (0.35 + u * 0.9);
          pts.push([
            dirX * (R * 0.9 + u * b.len) + nx * off,
            DY + dirY * (R * 0.9 + u * b.len) + ny * off,
            b.z * u
          ]);
        }
        const col = T;
        for (let s = 0; s < SEG_BOLT - 1; s++) {
          const taper = 1 - s / (SEG_BOLT - 1);
          const al = Math.min(0.92, k * (0.3 + taper * 1.0));
          for (const p of [pts[s], pts[s + 1]]) {
            bPos.set(p, vi * 3);
            bCol.set([col.r, col.g, col.b, al], vi * 4);
            vi++;
          }
        }
      }
      bGeo.attributes.position.needsUpdate = true;
      bGeo.attributes.color.needsUpdate = true;
    };

    /* ---------- anillos de emisión ---------- */
    const wPos = new Float32Array(MAX_WAVE * WAVE_SEG * 2 * 3);
    const wCol = new Float32Array(MAX_WAVE * WAVE_SEG * 2 * 4);
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3).setUsage(THREE.DynamicDrawUsage));
    wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 4).setUsage(THREE.DynamicDrawUsage));
    world.add(new THREE.LineSegments(wGeo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false
    })));
    const W = Array.from({ length: MAX_WAVE }, (_, i) => ({ p: i / MAX_WAVE }));

    const writeWaves = () => {
      let vi = 0;
      for (const w of W) {
        const r = 1.1 + w.p * 6.4;
        const al = Math.max(0, (1 - w.p) * 0.5 * Math.min(1, w.p * 6));
        const tiltY = DY - w.p * 0.9;
        for (let s = 0; s < WAVE_SEG; s++) {
          const a0 = s / WAVE_SEG * Math.PI * 2, a1 = (s + 1) / WAVE_SEG * Math.PI * 2;
          const fade = a => 0.35 + 0.65 * Math.abs(Math.sin(a));
          for (const [a, q] of [[a0, 0], [a1, 1]]) {
            wPos.set([Math.cos(a) * r, tiltY + Math.sin(a) * r * 0.42, Math.sin(a) * r * 0.3], vi * 3);
            wCol.set([A.r, A.g, A.b, al * fade(a)], vi * 4);
            vi++;
          }
        }
      }
      wGeo.attributes.position.needsUpdate = true;
      wGeo.attributes.color.needsUpdate = true;
    };

    /* ---------- polvo ---------- */
    const N = 90;
    const pPos = new Float32Array(N * 3);
    const pSeed = [];
    for (let i = 0; i < N; i++) {
      pSeed.push({ x: rand(-7, 7), y: rand(-0.4, 9), z: rand(-4, 4), v: rand(0.06, 0.24) });
      pPos.set([pSeed[i].x, pSeed[i].y, pSeed[i].z], i * 3);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    world.add(new THREE.Points(pGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.3, depthWrite: false
    })));

    /* ---------- interacción ---------- */
    let yaw = -0.34, yawT = -0.34, pitch = 0.04, dragging = false, px = 0, py = 0, charge = 0;
    const down = e => { dragging = true; px = e.clientX; py = e.clientY; host.style.cursor = 'grabbing'; };
    const move = e => {
      const r = host.getBoundingClientRect();
      charge = 1 - Math.min(1, Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width * 0.6));
      if (!dragging) return;
      yawT += (e.clientX - px) * 0.006;
      pitch = Math.max(-0.22, Math.min(0.38, pitch - (e.clientY - py) * 0.003));
      px = e.clientX; py = e.clientY;
    };
    const up = () => { dragging = false; host.style.cursor = 'grab'; };
    if (!still) {
      host.style.cursor = 'grab';
      host.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }

    /* ---------- tamaño ---------- */
    const fit = () => {
      const w = host.clientWidth || 640, h = host.clientHeight || 420;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const narrow = w / h < 1.1;
      camera.position.set(0, 1.0, narrow ? 23 : 19);
      camera.lookAt(0, 1.0, 0);
      camera.updateProjectionMatrix();
    };
    fit();
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 });
      io.observe(host);
    }

    /* ---------- loop ---------- */
    let last = performance.now(), t = 0, build = 0;
    const frame = (now) => {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!visible) return;
      t += dt;
      build = Math.min(1, build + dt * 0.55);

      if (!dragging) yawT += dt * 0.055;
      yaw += (yawT - yaw) * 0.08;
      world.rotation.y = yaw;
      world.rotation.x = pitch;
      world.position.y = -3.9;
      dome.rotation.y += dt * 0.25;

      const rate = 1 + charge * 1.6;
      for (const b of B) {
        if (b.wait > 0) { b.wait -= dt * rate; continue; }
        b.life += dt;
        if (b.life >= b.dur) Object.assign(b, newBolt(), { wait: rand(0.04, 0.8) / rate });
      }
      writeBolts(t);

      for (const w of W) {
        w.p += dt * 0.17;
        if (w.p > 1) w.p -= 1;
      }
      writeWaves();

      for (let i = 0; i < N; i++) {
        const s = pSeed[i];
        s.y += s.v * dt;
        if (s.y > 9.4) s.y = -0.6;
        pPos[i * 3] = s.x + Math.sin(t * 0.3 + i) * 0.14;
        pPos[i * 3 + 1] = s.y;
        pPos[i * 3 + 2] = s.z;
      }
      pGeo.attributes.position.needsUpdate = true;

      structure.material.opacity = 1;
      bolts.material.opacity = build;
      renderer.render(scene, camera);
    };

    if (still) {
      build = 1; world.rotation.y = -0.34; world.position.y = -3.9;
      writeBolts(0.5); writeWaves();
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(frame);
    }

    disposer = () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      renderer.dispose();
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    };
  }).catch(err => console.error('antena.js:', err));

  return () => {
    stopped = true;
    if (ro) ro.disconnect();
    if (io) io.disconnect();
    if (disposer) disposer();
  };
}
