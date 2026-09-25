import * as THREE from 'three';

export const KART = {
  maxSpeed: 32,
  accel: 26,
  brake: 38,
  reverseMax: 10,
  turn: 2.1,
  grip: 9,
  driftGrip: 3.5,
  boostMul: 1.4,
  radius: 1.2,
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createKart(id, info) {
  return {
    id,
    name: info.name,
    color: info.color,
    isBot: !!info.isBot,
    peer: info.peer || null,
    x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, speed: 0,
    idx: null, lap: 0, maxLap: 0, lat: 0, offroad: false,
    drifting: false, driftDir: 1, driftCharge: 0, driftLevel: 0,
    boost: 0, star: 0, spin: 0, hopT: 0,
    boostOn: false, starOn: false, spinOn: false,
    finished: false, finishTime: null,
    item: null, itemLockUntil: 0, itemReadyAt: 0, hitImmune: 0,
    speedMul: 1, skill: 1, place: 1, score: 0, gone: false, local: false,
    tx: 0, ty: 0, tz: 0, th: 0, ts: 0, recv: 0, hasTarget: false,
    spinVis: 0, wheelRot: 0, wasDrifting: false, mesh: null, ai: null,
    vy: 0, airborne: false, airTime: 0, trickBoost: false,
    charId: info.charId || null, bodyId: info.bodyId || 'balanced',
    speedStat: info.speedStat || 1, accelStat: info.accelStat || 1, handlingStat: info.handlingStat || 1,
  };
}

export function spinOut(k) {
  if (k.star > 0) return;
  k.spin = 1.2;
  k.drifting = false;
  k.driftCharge = 0;
  k.boost = 0;
}

export function stepKart(k, inp, dt, track, karts) {
  if (k.boost > 0) k.boost -= dt;
  if (k.star > 0) k.star -= dt;
  if (k.spin > 0) k.spin -= dt;
  const spinning = k.spin > 0;
  const steer = spinning ? 0 : clamp(inp.steer, -1, 1);
  const thr = spinning ? 0 : inp.throttle;
  const brk = spinning ? 0 : inp.brake;

  const fx = Math.sin(k.h), fz = Math.cos(k.h);
  const rx = -fz, rz = fx;
  let fs = k.vx * fx + k.vz * fz;
  let ls = k.vx * rx + k.vz * rz;

  let cap = KART.maxSpeed * k.speedMul * (k.speedStat || 1);
  if (k.star > 0) cap *= 1.18;
  if (k.boost > 0) cap *= KART.boostMul;
  else if (k.offroad && k.star <= 0 && !k.airborne) cap *= track.def.offroadMul;

  if (k.boost > 0 && fs < cap) fs = Math.min(cap, fs + 50 * dt);
  if (thr > 0 && fs < cap) {
    const a = KART.accel * (k.accelStat || 1) * thr * (fs < 0 ? 2 : 1 - 0.5 * Math.max(0, fs) / cap);
    fs = Math.min(cap, fs + a * dt);
  }
  if (brk > 0) {
    if (fs > 0) fs -= KART.brake * brk * dt;
    else fs = Math.max(-KART.reverseMax, fs - KART.accel * 0.6 * brk * dt);
  }
  if (thr <= 0 && brk <= 0) fs *= Math.exp(-0.7 * dt);
  if (fs > cap) fs = Math.max(cap, fs - 25 * dt);
  if (spinning) fs *= Math.exp(-2.5 * dt);

  if (inp.drift && !k.drifting && !spinning && Math.abs(steer) > 0.25 && fs > 12) {
    k.drifting = true;
    k.driftDir = Math.sign(steer);
    k.driftCharge = 0;
  }
  if (k.drifting && (!inp.drift || fs < 8 || spinning)) {
    if (!spinning) {
      if (k.driftCharge >= 2) k.boost = Math.max(k.boost, 1.3);
      else if (k.driftCharge >= 1) k.boost = Math.max(k.boost, 0.7);
    }
    k.drifting = false;
    k.driftCharge = 0;
  }

  let turn;
  if (k.drifting) {
    const s = k.driftDir;
    turn = s * (0.6 + 0.45 * steer * s);
    k.driftCharge += dt * (0.8 + 0.7 * Math.max(0, steer * s));
    k.driftLevel = k.driftCharge >= 2 ? 2 : k.driftCharge >= 1 ? 1 : 0;
  } else {
    turn = steer;
    k.driftLevel = 0;
  }

  const sf = Math.sign(fs) * Math.min(1, Math.abs(fs) / 6);
  const rate = KART.turn * (k.handlingStat || 1) * (k.drifting ? 1.2 : 1) * (1 - 0.3 * Math.min(1, Math.abs(fs) / KART.maxSpeed));
  const lsBefore = Math.abs(ls);
  ls *= Math.exp(-(k.drifting ? KART.driftGrip : KART.grip) * dt);
  // Sideways slide that the tires absorb is fed back into forward speed, so corners and drifts keep momentum.
  if (fs > 0 && !spinning) fs = Math.min(Math.max(fs, cap), fs + (lsBefore - Math.abs(ls)) * 0.85);

  k.vx = fx * fs + rx * ls;
  k.vz = fz * fs + rz * ls;
  k.h -= turn * rate * sf * dt;
  k.x += k.vx * dt;
  k.z += k.vz * dt;
  k.speed = fs;

  // Jumps / airborne: apply vertical motion, then let constrain set the road height and decide landing.
  const ramp = track.rampAt?.(k);
  if (!k.airborne && ramp && fs > 10) {
    k.airborne = true;
    k.airTime = 0;
    k.trickBoost = false;
    k.vy = ramp.launch + Math.min(8, fs * 0.12);
  }
  let airY = null;
  if (k.airborne) {
    k.airTime += dt;
    if (inp.drift && !k.trickBoost && k.airTime > 0.15) {
      k.trickBoost = true;
      k.boost = Math.max(k.boost, 0.55);
    }
    k.vy -= 28 * dt;
    airY = k.y + k.vy * dt;
  }

  track.constrain(k);
  if (airY != null) {
    const roadY = k.y;
    if (airY > roadY + 0.15) {
      k.y = airY;
    } else {
      k.y = roadY;
      k.airborne = false;
      k.vy = 0;
    }
  }

  const R = KART.radius * 2;
  for (const o of karts) {
    if (o === k || o.gone) continue;
    const dx = k.x - o.x, dz = k.z - o.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < R * R && d2 > 1e-4 && Math.abs(k.y - o.y) < 2) {
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const pen = R - d;
      k.x += nx * pen * 0.5;
      k.z += nz * pen * 0.5;
      const vn = k.vx * nx + k.vz * nz;
      if (vn < 0) {
        k.vx -= nx * vn * 1.2;
        k.vz -= nz * vn * 1.2;
      }
    }
  }

  if (track.onBoostPad(k)) k.boost = Math.max(k.boost, 0.9);

  k.boostOn = k.boost > 0;
  k.starOn = k.star > 0;
  k.spinOn = k.spin > 0;
}

