// All sound is synthesized with WebAudio: short oscillator/noise blips for effects and a slow
// two-oscillator pad plus a soft bass pulse for music. No audio files, no network. The context
// is created on the first user gesture (browsers block audio before one) and stays silent in
// screenshot mode, where there is no gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicTimer = null;
  let muted = false;
  let step = 0;

  // A minor, dreamy loop: Am9-ish pads that drift one chord per bar.
  const CHORDS = [
    [110.0, 164.81, 261.63, 329.63],
    [87.31, 130.81, 246.94, 311.13],
    [98.0, 146.83, 261.63, 329.63],
    [82.41, 123.47, 246.94, 293.66],
  ];

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, cutoff) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    const barMs = 2400;
    musicTimer = window.setInterval(() => {
      if (muted || !ctx) return;
      const chord = CHORDS[step % CHORDS.length];
      step += 1;
      for (const freq of chord) tone(freq, barMs / 1000 * 0.95, 'triangle', 0.035, null);
      tone(chord[0] / 2, 0.5, 'sine', 0.12, null);
      tone(chord[0] / 2, 0.5, 'sine', 0.1, null, barMs / 2000);
    }, barMs);
  }

  return {
    // Call from any key/click handler; harmless when audio is unavailable.
    unlock() {
      if (ensure()) startMusic();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() { tone(880, 0.07, 'square', 0.05, 440); },
    hit() { noise(0.06, 0.1, 1800); },
    enemyDie() { tone(320, 0.22, 'sine', 0.12, 70); noise(0.12, 0.08, 900); },
    pickup() { tone(1320, 0.09, 'sine', 0.07, 1760); },
    levelup() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, null, i * 0.07));
    },
    hurt() { tone(160, 0.25, 'sawtooth', 0.14, 60); },
    waveClear() { [392, 523.25, 659.25].forEach((f, i) => tone(f, 0.2, 'triangle', 0.09, null, i * 0.09)); },
    boss() { tone(98, 0.7, 'sawtooth', 0.12, 49); tone(147, 0.7, 'sawtooth', 0.08, 73.4); },
    gameOver() { [392, 311.13, 261.63, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.11, null, i * 0.22)); },
    click() { tone(660, 0.05, 'sine', 0.08, 880); },
  };
}
