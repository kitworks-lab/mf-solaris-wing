import * as THREE from 'three';

export const RUNWAY_SPEC = { x0: -260, x1: 260, halfWidth: 18, width: 36, length: 520, y: 18, z: 0, heading: 90 };
export const WORLD_SIZE = 3600;
const SEA = 0;
export const getSeaLevel = () => SEA;

const MOODS = {
  golden: { zenith: '#2f5d86', horizon: '#f3b97a', haze: '#f6c48a', sun: '#ffd49a', sunDir: [0.46, 0.39, -0.8], sunI: 2.6, hemiSky: '#e3dbe0', hemiGround: '#8a7058', hemiI: 1.25, ambI: 0.32, fog: '#e5b787', fogD: 0.00034, deep: '#0a3a52', shallow: '#2fb3a8' },
  dusk: { zenith: '#1b2340', horizon: '#e0704a', haze: '#c4607a', sun: '#ff8f5a', sunDir: [0.47, 0.34, -0.81], sunI: 2.0, hemiSky: '#9a92b8', hemiGround: '#6a5058', hemiI: 1.3, ambI: 0.34, fog: '#a2566a', fogD: 0.00040, deep: '#071a33', shallow: '#2a7f8e' },
  morning: { zenith: '#3f7fb5', horizon: '#dbe6ea', haze: '#eef0e6', sun: '#fff1d2', sunDir: [-0.6, 0.45, -0.5], sunI: 2.9, hemiSky: '#d6e8f7', hemiGround: '#7a735e', hemiI: 0.9, ambI: 0.2, fog: '#cfdde2', fogD: 0.00030, deep: '#0b4562', shallow: '#3cc4b9' },
};

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z, oct, seed) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, z * f, seed + i * 17); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}
const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (dx, dz, r) => Math.exp(-(dx * dx + dz * dz) / (r * r));

const CALDERA = { x: 900, z: -650 };
const PLATEAU = { x0: -420, x1: 520, halfZ: 110 };

function rawHeight(x, z) {
  const n = fbm(x / 520 + 11.3, z / 520 + 4.7, 5, 7);
  const warp = fbm(x / 900 + 3, z / 900 + 9, 3, 3);
  const main = gauss(x - 80, (z + 20) * 1.3, 620) * 1.0 + gauss(x - 520, z - 60, 380) * 0.45;
  const east = gauss(x - CALDERA.x, z - CALDERA.z, 640) * 1.0;
  const north = gauss(x + 250, z + 620, 360) * 0.6 + gauss(x + 520, z + 330, 130) * 0.9;
  const south = gauss(x - 300, z - 780, 420) * 0.5 + gauss(x + 700, z - 600, 260) * 0.45;
  const land = (main + east + north + south) * (0.78 + 0.5 * warp) + (n - 0.5) * 0.55;
  let h = (land - 0.32) * 190;

  const dc = Math.hypot(x - CALDERA.x, z - CALDERA.z);
  const ridge = Math.exp(-((dc - 330) ** 2) / (150 * 150));
  const crater = Math.exp(-(dc * dc) / (200 * 200));
  h += ridge * (330 + 60 * fbm(x / 120, z / 120, 3, 21)) - crater * 230;

  const canyonZ = 300 + 90 * Math.sin(x / 260) + 40 * Math.sin(x / 90);
  const cd = Math.abs(z - canyonZ);
  const inRange = smoothstep(-100, 200, x) * (1 - smoothstep(800, 1100, x));
  h -= Math.exp(-(cd * cd) / (55 * 55)) * 240 * inRange;

  const terraceBase = Math.max(h, 0);
  if (h > 4 && h < 140) h = h * 0.4 + 0.6 * (Math.floor(terraceBase / 14) * 14 + smoothstep(0, 1, (terraceBase % 14) / 14) * 14);

  const edge = Math.max(Math.abs(x) / (WORLD_SIZE / 2), Math.abs(z) / (WORLD_SIZE / 2));
  h -= smoothstep(0.82, 1, edge) * 160;

  const westFade = smoothstep(-640, -300, x);
  const plateauField = Math.max(0, 1 - Math.max(0, (Math.abs(z) - PLATEAU.halfZ) / 160)) * smoothstep(PLATEAU.x0 - 120, PLATEAU.x0 + 60, x) * (1 - smoothstep(PLATEAU.x1 - 10, PLATEAU.x1 + 260, x));
  const base = x < -260 ? Math.min(h, -8 + westFade * 26) : h;
  let out = x < -260 && Math.abs(z) < 420 ? Math.min(base, -3 - smoothstep(-300, -900, x) * 40) + (x > -420 ? (x + 420) / 160 * (RUNWAY_SPEC.y + 3) * smoothstep(-420, -270, x) * 0 : 0) : h;
  if (x < -260 && Math.abs(z) >= 420) out = h;

  const lighthouseCliff = gauss(x + 460, z + 220, 70) * 62;
  out += lighthouseCliff * (1 - smoothstep(-900, -300, 0)) ;

  const pw = plateauField;
  const plateauH = RUNWAY_SPEC.y - 0.35;
  if (x >= -300) out = out + (plateauH - out) * pw;
  const cliff = smoothstep(-330, -262, x) * (1 - smoothstep(-262, -250, x));
  if (Math.abs(z) < PLATEAU.halfZ + 120) out = x < -262 ? Math.min(out, x > -340 ? plateauH - (x + 262) * -0.0 - smoothstep(-262, -340, x) * 40 : out) : out;
  return out + cliff * 0;
}

