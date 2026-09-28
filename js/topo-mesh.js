/* topo-mesh.js — malla topográfica de fondo (three.js, ESM por CDN).
   Un plano desplazado por ruido se dibuja solo con curvas de nivel en accent2.
   El cursor levanta una colina suave que deforma las curvas a su paso. */

const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';

const VERT = `
uniform float uTime; uniform vec2 uMouse; uniform float uHover;
varying float vH; varying vec2 vUv; varying float vM;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 perm(vec3 x){return mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=perm(perm(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.); m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5; vec3 ox=floor(x+.5); vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw; return 130.*dot(m,g);
}
void main(){
  vUv = uv;
  vec2 p = position.xy;
  float t = uTime * 0.035;
  float h = snoise(p*0.22 + vec2(t, -t*0.6)) * 0.9
          + snoise(p*0.5 - vec2(t*0.7, t)) * 0.32
          + snoise(p*1.1 + t) * 0.08;
  float d = distance(p, uMouse);
  float m = exp(-d*d*0.9) * uHover;
  h += m * 1.1;
  vH = h; vM = m;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, h*0.55, 1.0);
}`;

const FRAG = `
uniform vec3 uColor; uniform vec3 uWhite; uniform float uIn;
varying float vH; varying vec2 vUv; varying float vM;
float line(float v, float w){ float f = abs(fract(v) - 0.5); float df = fwidth(v); return 1.0 - smoothstep(df*(w-0.5), df*(w+0.5), f); }
void main(){
  float k = vH * 7.0 + 0.5;
  float minor = line(k, 1.0);
  float major = line(k / 5.0, 1.4);
  float e = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
  float a = (minor * 0.16 + major * 0.34 + vM * minor * 0.4) * e * uIn;
  if (a < 0.004) discard;
  vec3 c = mix(uColor, uWhite, vM * 0.35);
  gl_FragColor = vec4(c, a);
}`;

export function initTopoMesh(host, opts = {}) {
  if (!host) return () => {};
  const still = opts.motion === false ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const accent2 = opts.accent2 || '#52C7CF';
  const target = opts.pointerTarget || host.parentElement || host;
  let stopped = false, raf = 0, ro = null, io = null, visible = true, disposer = null;

  import(/* webpackIgnore: true */ THREE_URL).then(THREE => {
    if (stopped) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    host.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, -6.2, 5.4);
    camera.lookAt(0, 0.4, 0);

    const W = 16, H = 11;
    const geo = new THREE.PlaneGeometry(W, H, 260, 180);
    const U = {
      uTime: { value: 0 }, uIn: { value: still ? 1 : 0 },
      uMouse: { value: new THREE.Vector2(99, 99) }, uHover: { value: 0 },
      uColor: { value: new THREE.Color(accent2) }, uWhite: { value: new THREE.Color('#ffffff') }
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: U, transparent: true, depthWrite: false, extensions: { derivatives: true } });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const flat = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ visible: false }));
    scene.add(flat);
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const goal = new THREE.Vector2(99, 99), cur = new THREE.Vector2(99, 99);
    let hoverGoal = 0;

    const onMove = e => {
      const r = host.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(flat)[0];
      if (hit) { if (hoverGoal === 0) cur.copy(hit.point); goal.set(hit.point.x, hit.point.y); hoverGoal = 1; }
      else hoverGoal = 0;
    };
    const onLeave = () => { hoverGoal = 0; };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w / h < 1 ? 48 : 34;
      camera.updateProjectionMatrix();
    };
    resize();
    ro = new ResizeObserver(resize); ro.observe(host);
    io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf && !still) loop(); });
    io.observe(host);

    const t0 = performance.now();
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      U.uTime.value = still ? 12 : t;
      if (!still) U.uIn.value = Math.min(1, t / 2.2);
      cur.lerp(goal, 0.08);
      U.uMouse.value.copy(cur);
      U.uHover.value += (hoverGoal - U.uHover.value) * 0.05;
      renderer.render(scene, camera);
    };
    const loop = () => {
      raf = 0;
      if (stopped || !visible) return;
      frame();
      raf = requestAnimationFrame(loop);
    };
    if (still) {
      frame();
      target.addEventListener('pointermove', frame);
    } else loop();

    disposer = () => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointermove', frame);
      geo.dispose(); mat.dispose(); flat.geometry.dispose(); flat.material.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }).catch(() => {});

  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    ro && ro.disconnect(); io && io.disconnect();
    disposer && disposer();
  };
}
