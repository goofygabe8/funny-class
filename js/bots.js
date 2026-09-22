const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function initBot(k) {
  k.skill = 0.88 + Math.random() * 0.09;
  k.speedMul = k.skill;
}

function ensureAi(k) {
  if (!k.ai) k.ai = { lat: 0, latTarget: 0, retarget: 0, stuck: 0, reverse: 0 };
  return k.ai;
}

// Follows a point ahead on the centerline, offset sideways by a slowly wandering racing line.
export function botInput(k, race, dt) {
  const tr = race.track, N = tr.N, ai = ensureAi(k);
  ai.retarget -= dt;
  if (ai.retarget <= 0) {
    ai.latTarget = (Math.random() * 2 - 1) * tr.halfW * 0.5;
    ai.retarget = 2 + Math.random() * 3;
  }
  ai.lat += (ai.latTarget - ai.lat) * Math.min(1, dt * 0.8);

  const i = k.idx ?? 0;
  const look = Math.floor(6 + Math.max(0, k.speed) * 0.3);
  const j = (i + look) % N;
  const tx = tr.px[j] + tr.nx[j] * ai.lat;
  const tz = tr.pz[j] + tr.nz[j] * ai.lat;
  const desired = Math.atan2(tx - k.x, tz - k.z);
  const diff = wrapAngle(desired - k.h);
  const steer = clamp(-diff * 2.5, -1, 1);

  if (Math.abs(k.speed) < 3 && !k.spinOn) ai.stuck += dt;
  else ai.stuck = 0;
  if (ai.stuck > 1.5) {
    ai.reverse = 1.2;
    ai.stuck = 0;
  }
  if (ai.reverse > 0) {
    ai.reverse -= dt;
    return { steer: -steer, throttle: 0, brake: 1, drift: false };
  }
  const throttle = Math.abs(diff) > 1.2 && k.speed > 18 ? 0.3 : 1;
  return { steer, throttle, brake: 0, drift: false };
}

// Bots speed up when far behind the best human and ease off when far ahead.
export function updateRubberBand(race) {
  const N = race.track.N;
  const humans = race.karts.filter((k) => !k.isBot && !k.gone && !k.finished);
  const best = humans.length ? Math.max(...humans.map((k) => k.score)) : null;
  for (const k of race.karts) {
    if (!k.isBot) continue;
    let rb = 0;
    if (best != null) {
      const d = k.score - best;
      if (d < -N * 0.25) rb = 0.1;
      else if (d > N * 0.25) rb = -0.07;
    }
    k.speedMul = k.skill + rb;
  }
}

export function botWantsItem(k, race) {
  const held = race.now - k.itemReadyAt;
  switch (k.item) {
    case 'mushroom':
    case 'star':
      return true;
    case 'red':
      return k.place > 1 || held > 6;
    case 'banana':
      return held > 8 || race.karts.some((o) =>
        o !== k && !o.gone && o.place === k.place + 1 && Math.hypot(o.x - k.x, o.z - k.z) < 30);
    case 'green': {
      const fx = Math.sin(k.h), fz = Math.cos(k.h);
      return held > 8 || race.karts.some((o) => {
        if (o === k || o.gone) return false;
        const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz);
        return d < 45 && d > 3 && (dx * fx + dz * fz) / d > 0.96;
      });
    }
  }
  return true;
}