export function getTerrainHeight(x, z) {
  const runway = x >= RUNWAY_SPEC.x0 - 6 && x <= RUNWAY_SPEC.x1 + 6 && Math.abs(z) <= RUNWAY_SPEC.halfWidth + 4;
  if (runway) return RUNWAY_SPEC.y - 0.1;
  return rawHeight(x, z);
}

function heightColor(h, slope, x, z, c) {
  const jitter = fbm(x / 14, z / 14, 2, 5) - 0.5;
  if (h < 0.6) c.set('#5a7f86').lerp(new THREE.Color('#2b5560'), Math.min(1, -h / 40));
  else if (h < 3.2) c.set('#e6d3a2').offsetHSL(0, 0, jitter * 0.08);
  else if (slope > 0.62) c.set(h > 40 ? '#5a4a40' : (Math.sin(h * 0.35) > 0 ? '#d19a58' : '#a8703f')).offsetHSL(0, 0, jitter * 0.12);
  else if (h < 28) c.set('#8f9a4a').lerp(new THREE.Color('#4f8a45'), smoothstep(3, 28, h)).offsetHSL(0, 0, jitter * 0.1);
  else if (h < 150) c.set('#3f8a52').lerp(new THREE.Color('#2f6a46'), smoothstep(28, 150, h)).offsetHSL(0, 0, jitter * 0.1);
  else if (h < 260) c.set('#4a4b4d').lerp(new THREE.Color('#6a645e'), smoothstep(150, 260, h)).offsetHSL(0, 0, jitter * 0.1);
  else c.set('#6a645e').lerp(new THREE.Color('#fff4dc'), smoothstep(250, 300, h + jitter * 40));
  return c;
}

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