export function packFlags(k) {
  return (k.drifting ? 1 : 0)
    | (k.driftLevel >= 1 ? 2 : 0)
    | (k.driftLevel >= 2 ? 4 : 0)
    | (k.boostOn ? 8 : 0)
    | (k.starOn ? 16 : 0)
    | (k.spinOn ? 32 : 0)
    | (k.finished ? 64 : 0)
    | (k.driftDir < 0 ? 128 : 0);
}

export function unpackFlags(k, f) {
  k.drifting = !!(f & 1);
  k.driftLevel = f & 4 ? 2 : f & 2 ? 1 : 0;
  k.boostOn = !!(f & 8);
  k.starOn = !!(f & 16);
  k.spinOn = !!(f & 32);
  k.finished = !!(f & 64);
  k.driftDir = f & 128 ? -1 : 1;
}

// ---------- Visuals ----------

const G = {
  chassis: new THREE.BoxGeometry(1.8, 0.45, 2.6),
  nose: new THREE.BoxGeometry(1.2, 0.3, 0.8),
  seat: new THREE.BoxGeometry(1.0, 0.55, 0.5),
  torso: new THREE.BoxGeometry(0.8, 0.6, 0.5),
  head: new THREE.SphereGeometry(0.38, 12, 8),
  cap: new THREE.CylinderGeometry(0.4, 0.42, 0.22, 12),
  brim: new THREE.BoxGeometry(0.5, 0.06, 0.35),
  spoiler: new THREE.BoxGeometry(1.9, 0.1, 0.45),
  post: new THREE.BoxGeometry(0.1, 0.45, 0.1),
  wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.42, 10).rotateZ(Math.PI / 2),
  shadow: new THREE.CircleGeometry(1.7, 16).rotateX(-Math.PI / 2),
  flame: new THREE.ConeGeometry(0.3, 1.4, 8).rotateX(-Math.PI / 2),
  spark: new THREE.SphereGeometry(0.2, 6, 4),
};
const M = {
  dark: new THREE.MeshLambertMaterial({ color: 0x222222 }),
  wheel: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  skin: new THREE.MeshLambertMaterial({ color: 0xffd1a4 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.9 }),
};

