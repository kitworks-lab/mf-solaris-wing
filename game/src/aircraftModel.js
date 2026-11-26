import * as THREE from 'three';

const C = { cream: '#F4EFE6', verm: '#D9462B', char: '#232A34', glass: '#1c3340' };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15, ...o });
const glow = (color, i = 2) => new THREE.MeshStandardMaterial({ color: '#111', emissive: color, emissiveIntensity: i });
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  return m;
}

function wingGeometry(span, rootChord, tipChord, sweep, thick) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span, sweep);
  shape.lineTo(span, sweep + tipChord);
  shape.lineTo(0, rootChord);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thick / 2, -rootChord * 0.35);
  return geo;
}

function makePanelTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), tex };
}

function drawPFD(ctx, w, h, s) {
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(70, 10, w - 140, h - 20); ctx.clip();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-(s.rollDeg ?? 0) * Math.PI / 180);
  const py = (s.pitchDeg ?? 0) * 5;
  ctx.fillStyle = '#4f7ea3'; ctx.fillRect(-300, -400 + py, 600, 400);
  ctx.fillStyle = '#7a5a36'; ctx.fillRect(-300, py, 600, 400);
  ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 2; ctx.fillStyle = '#f4efe6'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.beginPath(); ctx.moveTo(-300, py); ctx.lineTo(300, py); ctx.stroke();
  for (let d = -30; d <= 30; d += 10) if (d) { ctx.beginPath(); ctx.moveTo(-26, py - d * 5); ctx.lineTo(26, py - d * 5); ctx.stroke(); ctx.fillText(String(Math.abs(d)), 40, py - d * 5 + 4); }
  ctx.restore();
  ctx.strokeStyle = '#f2a93b'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(w / 2 - 50, h / 2); ctx.lineTo(w / 2 - 14, h / 2); ctx.lineTo(w / 2, h / 2 + 10); ctx.lineTo(w / 2 + 14, h / 2); ctx.lineTo(w / 2 + 50, h / 2); ctx.stroke();
  ctx.fillStyle = 'rgba(11,15,20,.85)'; ctx.fillRect(0, 0, 70, h); ctx.fillRect(w - 70, 0, 70, h);
  ctx.fillStyle = '#f4efe6'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(s.kts ?? 0)), 35, h / 2 + 8);
  ctx.fillText(String(Math.round((s.ft ?? 0) / 10) * 10), w - 35, h / 2 + 8);
  ctx.font = '11px monospace'; ctx.fillStyle = '#f2a93b';
  ctx.fillText('KTS', 35, 22); ctx.fillText('ALT FT', w - 35, 22);
  ctx.fillText(`VS ${Math.round((s.vsFpm ?? 0) / 10) * 10}`, w - 35, h - 14);
  ctx.fillStyle = '#f4efe6'; ctx.font = 'bold 16px monospace';
  ctx.fillText(String(Math.round(s.headingDeg ?? 0)).padStart(3, '0') + '°', w / 2, h - 12);
  if (s.stall) { ctx.fillStyle = '#d9462b'; ctx.font = 'bold 20px monospace'; ctx.fillText('STALL', w / 2, 40); }
}

function dial(ctx, cx, cy, r, label, value, max, color) {
  ctx.strokeStyle = '#3a4a5a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  const a = Math.PI * 0.75 + clamp(value / max, 0, 1) * Math.PI * 1.5;
  ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.75, a); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText(String(Math.round(value)), cx, cy + r * 0.62);
  ctx.fillStyle = color; ctx.font = 'bold 15px monospace'; ctx.fillText(label, cx, cy - r * 0.35);
}

function drawMFD(ctx, w, h, s) {
  const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#12202e'); grad.addColorStop(1, '#0a121b');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
  const fuel = s.fuelPct ?? 0;
  dial(ctx, 130, 100, 62, 'RPM', 800 + (s.throttle ?? 0) * 2000, 2800, '#6fe0a0');
  dial(ctx, 382, 100, 62, 'FUEL %', fuel, 100, fuel < 15 ? '#ff5a3c' : '#6fe0a0');
  dial(ctx, 130, 260, 62, 'THR %', (s.throttle ?? 0) * 100, 100, s.boosting ? '#ffb347' : '#8fd8ff');
  dial(ctx, 382, 260, 62, 'G-LOAD', (s.gLoad ?? 1) * 10, 90, '#ffb347');
  const led = (x, label, on, color) => {
    ctx.fillStyle = on ? color : '#26323f'; ctx.fillRect(x, 352, 140, 30);
    ctx.fillStyle = on ? '#06120a' : '#6a7886'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, x + 70, 373);
  };
  led(20, (s.gearProgress ?? 1) > 0.5 ? 'GEAR DN' : 'GEAR UP', true, (s.gearProgress ?? 1) > 0.5 ? '#6fe0a0' : '#ffb347');
  led(186, 'FLAPS ' + Math.round((s.flapsProgress ?? 0) * 2), (s.flapsProgress ?? 0) > 0.05, '#6fe0a0');
  led(352, 'BOOST', !!s.boosting, '#ffb347');
}