function detailTexture() {
  const canvas = makeCanvas(256);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = 200 + 55 * (fbm(x / 10, y / 10, 3, 2) - 0.5) + 30 * (hash2(x, y, 9) - 0.5);
    const i = (y * 256 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(220, 220);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildTerrain() {
  const seg = 180;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) heights[i] = getTerrainHeight(pos.getX(i), pos.getZ(i));
  const c = new THREE.Color();
  const step = WORLD_SIZE / seg;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heights[i];
    pos.setY(i, h);
    const dx = getTerrainHeight(x + step, z) - getTerrainHeight(x - step, z);
    const dz = getTerrainHeight(x, z + step) - getTerrainHeight(x, z - step);
    const slope = Math.hypot(dx, dz) / (2 * step);
    heightColor(h, slope, x, z, c);
    if (x >= RUNWAY_SPEC.x0 - 40 && x <= RUNWAY_SPEC.x1 + 40 && Math.abs(z) < 60) c.lerp(new THREE.Color('#9a9a78'), 0.5);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTexture(), roughness: 0.95, metalness: 0 }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function runwayTexture() {
  const W = 512, H = 4096 / 4;
  const canvas = document.createElement('canvas');
  canvas.width = 2048; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#34363a'; ctx.fillRect(0, 0, 2048, 256);
  for (let i = 0; i < 9000; i++) { const g = 40 + Math.random() * 0 + hash2(i, 3, 1) * 40; ctx.fillStyle = `rgba(${g},${g},${g + 3},0.35)`; ctx.fillRect(hash2(i, 1, 2) * 2048, hash2(i, 2, 2) * 256, 2, 2); }
  ctx.fillStyle = '#eceae2';
  for (const x0 of [30, 2048 - 30 - 150]) for (let k = 0; k < 8; k++) { ctx.fillRect(x0, 30 + k * 24 - 0, 150, 12); }
  ctx.fillRect(0, 6, 2048, 5); ctx.fillRect(0, 245, 2048, 5);
  for (let x = 280; x < 2048 - 280; x += 100) ctx.fillRect(x, 124, 54, 8);
  ctx.font = 'bold 76px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(250 + 50, 128); ctx.rotate(Math.PI / 2); ctx.fillText('09', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(2048 - 300, 128); ctx.rotate(-Math.PI / 2); ctx.fillText('27', 0, 0); ctx.restore();
  ctx.fillRect(190, 18, 6, 220); ctx.fillRect(2048 - 196, 18, 6, 220);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  void W; void H;
  return tex;
}

function glowMat(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color: '#222', emissive: color, emissiveIntensity: intensity });
}

