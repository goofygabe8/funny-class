import { ITEM_ICONS, ITEM_LIST } from './items.js';

const $ = (id) => document.getElementById(id);

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatTime(t) {
  if (t == null) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
}

function setText(el, v) {
  if (el._v !== v) {
    el._v = v;
    el.textContent = v;
  }
}

export class Hud {
  constructor() {
    this.root = $('hud');
    this.pos = $('hudPos');
    this.lap = $('hudLap');
    this.time = $('hudTime');
    this.item = $('hudItem');
    this.countdown = $('countdown');
    this.wrong = $('wrongWay');
    this.toast = $('toast');
    this.map = $('minimap');
    this.ctx = this.map.getContext('2d');
    this.base = null;
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  setup(race) {
    const tr = race.track, b = tr.bounds;
    const W = this.map.width, pad = 14;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) || 1;
    this.scale = (W - pad * 2) / span;
    this.ox = W / 2 - b.cx * this.scale;
    this.oz = W / 2 - b.cz * this.scale;
    const c = document.createElement('canvas');
    c.width = c.height = W;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    const path = () => {
      g.beginPath();
      for (let i = 0; i < tr.N; i += 2) {
        const x = tr.px[i] * this.scale + this.ox, y = tr.pz[i] * this.scale + this.oz;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    };
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 10;
    path();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 5;
    path();
    g.stroke();
    g.fillStyle = '#ffd83b';
    g.fillRect(tr.px[0] * this.scale + this.ox - 4, tr.pz[0] * this.scale + this.oz - 4, 8, 8);
    this.base = c;
  }

  update(race) {
    const me = race.me;
    const place = me.place || 1;
    setText(this.pos, ordinal(place));
    const cls = 'hud-pos' + (place <= 3 ? ' p' + place : '');
    if (this.pos.className !== cls) this.pos.className = cls;
    setText(this.lap, me.finished ? 'Finished!' : `Lap ${Math.max(1, Math.min(me.lap, race.laps))}/${race.laps}`);
    setText(this.time, formatTime(me.finished ? me.finishTime : race.time));

    let icon = '';
    if (race.now < race.itemRevealAt) icon = ITEM_ICONS[ITEM_LIST[Math.floor(race.now * 14) % ITEM_LIST.length]];
    else if (me.item) icon = ITEM_ICONS[me.item];
    setText(this.item, icon);

    let cd = '';
    if (!race.started) {
      const c = race.countdown;
      cd = c > 3 ? '' : c > 2 ? '3' : c > 1 ? '2' : '1';
    } else if (race.time < 1) {
      cd = 'GO!';
    }
    setText(this.countdown, cd);
    this.wrong.classList.toggle('show', race.wrongWay);
    const t = race.toastMsg && race.now < race.toastMsg.until ? race.toastMsg.text : '';
    setText(this.toast, t);

    const g = this.ctx, W = this.map.width;
    g.clearRect(0, 0, W, W);
    if (this.base) g.drawImage(this.base, 0, 0);
    for (const k of race.karts) {
      if (k.gone || k === me) continue;
      this.dot(g, k, 4.5, 'rgba(0,0,0,0.7)');
    }
    this.dot(g, me, 6.5, '#fff');
  }

  dot(g, k, r, stroke) {
    const x = k.x * this.scale + this.ox, y = k.z * this.scale + this.oz;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = k.color;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = stroke;
    g.stroke();
  }
}