function drawRadar(ctx, w, h, s, time) {
  ctx.fillStyle = '#04150f'; ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.62, scale = 0.12;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  ctx.translate(cx, cy); ctx.rotate(-((s.headingDeg ?? 0) * Math.PI) / 180);
  const px = (s.pos?.x ?? 0) * scale, pz = (s.pos?.z ?? 0) * scale;
  ctx.translate(-px, -pz);
  ctx.fillStyle = '#0f6b4a'; ctx.strokeStyle = '#37e0a0'; ctx.lineWidth = 2;
  for (const [ix, iz, ir] of [[0, 0, 160], [-300, 180, 60], [500, -300, 90], [300, 450, 70], [-600, -350, 80]]) { ctx.beginPath(); ctx.arc(ix * scale, iz * scale, ir * scale * 1.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-1500 * scale, 0); ctx.lineTo(1500 * scale, 0); ctx.stroke();
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
  for (const r of [40, 25]) { ctx.beginPath(); ctx.arc(-300 * scale, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#2fbf8a'; ctx.lineWidth = 1;
  for (const r of [60, 120, 180]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(111,255,190,0.18)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 170, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 8, cy + 9); ctx.lineTo(cx - 8, cy + 9); ctx.fill();
  ctx.fillStyle = '#6fffbe'; ctx.font = 'bold 18px monospace'; ctx.textAlign = 'left';
  ctx.fillText('TAC MAP  RWY 09', 12, 26);
  ctx.fillText('HDG ' + String(Math.round(s.headingDeg ?? 0)).padStart(3, '0'), 12, h - 12);
  void time;
}

function drawGauge(ctx, size, label, value, max) {
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, size, size);
  const c = size / 2;
  ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c, c, c - 6, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5; ctx.beginPath(); ctx.moveTo(c + Math.cos(a) * (c - 10), c + Math.sin(a) * (c - 10)); ctx.lineTo(c + Math.cos(a) * (c - 20), c + Math.sin(a) * (c - 20)); ctx.stroke(); }
  const a = Math.PI * 0.75 + clamp(value / max, 0, 1) * Math.PI * 1.5;
  ctx.strokeStyle = '#f2a93b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(a) * (c - 14), c + Math.sin(a) * (c - 14)); ctx.stroke();
  ctx.fillStyle = '#e8dcc0'; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText(label, c, size - 14);
}

function buildExterior() {
  const g = new THREE.Group();
  const cream = std(C.cream, { roughness: 0.35 }), verm = std(C.verm, { roughness: 0.4 }), char = std(C.char, { roughness: 0.6, metalness: 0.4 });
  const metal = std('#8a929b', { metalness: 0.8, roughness: 0.3 });
  const parts = {};

  const fus = mesh(new THREE.CapsuleGeometry(0.62, 5.2, 8, 20), cream);
  fus.rotation.x = Math.PI / 2; fus.scale.set(1, 1, 0.9);
  g.add(fus);
  const tail = mesh(new THREE.ConeGeometry(0.55, 3.6, 16), cream, 0, 0.1, 4.6);
  tail.rotation.x = Math.PI / 2; g.add(tail);
  const spine = mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.5, 20), cream, 0, 0.02, 2.9); spine.rotation.x = Math.PI / 2; g.add(spine);
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.09, 0.42), glow('#0a0c10', 0.2), s * 0.6, -0.08, -2.72));
  const cowl = mesh(new THREE.CylinderGeometry(0.58, 0.66, 1.1, 20), char, 0, 0, -3.1);
  cowl.rotation.x = Math.PI / 2; g.add(cowl);
  for (const s of [-1, 1]) {
    const stripe = mesh(new THREE.BoxGeometry(0.06, 0.16, 4.4), verm, s * 0.6, 0.06, 0.2); g.add(stripe);
    const stripe2 = mesh(new THREE.BoxGeometry(0.05, 0.07, 4.4), verm, s * 0.61, -0.12, 0.2); g.add(stripe2);
  }
  const canopy = mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshPhysicalMaterial({ color: C.glass, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.62, clearcoat: 1, emissive: '#2a1a08', emissiveIntensity: 0.4 }), 0, 0.5, -0.7);
  canopy.scale.set(0.85, 0.75, 2.0); g.add(canopy);
  const frame = mesh(new THREE.TorusGeometry(0.4, 0.018, 8, 24, Math.PI), metal, 0, 0.45, -0.7, false); frame.rotation.y = Math.PI / 2; frame.scale.set(1, 1, 1.4); g.add(frame);
  const pilot = mesh(new THREE.SphereGeometry(0.17, 12, 10), char, 0, 0.62, -0.25, false); g.add(pilot);
  const dashGlow = new THREE.PointLight('#7ec8ff', 0.5, 2.5); dashGlow.position.set(0, 0.45, -1.2); g.add(dashGlow);
  const headrest = mesh(new THREE.BoxGeometry(0.3, 0.42, 0.14), char, 0, 0.5, -0.1); g.add(headrest);
  const glare = new THREE.PointLight('#ffb55a', 0.6, 3); glare.position.set(0, 0.55, -1.0); g.add(glare);

  const wingGeo = wingGeometry(5.4, 1.9, 0.9, 1.5, 0.12);
  const wings = {};
  for (const s of [-1, 1]) {
    const side = new THREE.Group();
    const wing = mesh(wingGeo, cream); if (s < 0) wing.scale.x = -1;
    wing.material = cream;
    side.add(wing);
    const tip = mesh(new THREE.BoxGeometry(0.9, 0.16, 0.95), verm, s * 5.0, 0.0, 0.6); side.add(tip);
    const aileron = new THREE.Group(); aileron.position.set(s * 4.2, 0.02, 1.55);
    aileron.add(mesh(new THREE.BoxGeometry(1.8, 0.07, 0.45), verm, s * 0.0 + s * 0.0, 0, 0.2));
    const flap = new THREE.Group(); flap.position.set(s * 1.7, 0.02, 1.35);
    flap.add(mesh(new THREE.BoxGeometry(1.7, 0.07, 0.5), char, 0, 0, 0.2));
    side.add(aileron, flap);
    const pod = new THREE.Group(); pod.position.set(s * 1.9, -0.28, 0.2);
    const nacelle = mesh(new THREE.CylinderGeometry(0.2, 0.17, 1.5, 14), metal); nacelle.rotation.x = Math.PI / 2;
    const intake = mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16), char, 0, 0, -0.75);
    const burnerOuter = mesh(new THREE.ConeGeometry(0.16, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ff9a2e', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, 1.75, false);
    burnerOuter.rotation.x = Math.PI / 2;
    const burnerCore = mesh(new THREE.ConeGeometry(0.09, 1.0, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#7ec8ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0, 1.45, false);
    burnerCore.rotation.x = Math.PI / 2;
    pod.add(nacelle, intake, burnerOuter, burnerCore);
    side.add(pod);
    const navColor = s < 0 ? '#ff2a2a' : '#2aff6a';
    const nav = mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(navColor, 3), s * 5.45, 0.02, 0.5, false);
    const navLight = new THREE.PointLight(navColor, 0.4, 5); navLight.position.copy(nav.position);
    side.add(nav, navLight);
    g.add(side);
    wings[s < 0 ? 'left' : 'right'] = { aileron, flap, burnerOuter, burnerCore, nav, tip: s };
  }
  parts.wings = wings;

  const stabs = {};
  const fin = new THREE.Group(); fin.position.set(0, 0.5, 4.0);
  const finBody = mesh(new THREE.BoxGeometry(0.1, 1.5, 1.3), cream, 0, 0.7, 0.0); finBody.rotation.x = 0.35;
  const rudder = new THREE.Group(); rudder.position.set(0, 0.7, 0.75);
  rudder.add(mesh(new THREE.BoxGeometry(0.08, 1.2, 0.5), verm, 0, 0.1, 0.2));
  const finCap = mesh(new THREE.BoxGeometry(0.12, 0.3, 0.9), verm, 0, 1.4, 0.35); finCap.rotation.x = 0.35;
  const finRoot = mesh(new THREE.BoxGeometry(0.3, 0.5, 2.0), cream, 0, 0.0, -0.1);
  fin.add(finBody, finCap, finRoot, rudder); g.add(fin);
  const tailNav = mesh(new THREE.SphereGeometry(0.07, 8, 8), glow('#ffffff', 3), 0, 0.3, 6.35, false); g.add(tailNav);
  for (const s of [-1, 1]) {
    const hs = mesh(new THREE.BoxGeometry(1.7, 0.07, 0.9), cream, s * 0.95, 0.35, 5.0); hs.rotation.z = s * 0.04;
    const elev = new THREE.Group(); elev.position.set(s * 1.0, 0.35, 5.45);
    elev.add(mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), verm, 0, 0, 0.2));
    g.add(hs, elev); stabs[s < 0 ? 'left' : 'right'] = elev;
  }
  parts.tail = { rudder, elevators: stabs };

  const propGroup = new THREE.Group(); propGroup.position.set(0, 0, -3.75);
  propGroup.add(mesh(new THREE.ConeGeometry(0.18, 0.5, 16), metal, 0, 0, -0.2).rotateX(-Math.PI / 2));
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = mesh(new THREE.BoxGeometry(0.12, 1.5, 0.03), char, 0, 0, 0); b.position.y = 0.75; const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI * 2) / 3; arm.add(b); blades.add(arm); }
  const disc = mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: '#d8dde2', transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, false);
  propGroup.add(blades, disc); g.add(propGroup);
  parts.prop = { blades, disc };

  const tireMat = std('#15181c', { roughness: 0.9 }), strutMat = std('#b8bec5', { metalness: 0.8, roughness: 0.3 });
  const makeGear = (x, z, len) => {
    const pivot = new THREE.Group(); pivot.position.set(x, -0.45, z);
    const strut = mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 8), strutMat, 0, -len / 2, 0);
    const tire = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 18), tireMat, 0, -len, 0);
    tire.rotation.z = Math.PI / 2;
    pivot.add(strut, tire); g.add(pivot); return pivot;
  };
  parts.gear = { nose: makeGear(0, -2.2, 1.15), left: makeGear(-1.3, 0.9, 1.05), right: makeGear(1.3, 0.9, 1.05) };
  parts.gear.left.userData.side = -1; parts.gear.right.userData.side = 1;

  parts.lights = { tailNav, strobe: glow('#ffffff', 4) };
  return { group: g, parts };
}

