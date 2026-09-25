// Runs against `npm run dev:server`. Usage: node server/test/room.test.mjs [ws://127.0.0.1:8787]
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'ws://127.0.0.1:8787';
const code = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');

function connect(roomCode, create) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE}/room/${roomCode}${create ? '?create=1' : ''}`);
    const inbox = [];
    const waiters = [];
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      const msg = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.pred(msg));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
    };
    const client = {
      ws,
      closed: new Promise((r) => { ws.onclose = (e) => r(e.code); }),
      send: (obj) => ws.send(JSON.stringify(obj)),
      next(pred = () => true, ms = 3000) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          const w = { pred, resolve: (m) => { clearTimeout(t); res(m); } };
          const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('timed out waiting for message')); }, ms);
          waiters.push(w);
        });
      },
    };
    ws.onopen = () => resolve(client);
    ws.onerror = () => reject(new Error('connect failed'));
  });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('host creates a room and gets a welcome', async () => {
  const c = code();
  const host = await connect(c, true);
  const w = await host.next((m) => m.t === '_welcome');
  assert.equal(w.host, w.id);
  host.ws.close();
});

test('creating an existing room is rejected as taken', async () => {
  const c = code();
  const host = await connect(c, true);
  await host.next((m) => m.t === '_welcome');
  const dup = await connect(c, true);
  assert.equal((await dup.next((m) => m.t === '_err')).reason, 'taken');
  host.ws.close();
});

test('joining a room with no host is rejected as not-found', async () => {
  const p = await connect(code(), false);
  assert.equal((await p.next((m) => m.t === '_err')).reason, 'not-found');
});

test('messages relay between client and host', async () => {
  const c = code();
  const host = await connect(c, true);
  const hw = await host.next((m) => m.t === '_welcome');
  const p1 = await connect(c, false);
  const p2 = await connect(c, false);
  const w1 = await p1.next((m) => m.t === '_welcome');
  const w2 = await p2.next((m) => m.t === '_welcome');
  assert.equal(w1.host, hw.id);

  p1.send({ to: 'host', m: { t: 'join', name: 'A' } });
  const got = await host.next((m) => m.m && m.m.t === 'join');
  assert.equal(got.from, w1.id);

  host.send({ to: 'all', m: { t: 'lobby' } });
  assert.equal((await p1.next((m) => m.m && m.m.t === 'lobby')).from, hw.id);
  assert.equal((await p2.next((m) => m.m && m.m.t === 'lobby')).from, hw.id);

  host.send({ to: w2.id, m: { t: 'ev' } });
  await p2.next((m) => m.m && m.m.t === 'ev');
  await assert.rejects(p1.next((m) => m.m && m.m.t === 'ev', 500));

  p2.send({ to: 'all', m: { t: 'spoof' } });
  await assert.rejects(p1.next((m) => m.m && m.m.t === 'spoof', 500));

  host.send({ kick: w2.id });
  assert.equal(await p2.closed, 4001);
  assert.equal((await host.next((m) => m.t === '_leave')).id, w2.id);
  host.ws.close();
  p1.ws.close();
});

test('host leaving promotes the oldest remaining player', async () => {
  const c = code();
  const host = await connect(c, true);
  const hw = await host.next((m) => m.t === '_welcome');
  const p1 = await connect(c, false);
  const w1 = await p1.next((m) => m.t === '_welcome');
  const p2 = await connect(c, false);
  await p2.next((m) => m.t === '_welcome');
  host.ws.close();
  const leave = await p2.next((m) => m.t === '_leave');
  assert.equal(leave.id, hw.id);
  const promoted = await p2.next((m) => m.t === '_host');
  assert.equal(promoted.id, w1.id);
  await p1.next((m) => m.t === '_host');
  p1.send({ to: 'all', m: { t: 'lobby' } });
  assert.equal((await p2.next((m) => m.m && m.m.t === 'lobby')).from, w1.id);
  p1.ws.close();
  p2.ws.close();
});

test('rooms are capped at 8 players', async () => {
  const c = code();
  const players = [await connect(c, true)];
  await players[0].next((m) => m.t === '_welcome');
  for (let i = 0; i < 7; i++) {
    const p = await connect(c, false);
    await p.next((m) => m.t === '_welcome');
    players.push(p);
  }
  const extra = await connect(c, false);
  assert.equal((await extra.next((m) => m.t === '_err')).reason, 'full');
  for (const p of players) p.ws.close();
});

test('ping gets an automatic pong', async () => {
  const c = code();
  const host = await connect(c, true);
  await host.next((m) => m.t === '_welcome');
  const pong = new Promise((r) => host.ws.addEventListener('message', (e) => e.data === 'pong' && r()));
  host.ws.send('ping');
  await pong;
  host.ws.close();
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok   ${t.name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${t.name}\n     ${e.message}`);
  }
}
console.log(failed ? `${failed} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);
