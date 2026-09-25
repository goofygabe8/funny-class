import { TRACKS } from './tracks/index.js';
import { CHARACTERS, KART_BODIES } from './assets.js';

export const PALETTE = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#ec407a'];
const BOT_NAMES = ['Blip', 'Nitro', 'Pip', 'Rex', 'Luna', 'Dash', 'Moxie', 'Turbo'];
export const MAX_KARTS = 8;
export const LAPS = 3;

const $ = (id) => document.getElementById(id);

export function showScreen(name) {
  for (const id of ['menu', 'lobby', 'results', 'settings', 'loading']) {
    const el = $(id);
    if (el) el.classList.toggle('hidden', id !== name);
  }
}

function cleanName(n) {
  return String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 12) || 'Racer';
}

export class Lobby {
  constructor({ net, settings, onStart, onQualityChange }) {
    this.net = net;
    this.settings = settings;
    this.onStart = onStart;
    this.onQualityChange = onQualityChange;
    this.players = [];
    this.track = 0;
    this.bots = 3;
    this.racing = false;
    this.buildMenu();
    this.buildLobby();
  }

  buildMenu() {
    const nameInput = $('nameInput');
    nameInput.value = this.settings.name;
    nameInput.addEventListener('input', () => {
      this.settings.name = cleanName(nameInput.value);
      this.settings.save();
    });

    const picker = $('colorPicker');
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.className = 'swatch' + (c === this.settings.color ? ' selected' : '');
      b.style.background = c;
      b.addEventListener('click', () => {
        this.settings.color = c;
        this.settings.save();
        for (const s of picker.children) s.classList.toggle('selected', s === b);
      });
      picker.appendChild(b);
    }

    this.buildPickers();