function buildAirstrip(group, dyn) {
  const R = RUNWAY_SPEC;
  const rwy = new THREE.Mesh(new THREE.PlaneGeometry(R.length, R.width), new THREE.MeshStandardMaterial({ map: runwayTexture(), roughness: 0.85 }));
  rwy.rotation.x = -Math.PI / 2; rwy.position.set(0, R.y + 0.06, 0); rwy.receiveShadow = true;
  group.add(rwy);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(R.length + 80, 1.2, 110), new THREE.MeshStandardMaterial({ color: '#8b8a78', roughness: 1 }));
  apron.position.set(0, R.y - 0.7, 0); apron.receiveShadow = true;
  group.add(apron);

  const beaconGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const edgeMat = glowMat('#ffb84a', 2.2), greenMat = glowMat('#38e07a', 2.5), redMat = glowMat('#ff3b30', 2.5);
  const edge = new THREE.InstancedMesh(beaconGeo, edgeMat, 2 * 27);
  const m = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < 27; i++) for (const s of [-1, 1]) { m.setPosition(R.x0 + (i / 26) * R.length, R.y + 0.5, s * (R.halfWidth + 1.2)); edge.setMatrixAt(n++, m); }
  group.add(edge);
  const thr = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 8, 6), greenMat, 12);
  const end = new THREE.InstancedMesh(beaconGeo, redMat, 12);
  for (let i = 0; i < 12; i++) {
    const z = -R.halfWidth + (i + 0.5) * (R.width / 12);
    m.setPosition(R.x0 + 0.5, R.y + 0.5, z); thr.setMatrixAt(i, m);
    m.setPosition(R.x1 - 0.5, R.y + 0.5, z); end.setMatrixAt(i, m);
  }
  group.add(thr, end);
  const barMat = new THREE.MeshStandardMaterial({ color: '#f4f1e8', emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.8 });
  for (let i = 0; i < 8; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 1.6), barMat);
    bar.position.set(R.x0 + 4 + 7, R.y + 0.34, -R.halfWidth + 3 + i * 4);
    group.add(bar);
  }
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, R.width + 12), glowMat('#38e07a', 3));
  wing.position.set(R.x0 - 1, R.y + 0.3, 0);
  group.add(wing);
  const approachGeo = new THREE.InstancedMesh(beaconGeo, edgeMat, 14);
  for (let i = 0; i < 14; i++) { m.setPosition(R.x0 - 20 - i * 30, R.y + 0.6 + i * 0.3, 0); approachGeo.setMatrixAt(i, m); }
  group.add(approachGeo);
  dyn.beacons = [edgeMat, approachGeo.material];

  const papi = [];
  const post = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 16), new THREE.MeshStandardMaterial({ color: '#444a52' }));
  post.position.set(R.x0 + 80, R.y + 0.7, -R.halfWidth - 14);
  group.add(post);
  for (let i = 0; i < 4; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#ffffff', emissiveIntensity: 3.5 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.6), mat);
    lamp.position.set(R.x0 + 80, R.y + 1.8, -R.halfWidth - 14 + (i - 1.5) * 4);
    group.add(lamp); papi.push(mat);
  }
  dyn.papi = papi;
  dyn.papiPos = new THREE.Vector3(R.x0 + 80, R.y, -R.halfWidth - 14);

  const hangar = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: '#ecdfc0', metalness: 0.35, roughness: 0.5, side: THREE.DoubleSide, emissive: '#6b5a3a', emissiveIntensity: 0.25 });
  const slate = new THREE.MeshStandardMaterial({ color: '#56626f', metalness: 0.5, roughness: 0.45, emissive: '#1e252d', emissiveIntensity: 0.3 });
  const bayGlow = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffa94a', emissiveIntensity: 1.6, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.6, 30), new THREE.MeshStandardMaterial({ color: '#d9b27a', emissive: '#ff9f3f', emissiveIntensity: 0.7, roughness: 0.8 }));
  floor.position.y = 0.3;
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 30), bayGlow);
  backWall.position.set(-20, 3.3, 0);
  const sideA = new THREE.Mesh(new THREE.BoxGeometry(40, 6, 0.6), slate);
  sideA.position.set(0, 3.3, -15);
  const sideB = sideA.clone(); sideB.position.z = 15;
  const roofShell = new THREE.Mesh(new THREE.CylinderGeometry(15.4, 15.4, 40.6, 32, 1, true, 0, Math.PI), cream);
  roofShell.rotation.z = Math.PI / 2; roofShell.scale.set(0.45, 1, 1); roofShell.position.y = 6.3;
  const gable = new THREE.Mesh(new THREE.CircleGeometry(15, 32, 0, Math.PI), bayGlow);
  gable.scale.set(1, 0.45, 1); gable.rotation.y = Math.PI / 2; gable.position.set(-19.8, 6.3, 0);
  hangar.add(floor, backWall, sideA, sideB, roofShell, gable);
  const ribGeo = new THREE.TorusGeometry(15.5, 0.3, 6, 32, Math.PI);
  for (let i = 0; i < 17; i++) {
    const rib = new THREE.Mesh(ribGeo, i % 4 === 0 ? slate : cream);
    rib.scale.set(1, 0.45, 1); rib.rotation.y = Math.PI / 2; rib.position.set(-20 + i * 2.5, 6.3, 0);
    hangar.add(rib);
  }
  const glow = new THREE.PointLight('#ffb55a', 90, 60, 1.4); glow.position.set(0, 5, 0);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 1), new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd08a', emissiveIntensity: 2.5 }));
  strip.position.set(-2, 11, 0); strip.rotation.y = Math.PI / 2; strip.scale.x = 0.8;
  hangar.add(glow, strip);
  for (const sz of [-15, 15]) { const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6.6, 1.2), slate); post.position.set(20, 3.3, sz); hangar.add(post); }
  hangar.rotation.y = Math.PI / 2;
  hangar.position.set(60, R.y, 62);
  group.add(hangar);

  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 22, 12), new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.8 }));
  shaft.position.y = 11;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 4.5, 12), new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffb84a', emissiveIntensity: 1.3, transparent: true, opacity: 0.9 }));
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(5.15, 4.15, 3.2, 12, 1, true), new THREE.MeshStandardMaterial({ color: '#7ff0ff', emissive: '#38d8f0', emissiveIntensity: 1.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  glass.position.y = 24.3;
  const cabLight = new THREE.PointLight('#ffc060', 40, 60, 1.5); cabLight.position.y = 24.3;
  cab.position.y = 24.3;
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.8, 12), new THREE.MeshStandardMaterial({ color: '#d9462b' }));
  capT.position.y = 27;
  const dish = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 1), new THREE.MeshStandardMaterial({ color: '#cfd4d8', metalness: 0.7, roughness: 0.3 }));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4), new THREE.MeshStandardMaterial({ color: '#888' }));
  mast.position.y = -1.2; bar.position.y = 0.2; dish.add(bar); dish.position.y = 29.4;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 3), new THREE.MeshStandardMaterial({ color: '#cfd4d8', emissive: '#38d8f0', emissiveIntensity: 0.6 }));
  blade.position.set(3.2, 1.4, 0); dish.add(blade);
  tower.add(shaft, cab, glass, cabLight, capT, dish, mast);
  mast.position.y = 28.4;
  tower.position.set(-70, R.y, 52);
  group.add(tower);
  dyn.radar = dish;

  const sock = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 9), new THREE.MeshStandardMaterial({ color: '#ddd' }));
  pole.position.y = 4.5;
  const segs = [];
  let parent = new THREE.Group(); parent.position.y = 9; sock.add(pole, parent);
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.1 - i * 0.12, 0.98 - i * 0.12, 1.6, 12, 1, true), new THREE.MeshStandardMaterial({ color: i % 2 ? '#fbf5ea' : '#ff6a1f', emissive: i % 2 ? '#8a8478' : '#8a3510', emissiveIntensity: 0.5, side: THREE.DoubleSide }));
    seg.rotation.z = -Math.PI / 2; seg.position.x = 0.8;
    const joint = new THREE.Group(); joint.position.x = i === 0 ? 0 : 1.6; joint.add(seg);
    parent.add(joint); parent = joint; segs.push(joint);
  }
  sock.position.set(200, R.y, -34);
  group.add(sock);
  dyn.windsock = { root: sock, segs, base: sock.children[1] };
}

