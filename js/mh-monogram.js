/* mh-monogram.js — monograma Mario Hernández como nube de partículas (three.js).
   Relleno + contorno en dos capas para que el volumen se lea al inclinarse.
   Entra desde una dispersión, respira, un barrido recorre la letra y el cursor
   abre las partículas e inclina la pieza. initMonogram(host, { accent, accent2, motion }) -> dispose() */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const PATHS = [
  [163.2428, 415.6194, 'M0,248.761L0,-1.447C0,-111.366 -15.911,-195.25 -50.622,-237.192L170.662,-237.192C143.182,-192.357 122.934,-134.506 179.338,-30.373L376.035,338.431L415.086,264.672C433.886,225.621 470.045,221.281 509.093,221.281L376.035,470.045L135.95,27.48L135.95,134.506C166.322,134.506 199.586,173.554 209.713,202.481L135.95,202.481L135.95,238.637C135.95,348.555 151.859,441.118 186.57,485.953L-50.622,485.953C-15.911,441.118 0,358.679 0,248.761'],
  [779.3619, 425.7435, 'M0,228.513L0,192.357L-286.367,192.357L-323.97,124.382L0,124.382L0,17.356L-47.727,102.686L-120.042,102.686L-43.388,-40.497C11.571,-141.737 -7.232,-202.481 -34.711,-247.316L188.017,-247.316C150.414,-203.927 134.506,-121.49 134.506,-13.016L134.506,238.637C134.506,348.555 150.414,430.994 188.017,475.829L-50.62,475.829C-15.908,430.994 0,338.431 0,228.513']
];

const VERT = `
attribute vec3 aHome; attribute vec4 aRand; attribute float aEdge;
uniform float uTime, uIn, uHover, uSize;
uniform vec2 uMouse;
varying float vEdge, vFlash, vScan, vA;
void main(){
  float k = smoothstep(0.0, 1.0, clamp(uIn * 1.5 - aRand.w * 0.5, 0.0, 1.0));
  vec3 p = mix(aRand.xyz * 3.2, aHome, k);
  p.z += sin(uTime * 0.8 + aHome.x * 3.0 + aRand.w * 6.283) * 0.025;
  p.xy += vec2(sin(uTime * 0.6 + aRand.w * 20.0), cos(uTime * 0.7 + aRand.w * 17.0)) * 0.005;
  vec2 d = p.xy - uMouse; float r2 = dot(d, d);
  float f = uHover * exp(-r2 * 9.0);
  float sx = mod(uTime * 0.32, 1.9) * 2.4 - 1.9;
  vScan = exp(-pow(aHome.x + aHome.y * 0.35 - sx, 2.0) * 60.0) * k;
  vEdge = aEdge; vFlash = f; vA = k;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * mix(1.0, 1.3, aEdge) * (1.0 + f * 0.35 + vScan * 0.6) * (5.0 / -mv.z);
}`;
const FRAG = `
uniform vec3 uColor, uColor2;
varying float vEdge, vFlash, vScan, vA;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.1, d);
  vec3 col = mix(uColor2, uColor, 0.35 + vEdge * 0.65);
  col = mix(col, vec3(1.0), clamp(vFlash * 0.55 + vScan * 0.55, 0.0, 1.0));
  float o = (0.26 + vEdge * 0.5 + vScan * 0.5 + vFlash * (1.1 + vEdge * 0.6)) * vA;
  gl_FragColor = vec4(col * a * o, a * o);
}`;

