const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ShiftLeft', 'ShiftRight',
]);
const ITEM_KEYS = new Set(['KeyE', 'ShiftLeft', 'ShiftRight']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, drift: false };
    this.state = { steer: 0, throttle: 0, brake: 0, drift: false };
    this.itemQueued = false;
    this.padItemPrev = false;
    this.touchCapable = navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches;
    this.touchWanted = false;

    const isField = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
    addEventListener('keydown', (e) => {
      if (isField(e)) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (ITEM_KEYS.has(e.code) && !this.keys.has(e.code)) this.itemQueued = true;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('touchstart', () => {
      if (!this.touchCapable) {
        this.touchCapable = true;
        this.setTouchVisible(this.touchWanted);
      }
    }, { passive: true });
    this.setupTouch();
  }

  setupTouch() {
    const root = document.getElementById('touch');
    for (const b of root.querySelectorAll('button')) {
      const key = b.dataset.k;
      const down = (e) => {
        e.preventDefault();
        b.classList.add('on');
        if (key === 'item') this.itemQueued = true;
        else this.touch[key] = true;
      };
      const up = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        if (key !== 'item') this.touch[key] = false;
      };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  setTouchVisible(v) {
    this.touchWanted = v;
    document.getElementById('touch').classList.toggle('hidden', !(v && this.touchCapable));
  }

  consumeItem() {
    const v = this.itemQueued;
    this.itemQueued = false;
    return v;
  }

  update(dt) {
    const k = this.keys, t = this.touch;
    const left = k.has('KeyA') || k.has('ArrowLeft') || t.left;
    const right = k.has('KeyD') || k.has('ArrowRight') || t.right;
    let target = (right ? 1 : 0) - (left ? 1 : 0);
    let throttle = k.has('KeyW') || k.has('ArrowUp') || t.gas ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') || t.brake ? 1 : 0;
    let drift = k.has('Space') || t.drift;
    let analog = false;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.15) { target = ax; analog = true; }
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.2);
      if (b(0) || b(7)) throttle = 1;
      if (b(1) || b(6)) brake = 1;
      if (b(4) || b(5)) drift = true;
      const itemBtn = b(2) || b(3);
      if (itemBtn && !this.padItemPrev) this.itemQueued = true;
      this.padItemPrev = itemBtn;
    }

    const s = this.state;
    if (analog) {
      s.steer = target;
    } else {
      const rate = target === 0 || Math.sign(target) !== Math.sign(s.steer) ? 10 : 7;
      const d = target - s.steer;
      s.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
    s.throttle = throttle;
    s.brake = brake;
    s.drift = drift;
  }
}
