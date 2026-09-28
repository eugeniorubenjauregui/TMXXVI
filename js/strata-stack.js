/* strata-stack.js — seis capas de partículas que caen y se asientan una sobre otra (three.js).
   ecommerce → marketplaces → omnicanalidad → CRM → app → IA. Cada capa aterriza sobre la
   anterior con un pequeño rebote; un pulso sube desde la base atravesando todas. El cursor
   ilumina la capa más cercana e inclina la pila. initStrata(host, { accent, accent2, motion, labels }) -> dispose() */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const LAYERS = ['ECOMMERCE', 'MARKETPLACES', 'OMNICANALIDAD', 'CRM', 'APP', 'IA'];

const VERT = `
attribute float aL; attribute vec2 aUV; attribute float aR;
uniform float uTime, uPix, uHot, uPulse;
uniform float uDrop[6];
varying float vB, vL, vEdge;
void main(){
  int li = int(aL + 0.5);
  float d = uDrop[li];
  vec3 p = position;
  p.y += d * 2.6;
  p.y += sin(uTime * 0.9 + aUV.x * 6.0 + aUV.y * 4.0 + aL) * 0.01;
  float edge = max(abs(aUV.x - 0.5), abs(aUV.y - 0.5)) * 2.0;
  edge = smoothstep(0.86, 1.0, edge);
  float hot = exp(-pow(aL - uHot, 2.0) * 3.0) * step(0.0, uHot);
  float pulse = exp(-pow(aL - uPulse, 2.0) * 1.6);
  float land = 1.0 - smoothstep(0.0, 0.25, d);
  vB = (0.18 + edge * 0.55 + hot * 0.7 + pulse * 0.45 + aR * 0.08) * land * (1.0 - d * 0.7);
  vL = aL / 5.0; vEdge = edge;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPix * (4.5 + edge * 2.5 + hot * 2.0) * (4.0 / -mv.z);
}`;
const FRAG = `
uniform vec3 uA, uB;
varying float vB, vL, vEdge;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = exp(-d * d * 4.0);
  vec3 col = mix(uB, uA, vL);
  col = mix(col, vec3(1.0), clamp(vB - 0.75, 0.0, 0.6));
  float o = a * vB;
  gl_FragColor = vec4(col * o, o);
}`;