function buildCockpit() {
  const g = new THREE.Group();
  const metal = std('#8a929b', { metalness: 0.8, roughness: 0.3 });
  const slate = std('#1b2027', { roughness: 0.7 }), trim = std('#2d343e', { roughness: 0.6 });
  const panel = mesh(new THREE.BoxGeometry(1.5, 0.5, 0.12), slate, 0, -0.06, -0.55, false); panel.rotation.x = -0.35; g.add(panel);
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.04, 0.3), slate, 0, 0.205, -0.62, false));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 1.6), trim, s * 0.62, -0.1, 0.1, false));
    const arch = mesh(new THREE.TorusGeometry(0.62, 0.012, 8, 24, Math.PI), trim, 0, 0.0, -0.1 - s * 0.25, false); arch.rotation.z = 0; g.add(arch);
  }
  const pfd = makePanelTexture(512, 400), mfd = makePanelTexture(512, 400), radar = makePanelTexture(512, 400);
  const screenMat = (t) => new THREE.MeshBasicMaterial({ map: t.tex, toneMapped: false });
  const pfdMesh = mesh(new THREE.PlaneGeometry(0.46, 0.36), screenMat(pfd), -0.5, 0.02, -0.5, false);
  const radarMesh = mesh(new THREE.PlaneGeometry(0.46, 0.36), screenMat(radar), 0.5, 0.02, -0.5, false);
  const mfdMesh = mesh(new THREE.PlaneGeometry(0.46, 0.36), screenMat(mfd), 0, 0.02, -0.5, false);
  pfdMesh.rotation.x = mfdMesh.rotation.x = radarMesh.rotation.x = -0.35;
  g.add(pfdMesh, mfdMesh, radarMesh);
  const gauges = [];
  const throttle = new THREE.Group(); throttle.position.set(-0.45, -0.2, -0.1);
  throttle.add(mesh(new THREE.BoxGeometry(0.1, 0.03, 0.3), trim, 0, -0.02, 0, false));
  const lever = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 8), std('#b8bec5', { metalness: 0.8 }), 0, 0.1, 0, false);
  const knob = mesh(new THREE.SphereGeometry(0.035, 10, 8), std(C.verm), 0, 0.21, 0, false);
  const leverGroup = new THREE.Group(); leverGroup.add(lever, knob); throttle.add(leverGroup); g.add(throttle);
  const stick = new THREE.Group(); stick.position.set(0, -0.32, -0.15);
  stick.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 8), slate, 0, 0.17, 0, false), mesh(new THREE.SphereGeometry(0.04, 12, 10), std(C.char), 0, 0.35, 0, false));
  g.add(stick);
  const hud = mesh(new THREE.PlaneGeometry(0.55, 0.3), new THREE.MeshBasicMaterial({ color: '#46ff8c', transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.42, -0.78, false);
  hud.rotation.x = -0.35; g.add(hud);
  g.add(mesh(new THREE.BoxGeometry(0.58, 0.015, 0.02), trim, 0, 0.25, -0.7, false));
  const lamp = new THREE.PointLight('#ffb55a', 0.35, 2); lamp.position.set(0, 0.1, -0.35); g.add(lamp);
  return { group: g, pfd, mfd, radar, gauges, throttle: leverGroup, stick };
}

function makeTrail(color, count) {
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const idx = [];
  for (let i = 0; i < count - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geo.setIndex(idx);
  const mesh3 = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  mesh3.frustumCulled = false;
  return { mesh: mesh3, positions, colors, history: [], count };
}

function makeSmoke(count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d8d8d8', size: 3.2, transparent: true, opacity: 0.45, depthWrite: false }));
  points.frustumCulled = false;
  return { points, pos, life: new Float32Array(count), vel: new Float32Array(count * 3), next: 0, count };
}

export function createAircraftModel() {
  const root = new THREE.Group();
  root.name = 'KW-14 Kestrel';
  const { group: exterior, parts } = buildExterior();
  const cockpit = buildCockpit();
  cockpit.group.visible = false;
  root.add(exterior, cockpit.group);
  const fx = new THREE.Group();
  const trails = [makeTrail('#ffffff', 40), makeTrail('#ffffff', 40)];
  const smoke = makeSmoke(80);
  fx.add(trails[0].mesh, trails[1].mesh, smoke.points);
  return { root, exterior, cockpit: cockpit.group, parts, panels: cockpit, fx, trails, smoke, time: 0, throttleSmooth: 0, effects: { smokeActive: false } };
}

function updateTrail(trail, tipWorld, active, dt) {
  trail.history.unshift(tipWorld.clone());
  if (trail.history.length > trail.count) trail.history.pop();
  const p = trail.positions, c = trail.colors;
  for (let i = 0; i < trail.count; i++) {
    const h = trail.history[Math.min(i, trail.history.length - 1)] ?? tipWorld;
    const half = 0.018 + i * 0.0135, fade = Math.pow(1 - i / trail.count, 1.6);
    p[i * 6] = h.x; p[i * 6 + 1] = h.y + half; p[i * 6 + 2] = h.z;
    p[i * 6 + 3] = h.x; p[i * 6 + 4] = h.y - half; p[i * 6 + 5] = h.z;
    for (const k of [0, 1]) { const o = (i * 2 + k) * 4; c[o] = c[o + 1] = c[o + 2] = 1; c[o + 3] = 0.42 * fade; }
  }
  trail.mesh.geometry.attributes.position.needsUpdate = true;
  trail.mesh.geometry.attributes.color.needsUpdate = true;
  trail.mesh.material.opacity = THREE.MathUtils.lerp(trail.mesh.material.opacity, active ? 1 : 0, 1 - Math.exp(-4 * dt));
}

export function updateAircraftModel(rig, state, input = {}, dt = 1 / 60) {
  rig.time += dt;
  const { parts } = rig;
  rig.root.position.copy(state.pos);
  rig.root.quaternion.copy(state.q);

  const roll = input.roll ?? 0, pitch = input.pitch ?? 0, yaw = input.yaw ?? 0;
  const k = 1 - Math.exp(-12 * dt);
  parts.wings.left.aileron.rotation.x += (roll * 0.45 - parts.wings.left.aileron.rotation.x) * k;
  parts.wings.right.aileron.rotation.x += (-roll * 0.45 - parts.wings.right.aileron.rotation.x) * k;
  const flapAngle = (state.flapsProgress ?? 0) * 0.3;
  for (const side of [parts.wings.left, parts.wings.right]) side.flap.rotation.x = flapAngle;
  for (const e of Object.values(parts.tail.elevators)) e.rotation.x += (-pitch * 0.4 - e.rotation.x) * k;
  parts.tail.rudder.rotation.y += (yaw * 0.45 - parts.tail.rudder.rotation.y) * k;

  const gp = state.gearProgress ?? 1;
  parts.gear.nose.rotation.x = (1 - gp) * Math.PI / 2;
  parts.gear.left.rotation.z = -(1 - gp) * Math.PI / 2 * -1;
  parts.gear.right.rotation.z = (1 - gp) * Math.PI / 2 * -1;
  for (const gear of Object.values(parts.gear)) gear.visible = gp > 0.02;

  const thr = state.throttle ?? 0;
  const spin = (4 + thr * 60) * dt * (state.engineOut ? 0.1 : 1);
  parts.prop.blades.rotation.z += spin;
  parts.prop.disc.material.opacity = clamp(thr * 0.22, 0, 0.22) * (state.engineOut ? 0 : 1);
  parts.prop.blades.visible = thr < 0.35 || state.engineOut;

  const boost = state.boosting ? 1 : 0;
  for (const side of [parts.wings.left, parts.wings.right]) {
    const flicker = 0.85 + 0.3 * Math.sin(rig.time * 60 + (side.tip > 0 ? 1 : 0));
    side.burnerOuter.visible = side.burnerCore.visible = boost > 0 || thr > 0.9;
    const s = boost ? 1.4 * flicker : 0.35;
    side.burnerOuter.scale.set(1, s, 1); side.burnerCore.scale.set(1, s, 1);
    side.nav.material.emissiveIntensity = 2.2 + 1.5 * (Math.sin(rig.time * 6) > 0.8 ? 1 : 0);
  }
  parts.lights.tailNav.material.emissiveIntensity = Math.sin(rig.time * 7) > 0.85 ? 6 : 1.2;

  rig.cockpit.visible = !!input.cockpitView;
  rig.exterior.visible = !input.cockpitView;
  rig.fx.visible = true;
  if (rig.cockpit.visible) {
    const live = { ...state, throttle: thr };
    const p = rig.panels;
    drawPFD(p.pfd.ctx, 512, 400, live); p.pfd.tex.needsUpdate = true;
    drawMFD(p.mfd.ctx, 512, 400, live); p.mfd.tex.needsUpdate = true;
    drawRadar(p.radar.ctx, 512, 400, live, rig.time); p.radar.tex.needsUpdate = true;
    p.throttle.rotation.x = -0.5 + thr * 1.0;
    p.stick.rotation.z = -roll * 0.35; p.stick.rotation.x = pitch * 0.3;
  }

  const tipL = new THREE.Vector3(-5.45, 0.02, 0.9).applyMatrix4(rig.root.matrixWorld.clone().compose(state.pos, state.q, new THREE.Vector3(1, 1, 1)));
  const tipR = new THREE.Vector3(5.45, 0.02, 0.9).applyMatrix4(rig.root.matrixWorld.clone().compose(state.pos, state.q, new THREE.Vector3(1, 1, 1)));
  const contrail = (state.gLoad ?? 1) > 2.2 && (state.kts ?? 0) > 80 && !state.onGround;
  updateTrail(rig.trails[0], tipL, contrail, dt);
  updateTrail(rig.trails[1], tipR, contrail, dt);

  const smoke = rig.smoke;
  const touching = state.onGround && (state.kts ?? 0) > 20 && state.touchedDown && Math.abs(state.vsFpm ?? 0) < 50;
  const justLanded = state.landing && state.landing.rolloutM < 40 && state.onGround;
  for (let i = 0; i < smoke.count; i++) {
    if (smoke.life[i] > 0) {
      smoke.life[i] -= dt;
      smoke.pos[i * 3] += smoke.vel[i * 3] * dt; smoke.pos[i * 3 + 1] += smoke.vel[i * 3 + 1] * dt; smoke.pos[i * 3 + 2] += smoke.vel[i * 3 + 2] * dt;
    } else smoke.pos[i * 3 + 1] = -500;
  }
  if (touching && justLanded) {
    for (const x of [-1.3, 1.3]) {
      const i = smoke.next++ % smoke.count;
      const w = new THREE.Vector3(x, -1.5, 0.9).applyQuaternion(state.q).add(state.pos);
      smoke.pos[i * 3] = w.x; smoke.pos[i * 3 + 1] = w.y; smoke.pos[i * 3 + 2] = w.z;
      smoke.vel[i * 3] = (Math.random() - 0.5) * 1.5; smoke.vel[i * 3 + 1] = 0.8 + Math.random(); smoke.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      smoke.life[i] = 1.4;
    }
  }
  smoke.points.geometry.attributes.position.needsUpdate = true;
}
