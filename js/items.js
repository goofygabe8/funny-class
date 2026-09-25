import * as THREE from 'three';
import { spinOut } from './kart.js';
import { canvasTexture } from './track.js';
import { botWantsItem } from './bots.js';

export const ITEM_LIST = ['mushroom', 'banana', 'green', 'red', 'star'];
export const ITEM_ICONS = { mushroom: '🍄', banana: '🍌', green: '🟢', red: '🔴', star: '⭐' };
const PROJ_TYPES = ['banana', 'green', 'red'];
const MAX_PROJECTILES = 40;

// Racers further back get stronger items.
const TABLES = [
  [['banana', 45], ['green', 40], ['mushroom', 15]],
  [['banana', 20], ['green', 30], ['red', 25], ['mushroom', 25]],
  [['red', 30], ['mushroom', 35], ['star', 20], ['green', 15]],
];

const r2 = (v) => Math.round(v * 100) / 100;

const PG = {
  banana: new THREE.CapsuleGeometry(0.22, 0.8, 4, 8),
  shell: new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  rim: new THREE.TorusGeometry(0.7, 0.15, 6, 16).rotateX(Math.PI / 2),
};
const PM = {
  banana: new THREE.MeshLambertMaterial({ color: 0xffe135, emissive: 0x332a00 }),
  green: new THREE.MeshLambertMaterial({ color: 0x2ecc40, emissive: 0x0a3310 }),
  red: new THREE.MeshLambertMaterial({ color: 0xe53935, emissive: 0x330a0a }),
  white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
};

function makeProjMesh(type) {
  const g = new THREE.Group();
  if (type === 'banana') {
    for (const a of [-0.55, 0.55]) {
      const m = new THREE.Mesh(PG.banana, PM.banana);
      m.position.set(a * 0.35, 0.5, 0);
      m.rotation.z = a;
      g.add(m);
    }
  } else {
    const shell = new THREE.Mesh(PG.shell, PM[type]);
    shell.position.y = 0.2;
    const rim = new THREE.Mesh(PG.rim, PM.white);
    rim.position.y = 0.2;
    g.add(shell, rim);
  }
  return g;
}

function makeBoxMaterial() {
  const tex = canvasTexture(64, 64, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#fff';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', w / 2, h / 2 + 3);
  });
  return new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0.9 });
}

export class Items {
  constructor(race) {
    this.race = race;
    this.boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    this.boxMat = makeBoxMaterial();
    this.boxes = race.track.boxes.map((b) => {
      const mesh = new THREE.Mesh(this.boxGeo, this.boxMat);
      mesh.position.set(b.x, b.y, b.z);
      race.scene.add(mesh);
      return { ...b, active: true, timer: 0, hideUntil: 0, mesh };
    });
    this.projs = new Map();
    this.nextId = 1;
  }

  roll(k) {
    const n = this.race.karts.filter((o) => !o.gone).length;
    const r = n <= 1 ? 0 : (k.place - 1) / (n - 1);
    const table = TABLES[r < 0.34 ? 0 : r < 0.67 ? 1 : 2];
    let x = Math.random() * table.reduce((a, e) => a + e[1], 0);
    for (const [it, w] of table) if ((x -= w) < 0) return it;
    return table[0][0];
  }

  boxString() {
    return this.boxes.map((b) => (b.active ? '1' : '0')).join('');
  }

  projSnap() {
    const out = [];
    for (const p of this.projs.values()) {
      out.push([
        p.id, PROJ_TYPES.indexOf(p.type), r2(p.x), r2(p.y), r2(p.z), r2(p.vx), r2(p.vz),
        p.owner ?? -1, p.target ?? -1, r2(Math.max(0, p.life - p.age)),
      ]);
    }
    return out;
  }

  addProj(id, type, props) {
    if (this.projs.size >= MAX_PROJECTILES) this.remove(this.projs.keys().next().value);
    const p = { id, type, age: 0, vx: 0, vz: 0, ...props };
    p.mesh = makeProjMesh(type);
    p.mesh.position.set(p.x, p.y, p.z);
    this.race.scene.add(p.mesh);
    this.projs.set(id, p);
    return p;
  }

  remove(id) {
    const p = this.projs.get(id);
    if (!p) return;
    this.race.scene.remove(p.mesh);
    this.projs.delete(id);
  }

  // ---------- Host-only simulation ----------

