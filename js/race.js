import * as THREE from 'three';
import { Track } from './track.js';
import { TRACKS } from './tracks/index.js';
import { createKart, stepKart, buildKartMesh, updateKartMesh, packFlags, unpackFlags, spinOut } from './kart.js';
import { Items, ITEM_LIST } from './items.js';
import { botInput, initBot, updateRubberBand } from './bots.js';

const STEP = 1 / 60;
const NET_RATE = 1 / 20;
const PEER_TIMEOUT = 10;
const IDLE = { steer: 0, throttle: 0, brake: 0, drift: false };
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function validState(s) {
  return Array.isArray(s) && s.length >= 9 && s.every((v) => typeof v === 'number' && Number.isFinite(v));
}

// Movement: each peer simulates its own kart and reports it; the host simulates bots.
// Everything else (items, hits, finish order) is decided by the host.
export class Race {
  constructor({ start, myPeer, isHost, net, quality }) {
    this.net = net;
    this.isHost = isHost;
    this.laps = start.laps;
    this.scene = new THREE.Scene();
    this.track = new Track(TRACKS[start.track] || TRACKS[0], quality);
    this.track.setupScene(this.scene);
    this.scene.add(this.track.group);

    this.now = 0;
    this.time = 0;
    this.countdown = 3.5;
    this.started = false;
    this.acc = 0;
    this.netT = 0;

    this.karts = start.karts.map((info, i) => {
      const k = createKart(i, info);
      const g = this.track.gridSlot(i);
      k.x = k.tx = g.x;
      k.y = k.ty = g.y;
      k.z = k.tz = g.z;
      k.h = k.th = g.h;
      k.idx = g.idx;
      k.local = info.peer === myPeer || (isHost && k.isBot);
      if (k.isBot) initBot(k);
      k.mesh = buildKartMesh(k, info.peer !== myPeer);
      this.scene.add(k.mesh.root);
      return k;
    });
    this.me = this.karts.find((k) => k.peer === myPeer) || this.karts[0];
    this.items = new Items(this);

    this.finishOrder = [];
    this.firstHumanFinish = null;
    this.finalizeAt = null;
    this.final = false;
    this.resultsShown = false;
    this.itemRevealAt = 0;
    this.lastItem = null;
    this.toastMsg = null;
    this.wrongWay = false;
    this.wrongT = 0;
    this.onResults = null;
    this.onHostTimeout = null;
    this.onPeerDropped = null;
    this.lastSnap = 0;
    for (const k of this.karts) k.lastHeard = 0;
    this.rank();
  }

  kartByPeer(peer) {
    return this.karts.find((k) => k.peer === peer);
  }

  update(dt, input) {
    this.now += dt;
    if (!this.started) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.started = true;
    } else {
      this.time += dt;
    }

