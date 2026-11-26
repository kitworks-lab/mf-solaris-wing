const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createInputController(viewportCanvas) {
  const keys = new Set();
  const pressed = new Set();
  const ctl = {
    pitch: 0, roll: 0, yaw: 0, throttle: 0.6, boost: false, flaps: 0, gear: true, brake: false, wheelBrake: false, drop: false,
    mouseYoke: false, cockpitView: false, cameraMode: 'chase', muted: false,
    mouse: { x: 0, y: 0, active: false, dragging: false }, keys,
    pitchSmooth: 0, rollSmooth: 0, yawSmooth: 0, handlers: [],
  };
  const once = (code) => { if (pressed.has(code)) { pressed.delete(code); return true; } return false; };
  const emit = (name) => { for (const fn of ctl.handlers) fn(name); };
  const keyMap = { Digit1: 'mission0', Digit2: 'mission1', Digit3: 'mission2', Numpad1: 'mission0', Numpad2: 'mission1', Numpad3: 'mission2' };
  const toggles = { KeyR: 'restart', KeyP: 'pause', Escape: 'pause', KeyN: 'mute', Enter: 'confirm', KeyX: 'drop' };

  const onKeyDown = (event) => {
    if (event.code === 'Space' || event.code.startsWith('Arrow') || event.code === 'Tab') event.preventDefault();
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'KeyF') ctl.flaps = (ctl.flaps + 1) % 3;
    else if (event.code === 'KeyG') ctl.gear = !ctl.gear;
    else if (event.code === 'KeyB') ctl.brake = !ctl.brake;
    else if (event.code === 'KeyV') { ctl.cockpitView = !ctl.cockpitView; ctl.cameraMode = ctl.cockpitView ? 'cockpit' : 'chase'; emit('camera'); }
    else if (event.code === 'KeyM') { ctl.mouseYoke = !ctl.mouseYoke; ctl.mouse.active = ctl.mouseYoke; if (!ctl.mouseYoke) { ctl.mouse.x = 0; ctl.mouse.y = 0; } }
    else if (event.code === 'KeyN') { emit('mute'); }
    else if (keyMap[event.code]) emit(keyMap[event.code]);
    else if (toggles[event.code]) emit(toggles[event.code]);
    if (event.code === 'Space' || event.code === 'Enter') emit('launch-key');
    pressed.add(event.code);
  };
  const onKeyUp = (event) => { keys.delete(event.code); };
  const onBlur = () => { keys.clear(); ctl.mouse.dragging = false; };

  const setMouse = (event) => {
    const rect = viewportCanvas.getBoundingClientRect();
    ctl.mouse.x = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    ctl.mouse.y = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
  };
  const onDown = (event) => { ctl.mouse.dragging = true; ctl.mouse.active = true; setMouse(event); };
  const onMove = (event) => { if (ctl.mouse.dragging || ctl.mouseYoke) setMouse(event); };
  const onUp = () => { ctl.mouse.dragging = false; if (!ctl.mouseYoke) { ctl.mouse.active = false; } };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  viewportCanvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  ctl.on = (fn) => { ctl.handlers.push(fn); };
  ctl.reset = () => {
    ctl.throttle = 0.6; ctl.flaps = 0; ctl.gear = true; ctl.brake = false; ctl.boost = false; ctl.drop = false;
    ctl.pitchSmooth = ctl.rollSmooth = ctl.yawSmooth = 0;
  };
  ctl.update = (dt) => {
    const axis = (neg, pos) => (neg.some((code) => keys.has(code)) ? -1 : 0) + (pos.some((code) => keys.has(code)) ? 1 : 0);
    let pitch = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    let roll = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const yaw = axis(['KeyQ'], ['KeyE']);
    if (ctl.mouse.active && (ctl.mouse.dragging || ctl.mouseYoke)) {
      const dead = (value) => (Math.abs(value) < 0.08 ? 0 : (value - Math.sign(value) * 0.08) / 0.92);
      if (!pitch) pitch = -dead(ctl.mouse.y);
      if (!roll) roll = dead(ctl.mouse.x);
    }
    const rate = (target, current, up, down) => current + (target - current) * (1 - Math.exp(-(target === 0 ? down : up) * dt));
    ctl.pitchSmooth = rate(pitch, ctl.pitchSmooth, 9, 12);
    ctl.rollSmooth = rate(roll, ctl.rollSmooth, 9, 12);
    ctl.yawSmooth = rate(yaw, ctl.yawSmooth, 8, 10);
    const up = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('Equal') || keys.has('NumpadAdd');
    const down = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('Minus') || keys.has('NumpadSubtract');
    if (up) ctl.throttle = clamp(ctl.throttle + 0.5 * dt, 0, 1);
    if (down) ctl.throttle = clamp(ctl.throttle - 0.5 * dt, 0, 1);
    ctl.boost = keys.has('Space');
    ctl.drop = keys.has('KeyX');
    ctl.wheelBrake = ctl.brake;
    return ctl.toPhysics();
  };
  ctl.toPhysics = () => ({
    pitch: ctl.pitchSmooth, roll: ctl.rollSmooth, yaw: ctl.yawSmooth, throttle: ctl.throttle, boost: ctl.boost,
    flaps: ctl.flaps, gear: ctl.gear, brake: ctl.brake, wheelBrake: ctl.wheelBrake, drop: ctl.drop, cockpitView: ctl.cockpitView,
  });
  ctl.dispose = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    viewportCanvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  ctl.consume = once;
  return ctl;
}