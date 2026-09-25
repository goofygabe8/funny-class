const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PAGES_ORIGIN = 'gabes-class.pages.dev';
const CONNECT_TIMEOUT_MS = 10000;
const CONNECT_ATTEMPTS = 3;

function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// The Pages site serves rooms on its own origin; every other copy of the game (GitHub Pages, local
// static servers) talks to the Pages site. `?server=ws://127.0.0.1:8787` points at a local `wrangler dev`.
export function serverUrl() {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override.replace(/\/$/, '');
  if (location.hostname.endsWith(PAGES_ORIGIN)) return `wss://${location.host}`;
  return `wss://${PAGES_ORIGIN}`;
}

const ERRORS = {
  'not-found': 'No lobby found with that code.',
  taken: 'That lobby code is already in use.',
  full: 'That lobby is full.',
};

export class Net {
  constructor() {
    this.ws = null;
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.hostId = null;
    this.onMessage = () => {};
    this.onPeerLeave = () => {};
    this.onHostChanged = () => {};
    this.onHostLost = () => {};
    this.pingTimer = null;
  }

  get connected() {
    return !!this.ws;
  }

  _open(code, create) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(`${serverUrl()}/room/${code}${create ? '?create=1' : ''}`);
      const finish = (err, welcome) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          ws.onclose = null;
          try { ws.close(); } catch { /* not open yet */ }
          reject(err);
        } else {
          resolve({ ws, welcome });
        }
      };
      const timer = setTimeout(() => finish(Object.assign(new Error("Couldn't reach the game server. Check your internet and try again."), { retry: true })), CONNECT_TIMEOUT_MS);
      ws.onmessage = (e) => {
        if (e.data === 'pong') return;
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.t === '_welcome') finish(null, msg);
        else if (msg.t === '_err') finish(Object.assign(new Error(ERRORS[msg.reason] || 'Could not join.'), { reason: msg.reason }));
      };
      ws.onerror = () => finish(Object.assign(new Error("Couldn't reach the game server. Check your internet and try again."), { retry: true }));
      ws.onclose = () => finish(Object.assign(new Error("Couldn't reach the game server. Check your internet and try again."), { retry: true }));
    });
  }

  async _connect(code, create) {
    let lastErr;
    for (let i = 0; i < CONNECT_ATTEMPTS; i++) {
      try {
        return await this._open(code, create);
      } catch (e) {
        lastErr = e;
        if (!e.retry) throw e;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
    throw lastErr;
  }

  _attach(ws, welcome, code) {
    this.ws = ws;
    this.code = code;
    this.myId = welcome.id;
    this.hostId = welcome.host;
    this.isHost = welcome.host === welcome.id;
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === '_leave') {
        this.onPeerLeave(msg.id);
      } else if (msg.t === '_host') {
        this.hostId = msg.id;
        this.isHost = msg.id === this.myId;
        this.onHostChanged(msg.id, msg.prev);
      } else if (msg.from && msg.m) {
        this.onMessage(msg.m, msg.from);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this._reset();
      this.onHostLost('Lost connection to the game server.');
    };
    ws.onerror = () => {};
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 20000);
  }

  async host() {
    for (let tries = 0; tries < 5; tries++) {
      const code = makeCode();
      try {
        const { ws, welcome } = await this._connect(code, true);
        this._attach(ws, welcome, code);
        return code;
      } catch (e) {
        if (e.reason !== 'taken') throw e;
      }
    }
    throw new Error('Could not create a lobby. Try again.');
  }

  async join(code) {
    const { ws, welcome } = await this._connect(code, false);
    this._attach(ws, welcome, code);
  }

  _send(env) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(env));
  }

  send(msg) {
    if (!this.isHost) this._send({ to: 'host', m: msg });
  }

  broadcast(msg) {
    if (this.isHost) this._send({ to: 'all', m: msg });
  }

  sendTo(id, msg) {
    if (this.isHost) this._send({ to: id, m: msg });
  }

  kick(id) {
    if (this.isHost) this._send({ kick: id });
  }

  _reset() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.ws = null;
    this.isHost = false;
    this.code = null;
    this.hostId = null;
  }

  close() {
    const ws = this.ws;
    this._reset();
    if (ws) {
      ws.onclose = null;
      try { ws.close(1000, 'bye'); } catch { /* already closed */ }
    }
  }
}
