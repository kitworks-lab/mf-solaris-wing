export function createAudioEngine() {
  const AudioCtor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  const engine = { ctx: null, muted: false, unlocked: false, nodes: null, stallPhase: 0, supported: !!AudioCtor };

  const build = () => {
    const ctx = engine.ctx;
    const master = ctx.createGain();
    master.gain.value = engine.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    const hum = ctx.createGain(); hum.gain.value = 0.0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600;
    const oscA = ctx.createOscillator(); oscA.type = 'sawtooth';
    const oscB = ctx.createOscillator(); oscB.type = 'square';
    oscA.connect(filter); oscB.connect(filter); filter.connect(hum); hum.connect(master);
    oscA.start(); oscB.start();
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource(); wind.buffer = noiseBuffer; wind.loop = true;
    const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 1200; windFilter.Q.value = 0.6;
    const windGain = ctx.createGain(); windGain.gain.value = 0;
    wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(master); wind.start();
    engine.nodes = { master, hum, filter, oscA, oscB, windFilter, windGain, noiseBuffer };
  };

  const safe = (fn) => { try { fn(); } catch (error) { void error; } };

  engine.unlock = () => {
    if (engine.unlocked || !AudioCtor) return;
    safe(() => {
      engine.ctx = new AudioCtor();
      build();
      if (engine.ctx.state === 'suspended') {
        const resumed = engine.ctx.resume();
        if (resumed && resumed.catch) resumed.catch(() => {});
      }
      engine.unlocked = true;
    });
  };
  if (typeof window !== 'undefined') {
    const handler = () => { engine.unlock(); };
    for (const type of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(type, handler, { once: false, passive: true });
  }

  const tone = (freq, start, length, type = 'sine', gainValue = 0.2, slideTo = null) => {
    if (!engine.unlocked) return;
    safe(() => {
      const ctx = engine.ctx;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + length);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
      osc.connect(gain); gain.connect(engine.nodes.master);
      osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + length + 0.05);
    });
  };

  const noise = (start, length, freq, gainValue, slideTo = null) => {
    if (!engine.unlocked) return;
    safe(() => {
      const ctx = engine.ctx;
      const src = ctx.createBufferSource(); src.buffer = engine.nodes.noiseBuffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(freq, ctx.currentTime + start); filter.Q.value = 1.2;
      if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + length);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainValue, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
      src.connect(filter); filter.connect(gain); gain.connect(engine.nodes.master);
      src.start(ctx.currentTime + start); src.stop(ctx.currentTime + start + length + 0.05);
    });
  };

  engine.update = (state, dt) => {
    if (!engine.unlocked || !engine.nodes) return;
    safe(() => {
      const { hum, filter, oscA, oscB, windGain, windFilter } = engine.nodes;
      const now = engine.ctx.currentTime;
      const alive = !state.crashed && !state.engineOut;
      const thr = state.throttle ?? 0;
      const base = 55 + thr * 90 + (state.kts ?? 0) * 0.18;
      oscA.frequency.setTargetAtTime(base, now, 0.1);
      oscB.frequency.setTargetAtTime(base * 1.505, now, 0.1);
      filter.frequency.setTargetAtTime(350 + thr * 1400 + (state.kts ?? 0) * 3, now, 0.1);
      hum.gain.setTargetAtTime(alive ? 0.05 + thr * 0.1 + (state.boosting ? 0.06 : 0) : 0, now, 0.15);
      const airflow = Math.min(1, (state.kts ?? 0) / 220);
      windGain.gain.setTargetAtTime(state.onGround ? airflow * 0.05 : 0.04 + airflow * 0.2, now, 0.2);
      windFilter.frequency.setTargetAtTime(600 + airflow * 2400, now, 0.2);
      if (state.stall && !state.onGround) {
        engine.stallPhase += dt;
        if (engine.stallPhase > 0.4) { engine.stallPhase = 0; tone(880, 0, 0.2, 'square', 0.14); }
      } else engine.stallPhase = 0.4;
    });
  };

  engine.ringChime = () => { tone(784, 0, 0.5, 'sine', 0.22); tone(988, 0.08, 0.5, 'sine', 0.2); tone(1319, 0.16, 0.7, 'sine', 0.18); };
  engine.dropWhoosh = () => { noise(0, 0.9, 1800, 0.5, 300); tone(300, 0, 0.6, 'triangle', 0.08, 120); };
  engine.servo = () => { tone(180, 0, 0.5, 'sawtooth', 0.05, 120); noise(0, 0.5, 700, 0.12); };
  engine.chirp = () => { noise(0, 0.18, 2800, 0.35, 1400); tone(520, 0, 0.1, 'square', 0.05); };
  engine.crash = () => { tone(70, 0, 1.2, 'sawtooth', 0.5, 30); noise(0, 1.5, 500, 0.7, 80); };
  engine.landed = () => { tone(523, 0, 0.4, 'sine', 0.16); tone(659, 0.15, 0.4, 'sine', 0.16); tone(784, 0.3, 0.8, 'sine', 0.16); };
  engine.toggleMute = () => {
    engine.muted = !engine.muted;
    if (engine.nodes) safe(() => engine.nodes.master.gain.setTargetAtTime(engine.muted ? 0 : 0.5, engine.ctx.currentTime, 0.05));
    return engine.muted;
  };
  engine.silence = () => {
    if (engine.nodes) safe(() => { engine.nodes.hum.gain.value = 0; engine.nodes.windGain.gain.value = 0; });
  };
  return engine;
}