function buildLighthouse(group, dyn) {
  const lx = -460, lz = -220;
  const lh = new THREE.Group();
  const baseY = getTerrainHeight(lx, lz);
  const tower = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const r0 = 6.2 - i * 0.55, r1 = 5.65 - i * 0.55;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 6, 16), new THREE.MeshStandardMaterial({ color: i % 2 ? '#d9462b' : '#f4efe6', roughness: 0.8 }));
    seg.position.y = 3 + i * 6; seg.castShadow = true; tower.add(seg);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.7, 16), new THREE.MeshStandardMaterial({ color: '#232a34' }));
  gallery.position.y = 36.2;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.6, 12), new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffbf4a', emissiveIntensity: 3, transparent: true, opacity: 0.92 }));
  lantern.position.y = 38.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 3, 12), new THREE.MeshStandardMaterial({ color: '#232a34' }));
  roof.position.y = 41.7;
  tower.add(gallery, lantern, roof);
  const beamGroup = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(14, 260, 20, 1, true), beamMat);
  cone.rotation.z = -Math.PI / 2; cone.position.x = 130;
  const cone2 = cone.clone(); cone2.position.x = -130; cone2.rotation.z = Math.PI / 2;
  beamGroup.add(cone, cone2); beamGroup.position.y = 38.4;
  const light = new THREE.PointLight('#ffc860', 90, 120, 1.5); light.position.y = 38.4;
  tower.add(beamGroup, light);
  lh.add(tower);
  lh.position.set(lx, baseY, lz);
  group.add(lh);
  dyn.lighthouse = beamGroup;
}