  hostUse(k, it) {
    const fx = Math.sin(k.h), fz = Math.cos(k.h);
    if (it === 'mushroom') {
      if (k.isBot) k.boost = Math.max(k.boost, 1.3);
      return;
    }
    if (it === 'star') {
      if (k.isBot) k.star = 7;
      else if (!k.local) { k.star = 1; k.starOn = true; }
      return;
    }
    if (it === 'banana') {
      this.addProj(this.nextId++, 'banana', {
        x: k.x - fx * 2.8, y: k.y, z: k.z - fz * 2.8, idx: k.idx, owner: k.id, life: 40,
      });
      return;
    }
    const speed = it === 'green' ? 58 : 50;
    const p = this.addProj(this.nextId++, it, {
      x: k.x + fx * 2.8, y: k.y, z: k.z + fz * 2.8,
      vx: fx * speed, vz: fz * speed, speed,
      idx: k.idx, s: k.idx, lat: this.race.track.lateral(k.x, k.z, k.idx),
      owner: k.id, life: it === 'green' ? 7 : 10, target: -1,
    });
    if (it === 'red') {
      const t = this.race.karts.find((o) => !o.gone && !o.finished && o.place === k.place - 1);
      if (t) p.target = t.id;
    }
  }

  hit(k) {
    const race = this.race;
    if (k.gone || k.star > 0 || race.now < k.hitImmune) return;
    k.hitImmune = race.now + 1.6;
    if (k.local) spinOut(k);
    else race.net.broadcast({ t: 'ev', fx: 'spin', k: k.id });
  }

