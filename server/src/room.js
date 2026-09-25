import { DurableObject } from 'cloudflare:workers';

export const MAX_PLAYERS = 8;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_MESSAGES_PER_SECOND = 80;

function send(ws, obj) {
  try {
    ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  } catch {
    // The socket is already closing; its close handler cleans up.
  }
}

// One Room per lobby code. It relays messages between players and tracks who the host is;
// the host's browser runs the race. Per-player state lives in WebSocket attachments so it
// survives hibernation.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.rates = new Map();
  }

  members(except) {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (a && a.id) out.push({ ws, a });
    }
    return out;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const create = url.searchParams.get('create') === '1';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const members = this.members(server);

    const reject = (reason) => {
      send(server, { t: '_err', reason });
      server.close(4000, reason);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (create && members.length) return reject('taken');
    const host = members.find((m) => m.a.host);
    if (!create && !host) return reject('not-found');
    if (members.length >= MAX_PLAYERS) return reject('full');

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const attachment = { id, host: create, joined: Date.now() };
    server.serializeAttachment(attachment);
    send(server, { t: '_welcome', id, host: create ? id : host.a.id });
    return new Response(null, { status: 101, webSocket: client });
  }

  allow(id) {
    const now = Date.now();
    let r = this.rates.get(id);
    if (!r || now - r.start >= 1000) {
      r = { start: now, count: 0 };
      this.rates.set(id, r);
    }
    r.count++;
    return r.count <= MAX_MESSAGES_PER_SECOND;
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) return;
    const a = ws.deserializeAttachment();
    if (!a || !a.id || !this.allow(a.id)) return;
    let env;
    try {
      env = JSON.parse(message);
    } catch {
      return;
    }
    if (!env || typeof env !== 'object') return;
    const others = this.members(ws);

    if (env.to === 'host') {
      const host = others.find((m) => m.a.host);
      if (host) send(host.ws, { from: a.id, m: env.m });
      return;
    }
    if (!a.host) return;
    if (env.to === 'all') {
      const out = JSON.stringify({ from: a.id, m: env.m });
      for (const m of others) send(m.ws, out);
    } else if (typeof env.kick === 'string') {
      const target = others.find((m) => m.a.id === env.kick);
      if (target) this.leave(target.ws, 4001, 'kicked');
    } else if (typeof env.to === 'string') {
      const target = others.find((m) => m.a.id === env.to);
      if (target) send(target.ws, { from: a.id, m: env.m });
    }
  }

  async webSocketClose(ws, code) {
    this.leave(ws, code === 1005 || code === 1006 ? 1000 : code, 'closed');
  }

  async webSocketError(ws) {
    this.leave(ws, 1011, 'error');
  }

  leave(ws, code, reason) {
    const a = ws.deserializeAttachment();
    try { ws.serializeAttachment(null); } catch { /* already closed */ }
    try { ws.close(code, reason); } catch { /* already closed */ }
    if (!a || !a.id) return;
    this.rates.delete(a.id);
    const rest = this.members(ws);
    for (const m of rest) send(m.ws, { t: '_leave', id: a.id });
    if (a.host && rest.length) {
      const next = rest.sort((x, y) => x.a.joined - y.a.joined)[0];
      next.a.host = true;
      next.ws.serializeAttachment(next.a);
      for (const m of rest) send(m.ws, { t: '_host', id: next.a.id, prev: a.id });
    }
  }
}
