// Solmar Bay 3D — procedural sound.
// One job: every sound the game makes, synthesized with WebAudio, no audio
// files. Nothing is created until the first user gesture, so the browser's
// autoplay rules are never fought.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = 0;
  }

  // Create (or resume) the audio context. Call from a user gesture.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.buildEngine();
      this.buildSiren();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) {
      this.ctx.suspend();
      if (!muted) this.ctx.resume();
    }
  }

  buildEngine() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  buildSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(ctx.destination);
    this.sirenOsc.start();
  }

  // Called every frame: engine hum follows speed, siren wails when on.
  update(dt, speed01, driving, sirenOn) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const freq = 52 + speed01 * 165;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    this.engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.1);
    this.sirenTimer += dt;
    if (sirenOn && this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 960 : 690, t, 0.03);
    }
    this.sirenGain.gain.setTargetAtTime(sirenOn ? 0.028 : 0, t, 0.15);
  }

  blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted || vol <= 0) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  shot() {
    this.noiseBurst(0.16, 0.5, 1800);
    this.blip(140, 0.1, 'square', 0.18);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.22);
    this.blip(990, 0.14, 'sine', 0.22, 0.09);
  }

  click() {
    this.blip(520, 0.05, 'square', 0.12);
  }

  busted() {
    this.blip(220, 0.35, 'sawtooth', 0.2);
    this.blip(165, 0.5, 'sawtooth', 0.2, 0.3);
  }

  missionDone() {
    this.blip(523, 0.12, 'sine', 0.22);
    this.blip(659, 0.12, 'sine', 0.22, 0.12);
    this.blip(784, 0.22, 'sine', 0.22, 0.24);
  }
}
