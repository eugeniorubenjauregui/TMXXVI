import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export function initCommerceGraphic(container) {
  if (!container) return () => {};

  const width = container.clientWidth || 420;
  const height = 200;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  camera.position.z = 100;

  // Create nodes
  const positions = [
    { x: -150, y: 0 },
    { x: -75, y: 50 },
    { x: 0, y: -30 },
    { x: 75, y: 40 },
    { x: 150, y: 0 }
  ];

  const nodeGeom = new THREE.BufferGeometry();
  const nodePositions = [];
  positions.forEach(p => nodePositions.push(p.x, p.y, 0));
  nodeGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nodePositions), 3));

  const nodeMat = new THREE.PointsMaterial({ color: 0x80E593, size: 6 });
  const nodes = new THREE.Points(nodeGeom, nodeMat);
  scene.add(nodes);

  // Create connecting lines
  const lineGeom = new THREE.BufferGeometry();
  const linePositions = [];
  for (let i = 0; i < positions.length - 1; i++) {
    linePositions.push(positions[i].x, positions[i].y, 0);
    linePositions.push(positions[i + 1].x, positions[i + 1].y, 0);
  }
  lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePositions), 3));

  const lineMat = new THREE.LineBasicMaterial({ color: 0x80E593, linewidth: 2, transparent: true, opacity: 0.6 });
  const lines = new THREE.LineSegments(lineGeom, lineMat);
  scene.add(lines);

  let time = 0;
  const animate = () => {
    time += 0.01;

    // Pulsate nodes
    nodeMat.size = 6 + Math.sin(time * 2) * 1.5;
    lineMat.opacity = 0.4 + Math.sin(time * 1.5) * 0.2;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();

  return () => {
    container.removeChild(renderer.domElement);
    renderer.dispose();
  };
}

export function initRetailGraphic(container) {
  if (!container) return () => {};

  const width = container.clientWidth || 420;
  const height = 200;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  camera.position.z = 100;

  // Create rotating rings
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const geometry = new THREE.BufferGeometry();
    const points = [];
    const radius = 20 + i * 20;
    for (let j = 0; j < 64; j++) {
      const angle = (j / 64) * Math.PI * 2;
      points.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    }
    points.push(points[0], points[1], points[2]); // Close the loop
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x80E593,
      linewidth: 2,
      transparent: true,
      opacity: 0.5 - i * 0.1
    });

    const line = new THREE.Line(geometry, material);
    line.userData.rotSpeed = 0.005 + i * 0.003;
    scene.add(line);
    rings.push(line);
  }

  let time = 0;
  const animate = () => {
    time += 0.016;

    rings.forEach((ring, i) => {
      ring.rotation.z += ring.userData.rotSpeed * (i % 2 === 0 ? 1 : -1);
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();

  return () => {
    container.removeChild(renderer.domElement);
    renderer.dispose();
  };
}

export function initCloudGraphic(container) {
  if (!container) return () => {};

  const width = container.clientWidth || 420;
  const height = 200;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  camera.position.z = 100;

  // Create area chart
  const points = [
    -150, -40, 0,
    -100, -60, 0,
    -50, 20, 0,
    0, -10, 0,
    50, 40, 0,
    100, 0, 0,
    150, 60, 0
  ];

  // Chart line
  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0x80E593, linewidth: 3 });
  const line = new THREE.Line(lineGeom, lineMat);
  scene.add(line);

  // Area fill
  const areaPoints = [
    -150, -40, 0,
    -100, -60, 0,
    -50, 20, 0,
    0, -10, 0,
    50, 40, 0,
    100, 0, 0,
    150, 60, 0,
    150, 80, 0,
    100, 80, 0,
    50, 80, 0,
    0, 80, 0,
    -50, 80, 0,
    -100, 80, 0,
    -150, 80, 0
  ];

  const areaGeom = new THREE.BufferGeometry();
  areaGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(areaPoints), 3));

  const indices = [];
  for (let i = 0; i < 7; i++) {
    indices.push(i, i + 7, i + 1);
    if (i < 6) indices.push(i + 1, i + 7, i + 8);
  }
  areaGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

  const areaMat = new THREE.MeshBasicMaterial({
    color: 0x80E593,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide
  });
  const area = new THREE.Mesh(areaGeom, areaMat);
  scene.add(area);

  let time = 0;
  const animate = () => {
    time += 0.01;

    // Subtle wave animation
    const positions = lineGeom.attributes.position.array;
    for (let i = 0; i < 7; i++) {
      positions[i * 3 + 1] += Math.sin(time + i * 0.5) * 0.3;
    }
    lineGeom.attributes.position.needsUpdate = true;

    areaMat.opacity = 0.15 + Math.sin(time * 0.5) * 0.05;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };

  animate();

  return () => {
    container.removeChild(renderer.domElement);
    renderer.dispose();
  };
}
