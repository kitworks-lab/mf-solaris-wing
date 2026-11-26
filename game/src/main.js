import * as THREE from 'three';
import { createTerrainWorld, RUNWAY_SPEC, getTerrainHeight, getSeaLevel } from './terrainWorld.js';
import { createFlightState, stepFlightPhysics } from './flightPhysics.js';
import { createAircraftModel, updateAircraftModel } from './aircraftModel.js';
import { MISSIONS, createMissionRuntime, updateMissionRuntime, disposeMissionRuntime, getMissionWind } from './missions.js';
import { createCameraRig, updateCameraRig } from './cameraRig.js';
import { createHudRenderer, renderHud } from './hudRenderer.js';
import { createAudioEngine } from './audioEngine.js';
import { createInputController } from './inputController.js';
import { createUiOverlays } from './uiOverlays.js';
import { parseShotParams, applyDeterministicShot } from './deterministicShots.js';

const STEP = 1 / 60;
const shotParams = parseShotParams();

window.addEventListener('unhandledrejection', (event) => { event.preventDefault(); });

const viewport = document.getElementById('viewport');
const hudCanvas = document.getElementById('hud');
const uiRoot = document.getElementById('ui-root');

const renderer = new THREE.WebGLRenderer({ canvas: viewport, antialias: true, preserveDrawingBuffer: !!shotParams });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.3, 12000);
const world = createTerrainWorld(scene, MISSIONS[0].mood);
const aircraft = createAircraftModel();
scene.add(aircraft.root, aircraft.fx);

const camRig = createCameraRig(camera);
const hud = createHudRenderer(hudCanvas);
const audio = createAudioEngine();
const input = createInputController(viewport);

const game = {
  mode: shotParams ? 'shot' : 'title', missionIndex: 0, state: null, rt: null, input, time: 0,
  papiOverride: null, prevGear: true, prevFlaps: 0, prevTouched: false, debriefShown: false,
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.resize();
}
window.addEventListener('resize', resize);
resize();

function loadMission(index) {
  const mission = MISSIONS[index] ?? MISSIONS[0];
  if (game.rt) disposeMissionRuntime(game.rt);
  game.missionIndex = MISSIONS.indexOf(mission);
  world.applyMood(mission.mood);
  game.state = createFlightState(mission.spawn);
  game.rt = createMissionRuntime(game.missionIndex, scene, world);
  input.reset();
  input.throttle = mission.spawn.throttle ?? 0.6;
  game.prevGear = true; game.prevFlaps = 0; game.prevTouched = false; game.debriefShown = false;
  game.time = 0;
  camRig.mode = input.cockpitView ? 'cockpit' : 'chase';
}

function snapCamera() {
  updateCameraRig(camRig, game.state, aircraft, STEP, true);
}

function stepVisual(dt, final = false) {
  const state = game.state;
  const mode = updateCameraRig(camRig, state, aircraft, dt, false);
  const cockpit = mode === 'cockpit';
  const controls = { pitch: input.pitchSmooth, roll: input.rollSmooth, yaw: input.yawSmooth, cockpitView: cockpit };
  updateAircraftModel(aircraft, state, controls, dt);
  let worldState = state;
  if (game.papiOverride) worldState = { pos: game.papiOverride.pos };
  world.update(dt, camera, worldState);
  hud.cameraMode = cockpit ? 'cockpit' : 'chase';
  if (game.rt && game.mode !== 'title' && !(game.rt.finished && game.mode !== 'shot')) renderHud(hud, state, game.rt, camera, world);
  else hud.ctx.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
  void final;
}

function launch() {
  loadMission(ui.selected);
  game.mode = 'play';
  ui.hide();
  audio.unlock();
}

function restart(index = game.missionIndex) {
  loadMission(index);
  game.mode = 'play';
  ui.hide();
}

function pause() {
  if (game.mode === 'play') { game.mode = 'pause'; ui.showPause(); }
  else if (game.mode === 'pause') { game.mode = 'play'; ui.hide(); }
}

function backToTitle() {
  loadMission(ui.selected);
  game.mode = 'title';
  ui.showTitle();
}