export function initStrata(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const target = host.parentElement || host;
  const labels = opts.labels || LAYERS;
  let stopped = false, raf = 0, ro = null, io = null, visible = false, seen = false, disposer = null;

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    const pix = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pix); renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(canvas);

    const G = 22, GAP = 0.3, W = 1.5;
    const pos = [], aL = [], aUV = [], aR = [];
    for (let l = 0; l < 6; l++) {
      const w = W * (1 - l * 0.07);
      for (let iz = 0; iz < G; iz++) for (let ix = 0; ix < G; ix++) {
        const u = ix / (G - 1), v = iz / (G - 1);
        pos.push((u - 0.5) * w, (l - 2.5) * GAP, (v - 0.5) * w);
        aL.push(l); aUV.push(u, v); aR.push(Math.random());
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('aL', new THREE.BufferAttribute(new Float32Array(aL), 1));
    geo.setAttribute('aUV', new THREE.BufferAttribute(new Float32Array(aUV), 2));
    geo.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(aR), 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

    const drops = new Array(6).fill(still ? 0 : 1);
    const U = {
      uTime: { value: 0 }, uPix: { value: pix }, uHot: { value: -1 }, uPulse: { value: -9 }, uDrop: { value: drops },
      uA: { value: new THREE.Color(opts.accent || '#80E593') }, uB: { value: new THREE.Color(opts.accent2 || '#52C7CF') }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const scene = new THREE.Scene(), group = new THREE.Group();
    group.add(new THREE.Points(geo, mat));
    group.rotation.y = 0.62;
    scene.add(group);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 1.6, 5.4); camera.lookAt(0, 0, 0);

    const tags = labels.map((txt, i) => {
      const el = document.createElement('span');
      el.textContent = txt;
      el.style.cssText = "position:absolute;left:0;top:0;font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.16em;color:rgba(255,255,255,.62);white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .5s,color .3s;will-change:transform";
      host.appendChild(el);
      return el;
    });
    const anchor = new THREE.Vector3();

    let hotGoal = -1, hot = -1, tx = 0, ty = 0;
    const onMove = e => {
      const r = host.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -((e.clientY - r.top) / r.height) * 2 + 1;
      tx = Math.max(-1, Math.min(1, x)); ty = Math.max(-1, Math.min(1, y));
      let best = -1, bd = 0.2;
      for (let l = 0; l < 6; l++) {
        anchor.set(0, (l - 2.5) * GAP, 0); group.localToWorld(anchor); anchor.project(camera);
        const d = Math.abs(anchor.y - y);
        if (d < bd && Math.abs(x) < 0.95) { bd = d; best = l; }
      }
      hotGoal = best;
      if (still) frame();
    };
    const onLeave = () => { hotGoal = -1; tx = 0; ty = 0; };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);

    let W0 = 1, H0 = 1;
    const resize = () => {
      W0 = host.clientWidth || 1; H0 = host.clientHeight || 1;
      renderer.setSize(W0, H0, false); camera.aspect = W0 / H0;
      camera.fov = W0 / H0 < 0.9 ? 40 : 32; camera.updateProjectionMatrix();
      if (still) frame();
    };
    ro = new ResizeObserver(resize);

    let t = 0, tIn = 0, last = performance.now();
    const ease = x => { const c = 1.7; x = Math.min(1, Math.max(0, x)); return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
    function frame() {
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!still) {
        t += dt;
        if (seen) tIn += dt;
        for (let l = 0; l < 6; l++) drops[l] = 1 - ease((tIn - l * 0.42) / 0.8);
        const cyc = (t % 5.5) / 5.5;
        U.uPulse.value = tIn > 3.2 ? cyc * 8 - 1.5 : -9;
      }
      U.uTime.value = still ? 3 : t;
      hot += ((hotGoal < 0 ? -1 : hotGoal) - hot) * (hotGoal < 0 ? 0.2 : 0.15);
      U.uHot.value = hotGoal < 0 && hot < -0.5 ? -1 : hot;
      group.rotation.y += (0.62 + tx * 0.28 + (still ? 0 : Math.sin(t * 0.25) * 0.06) - group.rotation.y) * 0.05;
      group.rotation.x += (-ty * 0.1 - group.rotation.x) * 0.05;
      renderer.render(scene, camera);
      tags.forEach((el, l) => {
        const w = W * (1 - l * 0.07);
        anchor.set(w * 0.5 + 0.1, (l - 2.5) * GAP + drops[l] * 2.6, w * 0.5); group.localToWorld(anchor); anchor.project(camera);
        el.style.transform = `translate(${(anchor.x * 0.5 + 0.5) * W0 + 10}px,${(-anchor.y * 0.5 + 0.5) * H0 - 7}px)`;
        el.style.opacity = drops[l] < 0.05 ? '1' : '0';
        el.style.color = hotGoal === l ? (opts.accent || '#80E593') : 'rgba(255,255,255,.62)';
      });
    }
    const loop = () => { raf = 0; if (stopped || !visible) return; frame(); raf = requestAnimationFrame(loop); };
    io = new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible) seen = true;
      if (visible && !raf && !still) { last = performance.now(); loop(); }
    }, { threshold: 0.25 });
    io.observe(host); ro.observe(host); resize();
    if (still) frame();

    disposer = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      tags.forEach(el => el.remove());
      geo.dispose(); mat.dispose(); renderer.dispose(); canvas.remove();
    };
  }).catch(err => console.error('strata-stack:', err));

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    ro && ro.disconnect(); io && io.disconnect();
    disposer && disposer();
  };
}