  hostStep(dt) {
    const race = this.race, tr = race.track, now = race.now;
    const karts = race.karts.filter((k) => !k.gone);

    for (const b of this.boxes) {
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) b.active = true;
        continue;
      }
      for (const k of karts) {
        const dx = k.x - b.x, dz = k.z - b.z;
        if (dx * dx + dz * dz < 5.3 && Math.abs(k.y + 1.2 - b.y) < 2.5) {
          b.active = false;
          b.timer = 3;
          if (!k.item && !k.finished) {
            k.item = this.roll(k);
            k.itemReadyAt = now + 1.2 + Math.random() * 2.5;
          }
          break;
        }
      }
    }

    for (const p of [...this.projs.values()]) {
      p.age += dt;
      if (p.age > p.life) { this.remove(p.id); continue; }
      if (p.type === 'green') this.moveGreen(p, dt, tr);
      else if (p.type === 'red') this.moveRed(p, dt, tr);
      for (const k of karts) {
        if (k.id === p.owner && p.age < 0.5) continue;
        const dx = k.x - p.x, dz = k.z - p.z;
        if (dx * dx + dz * dz < 3.2 && Math.abs(k.y - p.y) < 2) {
          this.hit(k);
          this.remove(p.id);
          break;
        }
      }
    }

    const arr = [...this.projs.values()];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a.type === 'banana' && b.type === 'banana') continue;
        if (!this.projs.has(a.id) || !this.projs.has(b.id)) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        if (dx * dx + dz * dz < 2.2 && Math.abs(a.y - b.y) < 2) {
          this.remove(a.id);
          this.remove(b.id);
        }
      }
    }

    for (const a of karts) {
      if (a.star <= 0) continue;
      for (const b of karts) {
        if (b === a || b.star > 0) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        if (dx * dx + dz * dz < 7 && Math.abs(a.y - b.y) < 2) this.hit(b);
      }
    }

    for (const k of karts) {
      if (k.isBot && k.item && now >= k.itemReadyAt && botWantsItem(k, race)) {
        const it = k.item;
        k.item = null;
        this.hostUse(k, it);
      }
    }
  }

  moveGreen(p, dt, tr) {
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    const i = tr.locate(p.x, p.y, p.z, p.idx);
    p.idx = i;
    const nx = tr.nx[i], nz = tr.nz[i];
    const lat = tr.lateral(p.x, p.z, i);
    const lim = tr.wall[i] - 0.6;
    if (Math.abs(lat) > lim) {
      const s = Math.sign(lat);
      p.x -= nx * (lat - s * lim);
      p.z -= nz * (lat - s * lim);
      const vn = p.vx * nx + p.vz * nz;
      if (vn * s > 0) {
        p.vx -= 2 * vn * nx;
        p.vz -= 2 * vn * nz;
      }
    }
    p.y = tr.py[i];
  }

  moveRed(p, dt, tr) {
    let t = p.target >= 0 ? this.race.karts[p.target] : null;
    if (t && t.gone) { p.target = -1; t = null; }
    if (t) {
      const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
      if (d < 22 && Math.abs(t.y - p.y) < 3) {
        p.vx = (dx / d) * p.speed;
        p.vz = (dz / d) * p.speed;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.idx = tr.locate(p.x, p.y, p.z, p.idx);
        p.s = p.idx;
        p.lat = tr.lateral(p.x, p.z, p.idx);
        p.y = tr.py[p.idx];
        return;
      }
    }
    const N = tr.N;
    p.s = (p.s + (p.speed * dt) / tr.spacing) % N;
    const i = Math.floor(p.s) % N;
    const tl = t && t.idx != null ? tr.lateral(t.x, t.z, t.idx) : 0;
    p.lat += (tl - p.lat) * Math.min(1, dt * 2);
    const x = tr.px[i] + tr.nx[i] * p.lat, z = tr.pz[i] + tr.nz[i] * p.lat;
    p.vx = (x - p.x) / dt;
    p.vz = (z - p.z) / dt;
    p.x = x;
    p.z = z;
    p.y = tr.py[i];
    p.idx = i;
  }

  // Converts client-side copies of projectiles and boxes into host-simulated ones after a host change.
  becomeHost() {
    const tr = this.race.track;
    let maxId = 0;
    for (const p of this.projs.values()) {
      maxId = Math.max(maxId, p.id);
      p.idx = tr.locate(p.x, p.y, p.z, null);
      p.s = p.idx;
      p.lat = tr.lateral(p.x, p.z, p.idx);
      p.speed = Math.hypot(p.vx, p.vz) || (p.type === 'red' ? 50 : 58);
      p.age = 1;
      p.life = 1 + (p.left ?? 5);
      p.recv = null;
    }
    this.nextId = maxId + 1;
    for (const b of this.boxes) {
      b.hideUntil = 0;
      if (!b.active) b.timer = 3;
    }
  }

  // ---------- Client side ----------

  applySnap(b, parr) {
    const now = this.race.now;
    this.boxes.forEach((box, i) => {
      const active = b[i] === '1';
      if (active && now < box.hideUntil) return;
      box.active = active;
    });
    const seen = new Set();
    for (const [id, ti, x, y, z, vx, vz, owner, target, left] of parr) {
      seen.add(id);
      let p = this.projs.get(id);
      if (!p) {
        p = this.addProj(id, PROJ_TYPES[ti] || 'banana', { x, y, z });
      }
      p.sx = x; p.sy = y; p.sz = z;
      p.vx = vx; p.vz = vz;
      p.owner = owner ?? -1;
      p.target = target ?? -1;
      p.left = left ?? 5;
      p.recv = now;
    }
    for (const id of [...this.projs.keys()]) if (!seen.has(id)) this.remove(id);
  }

  update(dt) {
    const race = this.race, now = race.now;
    if (!race.isHost) {
      const me = race.me;
      for (const b of this.boxes) {
        if (!b.active) continue;
        const dx = me.x - b.x, dz = me.z - b.z;
        if (dx * dx + dz * dz < 5.3 && Math.abs(me.y + 1.2 - b.y) < 2.5) {
          b.active = false;
          b.hideUntil = now + 0.6;
        }
      }
    }
    const hue = (now * 0.25) % 1;
    this.boxMat.color.setHSL(hue, 0.9, 0.6);
    this.boxMat.emissive.setHSL(hue, 0.9, 0.25);
    for (const b of this.boxes) {
      b.mesh.visible = b.active;
      if (b.active) {
        b.mesh.rotation.set(now * 0.7, now * 1.1, 0);
        b.mesh.position.y = b.y + Math.sin(now * 2 + b.x) * 0.15;
      }
    }
    const a = 1 - Math.exp(-18 * dt);
    for (const p of this.projs.values()) {
      if (!race.isHost && p.recv != null) {
        const age = Math.min(0.2, now - p.recv);
        const tx = p.sx + p.vx * age, tz = p.sz + p.vz * age;
        p.x += (tx - p.x) * a;
        p.z += (tz - p.z) * a;
        p.y += (p.sy - p.y) * a;
      }
      p.mesh.position.set(p.x, p.y + 0.15, p.z);
      p.mesh.rotation.y += dt * (p.type === 'banana' ? 0.5 : 10);
    }
  }
}