const ui = createUiOverlays(uiRoot, {
  onSelect: (index) => { loadMission(index); },
  onLaunch: () => launch(),
  onResume: () => pause(),
  onRestart: () => restart(),
  onChangeMission: () => backToTitle(),
  onNext: () => { ui.selected = (game.missionIndex + 1) % MISSIONS.length; restart(ui.selected); },
});
ui.setMissions(MISSIONS);

input.on((name) => {
  if (game.mode === 'shot') return;
  if (name === 'mute') audio.toggleMute();
  else if (name === 'pause' && (game.mode === 'play' || game.mode === 'pause')) pause();
  else if (name === 'restart' && game.mode !== 'title') restart();
  else if (name === 'launch-key' && game.mode === 'title') launch();
  else if (name.startsWith('mission')) {
    const index = Number(name.slice(7));
    ui.selected = index;
    if (game.mode === 'title') { ui.select(index); } else restart(index);
  }
  else if (name === 'camera') camRig.mode = input.cockpitView ? 'cockpit' : 'chase';
});

function handleEvents(state) {
  const rt = game.rt;
  for (const event of rt.events) {
    if (event === 'ring' || event === 'drop-clear') audio.ringChime();
    if (event === 'drop') audio.dropWhoosh();
    if (event === 'landed') audio.landed();
    if (event === 'crash') audio.crash();
  }
  if (state.touchedDown && !game.prevTouched) audio.chirp();
  game.prevTouched = state.touchedDown;
  if (input.gear !== game.prevGear || input.flaps !== game.prevFlaps) audio.servo();
  game.prevGear = input.gear; game.prevFlaps = input.flaps;
  if (rt.finished && !game.debriefShown) {
    game.debriefShown = true;
    ui.showDebrief(rt.debrief);
  }
}

function simulate(dt) {
  const controls = input.update(dt);
  const state = game.state;
  const wind = getMissionWind(game.rt, state, game.time);
  const lock = game.rt.finished && !state.crashed;
  if (lock) { controls.throttle = 0; controls.brake = true; controls.wheelBrake = true; input.throttle = 0; }
  stepFlightPhysics(state, controls, dt, { getTerrainHeight, getSeaLevel, RUNWAY_SPEC }, wind);
  game.time += dt;
  updateMissionRuntime(game.rt, state, controls, dt);
  handleEvents(state);
  audio.update(state, dt);
}

function titleOrbit(dt) {
  game.time += dt;
  const angle = game.time * 0.08 + 0.6;
  camera.up.set(0, 1, 0);
  camera.position.set(Math.cos(angle) * 1500, 330 + 60 * Math.sin(angle * 2), Math.sin(angle) * 1500 - 100);
  camera.lookAt(0, 40, 0);
  if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
  aircraft.root.visible = false;
  world.update(dt, camera, game.state);
  updateMissionRuntime(game.rt, game.state, {}, dt);
  hud.ctx.clearRect(0, 0, hud.canvas.width, hud.canvas.height);
}

let last = performance.now();
let accumulator = 0;
let frames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    if (game.mode === 'shot') {
      stepVisual(STEP);
      frames += 1;
    } else if (game.mode === 'title') {
      titleOrbit(delta);
    } else {
      aircraft.root.visible = true;
      if (game.mode === 'play') {
        accumulator += delta;
        let steps = 0;
        while (accumulator >= STEP && steps < 5) { simulate(STEP); accumulator -= STEP; steps += 1; }
        if (steps === 5) accumulator = 0;
      }
      stepVisual(game.mode === 'play' ? delta : 0.0001);
    }
    renderer.render(scene, camera);
    if (game.mode === 'shot' && frames >= 3 && !window.__SOLARIS_READY) window.__SOLARIS_READY = true;
  } catch (error) {
    console.error(error);
  }
}

loadMission(0);
if (shotParams) {
  applyDeterministicShot(shotParams.shot, {
    game, camRig, ui, seed: shotParams.seed, loadMission, stepVisual, snapCamera, aircraft, world,
  });
} else {
  ui.showTitle();
}
window.__SOLARIS = { game, scene, camera };
requestAnimationFrame(frame);