function sample() {
  const S = 540, sc = S / 1080;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000';
  PATHS.forEach(([tx, ty, d]) => { ctx.setTransform(sc, 0, 0, sc, tx * sc, ty * sc); ctx.fill(new Path2D(d)); });
  const px = ctx.getImageData(0, 0, S, S).data;
  const on = (x, y) => x >= 0 && y >= 0 && x < S && y < S && px[(y * S + x) * 4 + 3] > 128;
  const home = [], rand = [], edge = [];
  const W = 2.9 / S;
  const push = (x, y, z, e) => {
    home.push((x - S / 2) * W, -(y - S / 2) * W, z);
    const u = Math.random() * 6.283, v = Math.acos(2 * Math.random() - 1), r = 0.6 + Math.random() * 0.6;
    rand.push(Math.sin(v) * Math.cos(u) * r, Math.sin(v) * Math.sin(u) * r, Math.cos(v) * r, Math.random());
    edge.push(e);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!on(x, y)) continue;
    const isEdge = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
    if (isEdge) { if ((x + y) % 2 === 0) { push(x, y, 0.07, 1); push(x, y, -0.07, 1); } }
    else if (x % 3 === 0 && y % 3 === 0) push(x + Math.random() * 2, y + Math.random() * 2, (Math.random() - 0.5) * 0.12, 0);
  }
  return { home, rand, edge };
}

export function initMonogram(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const target = opts.pointerTarget || host.closest('section') || host;
  let stopped = false, raf = 0, ro = null, io = null, visible = false, seen = false, disposer = null;

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix); renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const { home, rand, edge } = sample();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(home), 3));
    geo.setAttribute('aHome', new THREE.BufferAttribute(new Float32Array(home), 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(new Float32Array(rand), 4));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(edge), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    const U = {
      uTime: { value: 0 }, uIn: { value: still ? 1 : 0 }, uHover: { value: 0 },
      uSize: { value: Math.max(1.6, pix * 1.25) }, uMouse: { value: new THREE.Vector2(9, 9) },
      uColor: { value: new THREE.Color(opts.accent || '#80E593') }, uColor2: { value: new THREE.Color(opts.accent2 || '#52C7CF') }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const group = new THREE.Group();
    group.add(new THREE.Points(geo, mat));
    scene.add(group);

    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
    const goal = new THREE.Vector2(9, 9), cur = new THREE.Vector2(9, 9);
    let tiltX = 0, tiltY = 0, hoverGoal = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = -((e.clientY - r.top) / r.height) * 2 + 1;
      tiltX = Math.max(-1, Math.min(1, nx)); tiltY = Math.max(-1, Math.min(1, ny));
      ndc.set(nx, ny); ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) {
        group.worldToLocal(hit);
        if (hoverGoal === 0) cur.set(hit.x, hit.y);
        goal.set(hit.x, hit.y);
        hoverGoal = Math.abs(nx) < 1.25 && Math.abs(ny) < 1.25 ? 1 : 0;
      }
      if (still) frame();
    };
    const onLeave = () => { hoverGoal = 0; tiltX = 0; tiltY = 0; };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (still) frame();
    };
    ro = new ResizeObserver(resize);

    let tIn = 0, last = performance.now(), t = 0;
    function frame() {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!still) { t += dt; if (seen) tIn = Math.min(1, tIn + dt / 2.4); U.uIn.value = tIn; }
      U.uTime.value = still ? 6 : t;
      cur.lerp(goal, 0.1); U.uMouse.value.copy(cur);
      U.uHover.value += (hoverGoal - U.uHover.value) * 0.06;
      group.rotation.y += (tiltX * 0.42 + (still ? 0 : Math.sin(t * 0.3) * 0.08) - group.rotation.y) * 0.06;
      group.rotation.x += (-tiltY * 0.3 - group.rotation.x) * 0.06;
      renderer.render(scene, camera);
    }
    const loop = () => { raf = 0; if (stopped || !visible) return; frame(); raf = requestAnimationFrame(loop); };
    io = new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) seen = true;
      if (visible && !raf && !still) { last = performance.now(); loop(); }
    }, { threshold: 0.2 });
    io.observe(host); ro.observe(host); resize();
    if (still) frame();

    disposer = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      geo.dispose(); mat.dispose(); renderer.dispose(); canvas.remove();
    };
  }).catch(() => {});

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    ro && ro.disconnect(); io && io.disconnect();
    disposer && disposer();
  };
}