    const codeInput = $('codeInput');
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinGame();
    });
    $('hostBtn').addEventListener('click', () => this.hostGame());
    $('joinBtn').addEventListener('click', () => this.joinGame());

    const qBtn = $('qualityBtn');
    const qLabel = () => {
      const labels = { low: 'Low', medium: 'Medium', high: 'High' };
      qBtn.textContent = 'Graphics: ' + (labels[this.settings.quality] || 'Low');
    };
    qLabel();
    qBtn.addEventListener('click', () => {
      const order = ['low', 'medium', 'high'];
      const i = order.indexOf(this.settings.quality);
      this.settings.quality = order[(i + 1) % order.length];
      this.settings.save();
      qLabel();
      this.onQualityChange();
    });
    $('settingsBtn')?.addEventListener('click', () => {
      $('settingsQuality').value = this.settings.quality;
      showScreen('settings');
    });
  }

  buildPickers() {
    const charBox = $('charPicker');
    const kartBox = $('kartPicker');
    if (!charBox || !kartBox) return;
    for (const c of CHARACTERS) {
      const b = document.createElement('button');
      b.className = 'pick' + (c.id === this.settings.charId ? ' selected' : '');
      b.textContent = c.name;
      b.style.borderColor = c.color;
      b.addEventListener('click', () => {
        this.settings.charId = c.id;
        this.settings.color = c.color;
        this.settings.save();
        for (const s of charBox.children) s.classList.toggle('selected', s === b);
        const sw = [...$('colorPicker').children].find((el) => el.style.background === '' || true);
        for (const s of $('colorPicker').children) {
          s.classList.toggle('selected', s.style.background.toLowerCase() === c.color.toLowerCase()
            || s.style.background.replace(/\s/g, '') === c.color);
        }
        this.updateStats();
      });
      charBox.appendChild(b);
    }
    for (const k of KART_BODIES) {
      const b = document.createElement('button');
      b.className = 'pick' + (k.id === this.settings.bodyId ? ' selected' : '');
      b.textContent = k.name;
      b.addEventListener('click', () => {
        this.settings.bodyId = k.id;
        this.settings.save();
        for (const s of kartBox.children) s.classList.toggle('selected', s === b);
        this.updateStats();
      });
      kartBox.appendChild(b);
    }
    this.updateStats();
  }

  updateStats() {
    const body = KART_BODIES.find((b) => b.id === this.settings.bodyId) || KART_BODIES[1];
    const set = (id, v) => { const el = $(id); if (el) el.style.width = Math.round(v * 50) + '%'; };
    set('statSpeed', body.speed);
    set('statAccel', body.accel);
    set('statHandle', body.handling);
  }

  buildLobby() {
    const ts = $('trackSelect');
    TRACKS.forEach((t, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = t.name;
      ts.appendChild(o);
    });
    ts.addEventListener('change', () => {
      this.track = Number(ts.value);
      this.broadcast();
    });
    $('botSelect').addEventListener('change', () => {
      this.bots = Number($('botSelect').value);
      this.broadcast();
    });
    $('startBtn').addEventListener('click', () => this.startRace());
    $('leaveBtn').addEventListener('click', () => this.leave());
  }

  setMenuStatus(text, ok = false) {
    const s = $('menuStatus');
    s.textContent = text || '';
    s.classList.toggle('ok', ok);
  }

  setBusy(busy) {
    $('hostBtn').disabled = busy;
    $('joinBtn').disabled = busy;
  }

  async hostGame() {
    this.setBusy(true);
    this.setMenuStatus('Creating lobby...', true);
    try {
      await this.net.host();
    this.players = [{
      id: this.net.myId,
      name: this.settings.name,
      color: this.settings.color,
      charId: this.settings.charId,
      bodyId: this.settings.bodyId,
    }];
      this.racing = false;
      this.setMenuStatus('');
      this.showLobby();
    } catch (e) {
      this.setMenuStatus(e.message || 'Could not create a lobby.');
    } finally {
      this.setBusy(false);
    }
  }

  async joinGame() {
    const code = $('codeInput').value.trim().toUpperCase();
    if (code.length !== 5) {
      this.setMenuStatus('Enter the 5-letter lobby code.');
      return;
    }
    this.setBusy(true);
    this.setMenuStatus('Connecting...', true);
    try {
      await this.net.join(code);
      this.net.send({
        t: 'join',
        name: this.settings.name,
        color: this.settings.color,
        charId: this.settings.charId,
        bodyId: this.settings.bodyId,
      });
      this.setMenuStatus('Connected! Loading lobby...', true);
    } catch (e) {
      this.setMenuStatus(e.message);
    } finally {
      this.setBusy(false);
    }
  }

  leave() {
    this.net.close();
    this.showMenu();
  }

  handle(m, from) {
    const net = this.net;
    if (net.isHost) {
      if (m.t !== 'join') return;
      if (this.racing) {
        net.sendTo(from, { t: 'reject', reason: 'A race is in progress. Try again when it ends.' });
        setTimeout(() => net.kick(from), 500);
        return;
      }
      let p = this.players.find((x) => x.id === from);
      if (!p) {
        if (this.players.length >= MAX_KARTS) {
          net.sendTo(from, { t: 'reject', reason: 'That lobby is full.' });
          setTimeout(() => net.kick(from), 500);
          return;
        }
        p = { id: from };
        this.players.push(p);
      }
      p.name = cleanName(m.name);
      p.color = PALETTE.includes(m.color) ? m.color : PALETTE[this.players.length % PALETTE.length];
      p.charId = m.charId || null;
      p.bodyId = m.bodyId || 'balanced';
      this.broadcast();
      return;
    }
    if (m.t === 'lobby') {
      this.players = m.players;
      this.track = m.track;
      this.bots = m.bots;
      this.setMenuStatus('');
      this.showLobby();
    } else if (m.t === 'reject') {
      net.close();
      this.showMenu(m.reason);
    }
  }

  peerLeft(peerId) {
    const before = this.players.length;
    this.players = this.players.filter((p) => p.id !== peerId);
    if (this.players.length === before) return;
    if (this.net.isHost && !this.racing) this.broadcast();
    else if (!$('lobby').classList.contains('hidden')) this.render();
  }

  onHostChanged(newHostId, racing) {
    const i = this.players.findIndex((p) => p.id === newHostId);
    if (i > 0) this.players.unshift(this.players.splice(i, 1)[0]);
    this.racing = racing;
    if (!this.net.isHost) return;
    if (!racing) this.broadcast();
    if (!$('lobby').classList.contains('hidden')) {
      $('lobbyStatus').textContent = 'The host left, so you are now the host.';
      $('lobbyStatus').classList.add('ok');
    }
  }

  clampBots() {
    this.bots = Math.max(0, Math.min(this.bots, MAX_KARTS - this.players.length));
  }

  broadcast() {
    if (!this.net.isHost) return;
    this.clampBots();
    this.net.broadcast({ t: 'lobby', players: this.players, track: this.track, bots: this.bots });
    this.render();
  }

  startRace() {
    if (!this.net.isHost || this.racing) return;
    this.clampBots();
    const used = new Set(this.players.map((p) => p.color));
    const botColors = PALETTE.filter((c) => !used.has(c)).concat(PALETTE);
    const karts = [];
    for (let i = 0; i < this.bots; i++) {
      karts.push({ name: BOT_NAMES[i], color: botColors[i % botColors.length], isBot: true, peer: null });
    }
    for (const p of this.players) {
      karts.push({
        name: p.name, color: p.color, isBot: false, peer: p.id,
        charId: p.charId, bodyId: p.bodyId || 'balanced',
      });
    }
    const msg = { t: 'start', track: this.track, laps: LAPS, karts };
    this.racing = true;
    this.net.broadcast(msg);
    this.onStart(msg);
  }

  returnToLobby() {
    this.racing = false;
    this.showLobby();
    this.broadcast();
  }

  showMenu(message) {
    this.players = [];
    this.racing = false;
    showScreen('menu');
    this.setMenuStatus(message || '');
  }

  showLobby() {
    if ($('lobby').classList.contains('hidden')) $('lobbyStatus').textContent = '';
    showScreen('lobby');
    this.render();
  }

  render() {
    const net = this.net;
    $('lobbyCode').textContent = net.code || '';
    const list = $('playerList');
    list.innerHTML = '';
    this.players.forEach((p, i) => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.textContent = p.name;
      li.append(dot, name);
      const tags = [];
      if (i === 0) tags.push('host');
      if (p.id === net.myId) tags.push('you');
      if (tags.length) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = tags.join(' / ');
        li.appendChild(tag);
      }
      list.appendChild(li);
    });

    const isHost = net.isHost;
    $('hostControls').classList.toggle('hidden', !isHost);
    $('trackSelect').value = String(this.track);
    const bs = $('botSelect');
    const maxBots = MAX_KARTS - this.players.length;
    bs.innerHTML = '';
    for (let i = 0; i <= maxBots; i++) {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = i === 0 ? 'No bots' : i + (i === 1 ? ' bot' : ' bots');
      bs.appendChild(o);
    }
    bs.value = String(Math.min(this.bots, maxBots));
    const trackName = TRACKS[this.track]?.name || '';
    $('waitMsg').textContent = isHost
      ? `${this.players.length} of ${MAX_KARTS} racers. Empty spots can be filled with bots.`
      : `Track: ${trackName} | Bots: ${this.bots}. Waiting for the host to start...`;
  }
}
