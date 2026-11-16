// NEON BREACH — synthesized sound. Every sound is generated with WebAudio
// oscillators and filtered noise at run time; there are no audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambient = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    } catch (e) {
      this.ctx = null;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  startAmbient() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = this.ctx.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg);
    lg.connect(g.gain);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(); lfo.start();
    this.ambient = { o, lfo };
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq, type) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  shoot(weaponId) {
    if (!this.ctx) return;
    if (weaponId === 'shotgun') { this.noise(0.16, 0.5, 900, 'lowpass'); this.blip(160, 0.12, 'square', 0.25, 60); }
    else if (weaponId === 'sniper') { this.noise(0.22, 0.5, 2400, 'highpass'); this.blip(220, 0.16, 'sawtooth', 0.3, 50); }
    else if (weaponId === 'smg') { this.noise(0.07, 0.3, 1800); this.blip(320, 0.06, 'square', 0.16, 140); }
    else if (weaponId === 'rifle') { this.noise(0.1, 0.38, 1500); this.blip(240, 0.09, 'square', 0.22, 90); }
    else { this.noise(0.09, 0.34, 1600); this.blip(300, 0.08, 'square', 0.2, 120); }
  }

  hit() { this.blip(1400, 0.05, 'sine', 0.22); }
  kill() { this.blip(660, 0.09, 'sine', 0.25); setTimeout(() => this.blip(990, 0.12, 'sine', 0.25), 70); }
  hurt() { this.blip(110, 0.14, 'sawtooth', 0.28, 70); }
  reload() { this.blip(500, 0.05, 'square', 0.14); setTimeout(() => this.blip(700, 0.05, 'square', 0.14), 140); }
  dryFire() { this.blip(900, 0.04, 'square', 0.12); }
  step() { this.noise(0.05, 0.07, 500, 'lowpass'); }
  plantBeep() { this.blip(880, 0.09, 'sine', 0.22); }
  plantDone() { this.blip(520, 0.12, 'sine', 0.25); setTimeout(() => this.blip(780, 0.18, 'sine', 0.25), 110); }
  defuseBeep() { this.blip(660, 0.09, 'sine', 0.2); }
  explosion() {
    this.noise(0.7, 0.6, 300, 'lowpass');
    this.blip(90, 0.6, 'sine', 0.4, 30);
  }
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'sine', 0.22), i * 110)); }
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'sine', 0.2), i * 120)); }
  buy() { this.blip(1046, 0.07, 'sine', 0.18); }
  denied() { this.blip(180, 0.12, 'square', 0.18, 120); }
}