    if (input.consumeItem() && this.started) this.useItem();

    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      this.acc -= STEP;
      n++;
      this.fixedStep(STEP, input);
    }
    if (n >= 8) this.acc = 0;

    for (const k of this.karts) if (!k.local && !k.gone) this.smoothRemote(k, dt);
    this.rank();
    if (this.isHost) updateRubberBand(this);
    this.items.update(dt);
    for (const k of this.karts) updateKartMesh(k, dt, this.track, this.now);
    this.trackMyItem();
    this.checkWrongWay(dt);

    this.netT += dt;
    if (this.netT >= NET_RATE) {
      this.netT = 0;
      if (this.isHost) this.sendSnap();
      else this.sendState();
    }
    if (this.isHost) {
      this.checkFinish();
      for (const k of this.karts) {
        if (!k.local && !k.isBot && !k.gone && this.now - k.lastHeard > PEER_TIMEOUT) {
          this.peerLeft(k.peer);
          this.net.kick(k.peer);
          if (this.onPeerDropped) this.onPeerDropped(k.peer);
        }
      }
    } else if (this.now - this.lastSnap > PEER_TIMEOUT && this.onHostTimeout) {
      this.onHostTimeout();
    }
  }

  fixedStep(dt, input) {
    for (const k of this.karts) {
      if (!k.local || k.gone) continue;
      let inp;
      if (!this.started) inp = IDLE;
      else if (k === this.me && !k.finished) inp = input.state;
      else inp = botInput(k, this, dt);
      const lap = k.lap;
      stepKart(k, inp, dt, this.track, this.karts);
      if (k.lap !== lap) this.onLap(k);
    }
    if (this.isHost && this.started) this.items.hostStep(dt);
  }

  onLap(k) {
    if (k.lap <= k.maxLap) return;
    k.maxLap = k.lap;
    if (k.lap > this.laps && !k.finished) {
      k.finished = true;
      k.finishTime = this.time;
      if (k === this.me) this.toast('FINISH!', 3);
      if (this.isHost) this.recordFinish(k);
    } else if (k === this.me && k.lap > 1) {
      this.toast(k.lap === this.laps ? 'FINAL LAP!' : `LAP ${k.lap}`, 1.8);
    }
  }

  toast(text, dur) {
    this.toastMsg = { text, until: this.now + dur };
  }

  useItem() {
    const me = this.me;
    if (!me.item || me.finished || me.spin > 0 || this.now < this.itemRevealAt) return;
    const it = me.item;
    me.item = null;
    me.itemLockUntil = this.now + 0.8;
    if (it === 'mushroom') me.boost = Math.max(me.boost, 1.3);
    if (it === 'star') me.star = 7;
    if (this.isHost) this.items.hostUse(me, it);
    else this.net.send({ t: 'use', it });
  }

  trackMyItem() {
    const it = this.me.item;
    if (it !== this.lastItem) {
      if (it && !this.lastItem) this.itemRevealAt = this.now + 0.9;
      this.lastItem = it;
    }
  }

  checkWrongWay(dt) {
    const me = this.me, tr = this.track;
    const i = me.idx ?? 0;
    const dot = Math.sin(me.h) * tr.tx[i] + Math.cos(me.h) * tr.tz[i];
    const bad = this.started && !me.finished && dot < -0.2 && Math.abs(me.speed) > 3;
    this.wrongT = bad ? this.wrongT + dt : 0;
    this.wrongWay = this.wrongT > 0.8;
  }

  rank() {
    const N = this.track.N;
    const list = this.karts.filter((k) => !k.gone);
    for (const k of list) {
      const fi = this.finishOrder.findIndex((e) => e.k === k.id);
      k.score = fi >= 0 ? 1e7 - fi : k.lap * N + (k.idx ?? 0);
    }
    list.sort((a, b) => b.score - a.score);
    list.forEach((k, i) => { k.place = i + 1; });
    this.ranked = list;
  }

  // ---------- Networking ----------

  smoothRemote(k, dt) {
    const age = Math.min(0.25, this.now - k.recv);
    const ex = k.tx + Math.sin(k.th) * k.ts * age;
    const ez = k.tz + Math.cos(k.th) * k.ts * age;
    const dx = ex - k.x, dz = ez - k.z;
    if (dx * dx + dz * dz > 400) {
      k.x = ex; k.z = ez; k.y = k.ty; k.h = k.th;
      return;
    }
    const a = 1 - Math.exp(-12 * dt);
    k.x += dx * a;
    k.z += dz * a;
    k.y += (k.ty - k.y) * a;
    k.h += wrapAngle(k.th - k.h) * a;
    k.speed = k.ts;
  }

  setRemote(k, s) {
    k.tx = s[0]; k.ty = s[1]; k.tz = s[2]; k.th = s[3]; k.ts = s[4];
    k.idx = Math.max(0, Math.min(this.track.N - 1, Math.floor(s[5])));
    k.lap = s[6];
    unpackFlags(k, s[7]);
    k.star = k.starOn ? 1 : 0;
    k.recv = this.now;
  }

  sendSnap() {
    const k = this.karts.map((k) => {
      if (k.gone) return null;
      const L = k.local;
      return [
        r2(L ? k.x : k.tx), r2(L ? k.y : k.ty), r2(L ? k.z : k.tz), r3(L ? k.h : k.th), r2(L ? k.speed : k.ts),
        k.idx, k.lap, packFlags(k), k.item ? ITEM_LIST.indexOf(k.item) : -1,
      ];
    });
    this.net.broadcast({ t: 'snap', k, b: this.items.boxString(), p: this.items.projSnap() });
  }

  sendState() {
    const k = this.me;
    this.net.send({
      t: 'st',
      s: [r2(k.x), r2(k.y), r2(k.z), r3(k.h), r2(k.speed), k.idx, k.lap, packFlags(k), k.finishTime || 0],
    });
  }

  applySnap(m) {
    m.k.forEach((s, i) => {
      const k = this.karts[i];
      if (!k) return;
      if (!s) { k.gone = true; return; }
      if (k === this.me) {
        if (this.now >= k.itemLockUntil) k.item = s[8] >= 0 ? ITEM_LIST[s[8]] : null;
        return;
      }
      this.setRemote(k, s);
      if (!k.hasTarget) {
        k.hasTarget = true;
        k.x = k.tx; k.y = k.ty; k.z = k.tz; k.h = k.th;
      }
    });
    this.items.applySnap(m.b || '', m.p || []);
  }

  handle(m, from) {
    if (this.isHost) {
      const k = this.kartByPeer(from);
      if (!k || k.gone) return;
      k.lastHeard = this.now;
      if (m.t === 'st' && validState(m.s)) {
        const was = k.finished;
        this.setRemote(k, m.s);
        if (k.finished && !was) {
          k.finishTime = m.s[8];
          this.recordFinish(k);
        }
      } else if (m.t === 'use' && k.item && k.item === m.it) {
        k.item = null;
        this.items.hostUse(k, m.it);
      }
      return;
    }
    switch (m.t) {
      case 'snap':
        this.lastSnap = this.now;
        this.applySnap(m);
        break;
      case 'ev': if (m.fx === 'spin' && m.k === this.me.id) spinOut(this.me); break;
      case 'res':
        this.finishOrder = m.order;
        if (m.final) this.showResults(m.order);
        break;
      case 'left': {
        const k = this.karts[m.k];
        if (k) k.gone = true;
        break;
      }
    }
  }

  peerLeft(peer) {
    const k = this.kartByPeer(peer);
    if (k && !k.gone) {
      k.gone = true;
      this.net.broadcast({ t: 'left', k: k.id });
    }
  }

  // ---------- Finish ----------

  recordFinish(k) {
    if (this.finishOrder.some((e) => e.k === k.id)) return;
    this.finishOrder.push({ k: k.id, t: k.finishTime });
    if (!k.isBot && this.firstHumanFinish == null) this.firstHumanFinish = this.now;
    this.net.broadcast({ t: 'res', order: this.finishOrder, final: false });
  }

  checkFinish() {
    if (this.final) return;
    const alive = this.karts.filter((k) => !k.gone);
    const humans = alive.filter((k) => !k.isBot);
    const humansDone = humans.every((k) => k.finished);
    const timeout = this.firstHumanFinish != null && this.now - this.firstHumanFinish > 30;
    if ((humansDone || timeout) && this.finalizeAt == null) {
      this.finalizeAt = this.now + (alive.every((k) => k.finished) ? 0 : 3);
    }
    if (this.finalizeAt != null && this.now >= this.finalizeAt) {
      this.final = true;
      const rest = alive
        .filter((k) => !this.finishOrder.some((e) => e.k === k.id))
        .sort((a, b) => b.score - a.score);
      for (const k of rest) this.finishOrder.push({ k: k.id, t: null });
      this.net.broadcast({ t: 'res', order: this.finishOrder, final: true });
      this.showResults(this.finishOrder);
    }
  }

  showResults(order) {
    if (this.resultsShown) return;
    this.resultsShown = true;
    this.final = true;
    const rows = order.map((e, i) => {
      const k = this.karts[e.k];
      return {
        place: i + 1,
        name: k ? k.name : '?',
        color: k ? k.color : '#888',
        time: e.t,
        me: k === this.me,
        bot: k ? k.isBot : false,
      };
    });
    if (this.onResults) this.onResults(rows);
  }
}
