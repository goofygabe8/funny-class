// Lightweight Web Audio synth + optional file playback. Starts on first user gesture.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = localStorage.getItem('kr_mute') === '1';
    this.volume = Number(localStorage.getItem('kr_vol') || '0.7');
    this.engines = new Map();
    this.music = null;
    this.started = false;
  }

  async ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVol();
    this.started = true;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  applyVol() {
    if (!this.master) return;
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.musicGain.gain.value = 0.35;
    this.sfxGain.gain.value = 0.7;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('kr_vol', String(this.volume));
    this.applyVol();
  }

  setMuted(m) {
    this.muted = !!m;
    localStorage.setItem('kr_mute', this.muted ? '1' : '0');
    this.applyVol();
  }

  beep(freq, dur = 0.12, type = 'square', gain = 0.08) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  countdown(n) {
    if (n === 0) this.beep(880, 0.25, 'sawtooth', 0.1);
    else this.beep(440, 0.15, 'square', 0.08);
  }

  drift() { this.beep(180 + Math.random() * 40, 0.05, 'sawtooth', 0.03); }
  boost() { this.beep(220, 0.2, 'sawtooth', 0.09); this.beep(440, 0.25, 'triangle', 0.05); }
  item() { this.beep(660, 0.08); this.beep(880, 0.1); }
  hit() { this.beep(90, 0.2, 'sawtooth', 0.12); }
  lap() { this.beep(523, 0.1); this.beep(659, 0.12); this.beep(784, 0.18); }
  finish() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.2, 'triangle', 0.1), i * 120)); }

  // Soft looping pad as background music when no file is available.
  startMusic(seed = 0) {
    if (!this.ctx || this.music) return;
    const base = 110 + (seed % 3) * 12;
    const oscs = [0, 4, 7].map((semi, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = base * Math.pow(2, semi / 12);
      g.gain.value = 0.04;
      o.connect(g);
      g.connect(this.musicGain);
      o.start();
      return { o, g };
    });
    this.music = oscs;
  }

  stopMusic() {
    if (!this.music) return;
    for (const { o, g } of this.music) {
      try { g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3); o.stop(this.ctx.currentTime + 0.35); } catch { /* */ }
    }
    this.music = null;
  }

  engine(id, speed, max = 32) {
    if (!this.ctx || this.muted) return;
    let e = this.engines.get(id);
    if (!e) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 60;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(this.sfxGain);
      o.start();
      e = { o, g };
      this.engines.set(id, e);
    }
    const t = Math.min(1, Math.abs(speed) / max);
    e.o.frequency.setTargetAtTime(55 + t * 140, this.ctx.currentTime, 0.05);
    e.g.gain.setTargetAtTime(0.015 + t * 0.04, this.ctx.currentTime, 0.05);
  }

  stopEngine(id) {
    const e = this.engines.get(id);
    if (!e) return;
    try { e.o.stop(); } catch { /* */ }
    this.engines.delete(id);
  }

  stopAllEngines() {
    for (const id of [...this.engines.keys()]) this.stopEngine(id);
  }
}

export const audio = new Audio();
