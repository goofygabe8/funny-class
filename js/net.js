const PREFIX = 'kartrush-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Add a TURN server here (e.g. a free metered.ca account) if a school network blocks peer-to-peer.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function newPeer(id) {
  const PeerCtor = window.Peer || window.peerjs?.Peer;
  if (!PeerCtor) throw new Error('PeerJS failed to load. Check your internet connection.');
  return new PeerCtor(id, { debug: 0, config: { iceServers: ICE_SERVERS } });
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.conns = new Map();
    this.hostConn = null;
    this.onMessage = () => {};
    this.onPeerLeave = () => {};
    this.onHostLost = () => {};
  }

  get connected() {
    return !!this.peer;
  }

  host() {
    return new Promise((resolve, reject) => {
      const attempt = (tries) => {
        const code = makeCode();
        let peer;
        try { peer = newPeer(PREFIX + code); } catch (e) { reject(e); return; }
        let opened = false;
        peer.on('open', (id) => {
          opened = true;
          this.peer = peer;
          this.isHost = true;
          this.code = code;
          this.myId = id;
          resolve(code);
        });
        peer.on('error', (err) => {
          if (!opened) {
            peer.destroy();
            if (err.type === 'unavailable-id' && tries < 5) attempt(tries + 1);
            else reject(err);
            return;
          }
          console.warn('[net]', err.type, err);
        });
        peer.on('connection', (conn) => this._acceptConn(conn));
        peer.on('disconnected', () => {
          if (this.peer === peer && !peer.destroyed) peer.reconnect();
        });
      };
      attempt(0);
    });
  }

  _acceptConn(conn) {
    conn.on('open', () => this.conns.set(conn.peer, conn));
    conn.on('data', (d) => this.onMessage(d, conn.peer));
    conn.on('close', () => {
      if (this.conns.get(conn.peer) === conn) {
        this.conns.delete(conn.peer);
        this.onPeerLeave(conn.peer);
      }
    });
    conn.on('error', (e) => console.warn('[net] conn error', e));
  }

  join(code) {
    return new Promise((resolve, reject) => {
      let peer;
      try { peer = newPeer(); } catch (e) { reject(e); return; }
      let done = false;
      const fail = (msg) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        peer.destroy();
        reject(new Error(msg));
      };
      const timer = setTimeout(
        () => fail('Could not reach that lobby. Check the code and try again.'),
        12000,
      );
      peer.on('open', (id) => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          this.peer = peer;
          this.myId = id;
          this.hostConn = conn;
          this.isHost = false;
          this.code = code;
          resolve();
        });
        conn.on('data', (d) => this.onMessage(d, conn.peer));
        conn.on('close', () => {
          if (this.hostConn === conn) {
            this.hostConn = null;
            this.onHostLost();
          }
        });
      });
      peer.on('error', (err) => {
        if (!done) {
          fail(err.type === 'peer-unavailable'
            ? 'No lobby found with that code.'
            : 'Connection error (' + err.type + ').');
        } else {
          console.warn('[net]', err.type, err);
        }
      });
    });
  }

  send(msg) {
    if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }

  broadcast(msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  sendTo(peerId, msg) {
    const c = this.conns.get(peerId);
    if (c && c.open) c.send(msg);
  }

  kick(peerId) {
    const c = this.conns.get(peerId);
    if (c) c.close();
  }

  close() {
    const peer = this.peer;
    this.hostConn = null;
    this.conns.clear();
    this.peer = null;
    this.isHost = false;
    this.code = null;
    if (peer) peer.destroy();
  }
}