function buildDepthTexture() {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let iz = 0; iz < size; iz++) for (let ix = 0; ix < size; ix++) {
    const x = (ix / (size - 1) - 0.5) * WORLD_SIZE, z = (iz / (size - 1) - 0.5) * WORLD_SIZE;
    const depth = Math.min(Math.max(-rawHeight(x, z), -40), 200);
    const o = (iz * size + ix) * 4;
    data[o] = Math.round((depth + 40) / 240 * 255); data[o + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildOcean() {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.6, WORLD_SIZE * 1.6, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 }, uDeep: { value: new THREE.Color('#0a3a52') }, uShallow: { value: new THREE.Color('#2fb3a8') },
    uSunDir: { value: new THREE.Vector3(0.46, 0.39, -0.8).normalize() }, uSunColor: { value: new THREE.Color('#ffd49a') },
    uFog: { value: new THREE.Color('#f3b97a') }, uFogD: { value: 0.00034 },
    uDepthMap: { value: buildDepthTexture() }, uWorld: { value: WORLD_SIZE },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: false,
    vertexShader: `uniform float uTime; varying vec3 vW;
      float wave(vec2 p){return sin(p.x*0.021+uTime*0.8)*0.5+sin(p.y*0.033-uTime*0.6)*0.4+sin((p.x+p.y)*0.05+uTime*1.1)*0.2;}
      void main(){vec4 w=modelMatrix*vec4(position,1.0); w.y+=wave(w.xz); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float uTime,uFogD,uWorld; uniform vec3 uDeep,uShallow,uSunDir,uSunColor,uFog; uniform sampler2D uDepthMap; varying vec3 vW;
      float h(vec2 p){return sin(p.x*0.12+uTime*1.3)*sin(p.y*0.1-uTime*1.1)*0.6+sin((p.x-p.y)*0.21+uTime*1.9)*0.3+sin(p.x*0.045+p.y*0.037+uTime*0.7)*0.8;}
      float depthAt(vec2 p){vec2 uv=p/uWorld+0.5; if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) return 200.0; return texture2D(uDepthMap,uv).r*240.0-40.0;}
      void main(){
        vec2 p=vW.xz; float e=0.6;
        vec3 n=normalize(vec3(-(h(p+vec2(e,0.))-h(p-vec2(e,0.)))*0.05,1.0,-(h(p+vec2(0.,e))-h(p-vec2(0.,e)))*0.05));
        vec3 v=normalize(cameraPosition-vW);
        float fres=pow(1.0-max(dot(n,v),0.0),3.0);
        float dep=depthAt(p);
        float shoreT=1.0-smoothstep(0.0,60.0,dep);
        float deepT=smoothstep(8.0,140.0,dep);
        vec3 col=mix(uShallow,uDeep,pow(deepT,0.7));
        col=mix(col,uShallow*1.25+vec3(0.04,0.08,0.05),shoreT*0.55);
        float surfBand=smoothstep(0.0,2.0,dep)*(1.0-smoothstep(2.0,16.0,dep));
        float surf=surfBand*(0.55+0.45*sin(dep*0.7-uTime*1.4+h(p)*1.5));
        col=mix(col,vec3(0.95,0.98,0.96),clamp(surf,0.0,1.0)*0.38);
        col=mix(col,vec3(0.97,0.99,0.97),(1.0-smoothstep(0.0,3.5,dep))*0.45);
        vec3 r=reflect(-uSunDir,n);
        float rv=max(dot(r,v),0.0);
        float spec=pow(rv,140.0)*2.2+pow(rv,24.0)*0.22;
        col+=uSunColor*spec*(1.0-surf*0.5);
        col=mix(col,uFog*1.05,fres*0.45);
        float d=length(cameraPosition-vW); float f=1.0-exp(-d*d*uFogD*uFogD);
        col=mix(col,uFog,clamp(f,0.0,1.0));
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const ocean = new THREE.Mesh(geo, mat);
  ocean.position.y = SEA;
  return ocean;
}

function buildSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.78, 0.26, -0.45).normalize() }, uSun: { value: new THREE.Color() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww;}',
    fragmentShader: `uniform vec3 uZenith,uHorizon,uHaze,uSunDir,uSun; varying vec3 vDir;
      void main(){
        vec3 d=normalize(vDir); float t=clamp(d.y,0.0,1.0);
        vec3 col=mix(uHorizon,uZenith,pow(t,0.55));
        float s=max(dot(d,normalize(uSunDir)),0.0);
        col+=uHaze*pow(s,6.0)*0.55*(1.0-t*0.6);
        col+=uSun*pow(s,48.0)*0.9;
        col+=vec3(1.0,0.97,0.9)*smoothstep(0.9993,0.9998,s)*3.0;
        float mie=exp(-abs(d.y)*9.0); col=mix(col,uHaze,mie*0.35);
        if(d.y<0.0) col=mix(uHorizon,uHaze*0.8,clamp(-d.y*4.0,0.0,1.0));
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

function buildClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, flatShading: false, emissive: '#f3d9c4', emissiveIntensity: 0.22 });
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const pos = geo.attributes.position;
  const top = new THREE.Color('#fff1da'), mid = new THREE.Color('#f6e4d8'), under = new THREE.Color('#d2aaa4'), blue = new THREE.Color('#8e9fb5');
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const y = pos.getY(v);
    if (y > 0.2) tmp.copy(mid).lerp(top, Math.min((y - 0.2) / 0.8, 1));
    else tmp.copy(mid).lerp(under, Math.min((0.2 - y) / 0.6, 1)).lerp(blue, Math.max(0, (-y - 0.3) / 0.7) * 0.8);
    colors[v * 3] = tmp.r; colors[v * 3 + 1] = tmp.g; colors[v * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  for (let i = 0; i < 38; i++) {
    const cloud = new THREE.Group();
    const px = (hash2(i, 1, 99) - 0.5) * 3800, pz = (hash2(i, 2, 99) - 0.5) * 3800, py = 380 + hash2(i, 3, 99) * 320;
    const size = 30 + hash2(i, 5, 99) * 40;
    const clusters = 2 + Math.floor(hash2(i, 4, 99) * 3);
    for (let c = 0; c < clusters; c++) {
      const cx = (hash2(i, 50 + c, 5) - 0.5) * size * 3.2, cz = (hash2(i, 60 + c, 5) - 0.5) * size * 1.8;
      const puffs = 5 + Math.floor(hash2(i, 70 + c, 5) * 4);
      for (let k = 0; k < puffs; k++) {
        const puff = new THREE.Mesh(geo, mat);
        const spread = 1 - k / puffs;
        const r = size * (0.38 + hash2(i, 10 + k + c * 13, 7) * 0.45) * (0.7 + spread * 0.5);
        puff.scale.set(r * 1.2, r * 0.8, r);
        puff.position.set(cx + (hash2(i, 20 + k + c * 13, 7) - 0.5) * size * 1.4, (spread - 0.2) * size * 0.55 + (hash2(i, 30 + k + c * 13, 7) - 0.5) * size * 0.15, cz + (hash2(i, 40 + k + c * 13, 7) - 0.5) * size * 0.9);
        cloud.add(puff);
      }
    }
    cloud.position.set(px, py, pz);
    group.add(cloud);
  }
  return group;
}

export function createTerrainWorld(scene, mood = 'golden') {
  const root = new THREE.Group();
  root.name = 'CalderaIsles';
  const dyn = {};
  const terrain = buildTerrain();
  const ocean = buildOcean();
  const sky = buildSky();
  const clouds = buildClouds();
  const sun = new THREE.DirectionalLight('#ffd49a', 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 1600;
  const sc = sun.shadow.camera; sc.left = -260; sc.right = 260; sc.top = 260; sc.bottom = -260;
  sun.shadow.bias = -0.0004;
  const hemi = new THREE.HemisphereLight('#cfe0f0', '#6b5a44', 1.2);
  const ambient = new THREE.AmbientLight('#cfe0f0', 0.3);
  root.add(terrain, ocean, clouds, sun, sun.target, hemi, ambient);
  buildAirstrip(root, dyn);
  buildLighthouse(root, dyn);
  scene.add(root, sky);
  scene.fog = new THREE.FogExp2('#f3b97a', 0.00034);

  const world = {
    root, terrain, ocean, sky, clouds, sun, hemi, ambient, mood: null, getTerrainHeight, getSeaLevel, RUNWAY_SPEC,
    sunDirection: new THREE.Vector3(),
    applyMood(name) { applyMoodTo(world, scene, name); },
    update(dt, camera, flightState) { updateWorld(world, dyn, dt, camera, flightState); },
  };
  applyMoodTo(world, scene, mood);
  return world;
}

let activeWorld = null;
function applyMoodTo(world, scene, name) {
  const m = MOODS[name] ?? MOODS.golden;
  world.mood = MOODS[name] ? name : 'golden';
  activeWorld = world;
  const u = world.sky.material.uniforms;
  u.uZenith.value.set(m.zenith); u.uHorizon.value.set(m.horizon); u.uHaze.value.set(m.haze); u.uSun.value.set(m.sun);
  world.sunDirection.set(...m.sunDir).normalize();
  u.uSunDir.value.copy(world.sunDirection);
  world.sun.color.set(m.sun); world.sun.intensity = m.sunI;
  world.sun.position.copy(world.sunDirection).multiplyScalar(800).add(new THREE.Vector3(0, 0, 0));
  world.hemi.color.set(m.hemiSky); world.hemi.groundColor.set(m.hemiGround); world.hemi.intensity = m.hemiI;
  world.ambient.color.set(m.hemiSky); world.ambient.intensity = m.ambI;
  scene.fog.color.set(m.horizon); scene.fog.density = m.fogD;
  scene.background = new THREE.Color(m.horizon);
  const o = world.ocean.material.uniforms;
  o.uDeep.value.set(m.deep); o.uShallow.value.set(m.shallow); o.uSunDir.value.copy(world.sunDirection);
  o.uSunColor.value.set(m.sun); o.uFog.value.set(m.horizon); o.uFogD.value = m.fogD;
}
export function applyMood(mood) {
  if (activeWorld) activeWorld.applyMood(mood);
}

function updateWorld(world, dyn, dt, camera, state) {
  const t = (world.time = (world.time ?? 0) + dt);
  world.ocean.material.uniforms.uTime.value = t;
  world.ocean.position.x = camera ? Math.round(camera.position.x / 100) * 100 : 0;
  world.ocean.position.z = camera ? Math.round(camera.position.z / 100) * 100 : 0;
  world.clouds.children.forEach((c, i) => {
    c.position.x += (3 + (i % 5)) * dt;
    if (c.position.x > 1900) c.position.x = -1900;
  });
  if (dyn.radar) dyn.radar.rotation.y = t * 2.2;
  if (dyn.lighthouse) dyn.lighthouse.rotation.y = t * 0.9;
  if (dyn.windsock) {
    const s = dyn.windsock;
    const dir = Math.PI + 0.25 * Math.sin(t * 0.2);
    s.base.rotation.y = dir;
    s.segs.forEach((j, i) => { j.rotation.z = (0.18 + i * 0.09) + 0.07 * Math.sin(t * 3 + i); });
  }
  if (dyn.beacons) dyn.beacons[0].emissiveIntensity = 1.8 + 0.6 * Math.sin(t * 4);
  if (dyn.papi && state) {
    const R = RUNWAY_SPEC;
    const dx = state.pos.x - dyn.papiPos.x, dy = state.pos.y - R.y;
    const angle = Math.atan2(dy, Math.max(-dx, 1)) * 180 / Math.PI;
    const offsets = [3.5, 3.2, 2.8, 2.5].reverse();
    dyn.papi.forEach((mat, i) => {
      const white = angle > offsets[i] - 0.0 - 0.0 + (i - 1.5) * 0 ;
      const threshold = [2.5, 2.8, 3.2, 3.5][i];
      const isWhite = angle > threshold;
      mat.emissive.set(isWhite ? '#ffffff' : '#ff2a1a');
      void white;
    });
  }
}