function makeTag(name) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(name, 128, 32);
  g.fillStyle = '#fff';
  g.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(3.6, 0.9, 1);
  s.position.y = 2.9;
  return s;
}

export function buildKartMesh(k, showName) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = new THREE.MeshLambertMaterial({ color: k.color });
  const add = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    body.add(mesh);
    return mesh;
  };
  add(G.chassis, mat, 0, 0.5, 0);
  add(G.nose, mat, 0, 0.45, 1.55);
  add(G.seat, M.dark, 0, 0.95, -0.55);
  add(G.torso, mat, 0, 1.1, -0.25);
  add(G.head, M.skin, 0, 1.62, -0.25);
  add(G.cap, mat, 0, 1.9, -0.25);
  add(G.brim, mat, 0, 1.82, 0.05);
  add(G.spoiler, mat, 0, 1.2, -1.3);
  add(G.post, M.dark, 0.6, 0.95, -1.3);
  add(G.post, M.dark, -0.6, 0.95, -1.3);
  const wheels = [
    add(G.wheel, M.wheel, 1.0, 0.42, 0.95),
    add(G.wheel, M.wheel, -1.0, 0.42, 0.95),
    add(G.wheel, M.wheel, 1.0, 0.42, -0.9),
    add(G.wheel, M.wheel, -1.0, 0.42, -0.9),
  ];
  const shadow = new THREE.Mesh(G.shadow, M.shadow);
  shadow.position.y = 0.06;
  root.add(shadow);
  const flame = add(G.flame, M.flame, 0, 0.55, -2.0);
  flame.visible = false;
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
  const sparks = [add(G.spark, sparkMat, 0.95, 0.2, -1.3), add(G.spark, sparkMat, -0.95, 0.2, -1.3)];
  for (const s of sparks) s.visible = false;
  if (showName) root.add(makeTag(k.name));
  return { root, body, mat, wheels, flame, sparks, sparkMat, wasStar: false };
}

export function updateKartMesh(k, dt, track, now) {
  const m = k.mesh;
  if (k.gone) {
    m.root.visible = false;
    return;
  }
  if (k.drifting && !k.wasDrifting) k.hopT = 0.25;
  k.wasDrifting = k.drifting;
  let hop = 0;
  if (k.hopT > 0) {
    k.hopT -= dt;
    hop = Math.sin((1 - Math.max(0, k.hopT) / 0.25) * Math.PI) * 0.45;
  }
  m.root.position.set(k.x, k.y + hop, k.z);

  const N = track.N, i = k.idx ?? 0;
  const slope = (track.py[(i + 1) % N] - track.py[(i - 1 + N) % N]) / (2 * track.spacing);
  const dot = Math.sin(k.h) * track.tx[i] + Math.cos(k.h) * track.tz[i];
  m.root.rotation.set(-Math.atan(slope * dot), k.h, 0, 'YXZ');

  if (k.spinOn) k.spinVis += dt * 13;
  else k.spinVis = 0;
  m.body.rotation.y = (k.drifting ? -k.driftDir * 0.4 : 0) + k.spinVis;

  k.wheelRot += (k.speed * dt) / 0.42;
  for (const w of m.wheels) w.rotation.x = k.wheelRot;

  m.flame.visible = k.boostOn;
  if (k.boostOn) m.flame.scale.setScalar(0.8 + Math.random() * 0.5);

  for (const s of m.sparks) {
    s.visible = k.drifting;
    if (k.drifting) s.scale.setScalar(0.6 + Math.random() * 0.9);
  }
  if (k.drifting) m.sparkMat.color.setHex(k.driftLevel === 2 ? 0xff8a00 : k.driftLevel === 1 ? 0x2f9bff : 0xdddddd);

  if (k.starOn) {
    const hue = (now * 3) % 1;
    m.mat.color.setHSL(hue, 1, 0.55);
    m.mat.emissive.setHSL(hue, 1, 0.3);
  } else if (m.wasStar) {
    m.mat.color.set(k.color);
    m.mat.emissive.setHex(0x000000);
  }
  m.wasStar = k.starOn;
}
