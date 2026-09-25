import * as THREE from 'three';
import { Net } from './net.js';
import { Lobby, PALETTE, showScreen } from './lobby.js';
import { Race } from './race.js';
import { Track } from './track.js';
import { TRACKS } from './tracks/index.js';
import { Input } from './input.js';
import { ChaseCam } from './camera.js';
import { Hud, formatTime, ordinal } from './hud.js';
import { getPreset, applyRendererQuality, measureFps, suggestPreset } from './quality.js';
import { audio } from './audio.js';
import { CHARACTERS, KART_BODIES } from './assets.js';

const $ = (id) => document.getElementById(id);

const settings = {
  name: localStorage.getItem('kr_name') || 'Racer' + Math.floor(10 + Math.random() * 90),
  color: localStorage.getItem('kr_color') || PALETTE[Math.floor(Math.random() * PALETTE.length)],
  quality: localStorage.getItem('kr_quality') || 'low',
  charId: localStorage.getItem('kr_char') || CHARACTERS[0].id,
  bodyId: localStorage.getItem('kr_body') || 'balanced',
  save() {
    localStorage.setItem('kr_name', this.name);
    localStorage.setItem('kr_color', this.color);
    localStorage.setItem('kr_quality', this.quality);
    localStorage.setItem('kr_char', this.charId);
    localStorage.setItem('kr_body', this.bodyId);
  },
};
if (!PALETTE.includes(settings.color)) settings.color = PALETTE[0];
settings.save();

const canvas = $('game');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  console.warn('WebGL unavailable; lobby and multiplayer still work.', e);
}
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 1400);
const cam = new ChaseCam(camera);
const input = new Input();
const hud = new Hud();
const net = new Net();

let race = null;
let preview = null;

function resize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

function applyQuality() {
  if (!renderer) return;
  const preset = getPreset(settings.quality);
  // Antialias requires a new renderer.
  const wantAA = !!preset.antialias;
  if (!!renderer.getContextAttributes?.().antialias !== wantAA) {
    try {
      const next = new THREE.WebGLRenderer({ canvas, antialias: wantAA, powerPreference: 'high-performance' });
      renderer.dispose();
      renderer = next;
    } catch (e) {
      console.warn(e);
    }
  }
  applyRendererQuality(renderer, preset);
  resize();
  clearPreview();
}

function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

function showPreview(id) {
  if (preview && preview.id === id && preview.quality === settings.quality) return;
  if (preview) disposeScene(preview.scene);
  const scene = new THREE.Scene();
  const preset = getPreset(settings.quality);
  const track = new Track(TRACKS[id] || TRACKS[0], preset);
  track.setupScene(scene, preset);
  scene.add(track.group);
  preview = { id, scene, track, quality: settings.quality };
}

function clearPreview() {
  if (preview) disposeScene(preview.scene);
  preview = null;
}

const lobby = new Lobby({
  net,
  settings,
  onStart: (msg) => beginRace(msg),
  onQualityChange: () => {
    applyQuality();
    clearPreview();
  },
});

function beginRace(msg) {
  if (!Array.isArray(msg.karts) || !msg.karts.some((k) => k.peer === net.myId)) return;
  endRace();
  clearPreview();
  if (document.activeElement) document.activeElement.blur();
  audio.ensure().then(() => audio.startMusic(msg.track || 0));
  const r = new Race({ start: msg, myPeer: net.myId, isHost: net.isHost, net, quality: settings.quality });
  r.onResults = (rows) => setTimeout(() => { if (race === r) showResults(rows); }, 2500);
  r.onHostTimeout = () => leaveGame('Lost connection to the race.');
  r.onPeerDropped = (peer) => lobby.peerLeft(peer);
  race = r;
  cam.reset();
  hud.setup(r);
  hud.show(true);
  showScreen(null);
  input.setTouchVisible(true);
}

function endRace() {
  if (!race) return;
  disposeScene(race.scene);
  race = null;
  hud.show(false);
  input.setTouchVisible(false);
  audio.stopAllEngines();
  audio.stopMusic();
}

function showResults(rows) {
  const podium = $('resultsPodium');
  if (podium) {
    podium.innerHTML = '';
    for (const r of rows.slice(0, 3)) {
      const d = document.createElement('div');
      d.className = 'pod p' + r.place;
      d.innerHTML = `<span class="dot" style="background:${r.color}"></span><div>${r.name}</div><b>${ordinal(r.place)}</b>`;
      podium.appendChild(d);
    }
  }
  const table = $('resultsTable');
  table.innerHTML = '<tr><th>#</th><th>Racer</th><th style="text-align:right">Time</th></tr>';
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (r.me) tr.className = 'me';
    const place = document.createElement('td');
    place.className = 'place';
    place.textContent = ordinal(r.place);
    const name = document.createElement('td');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = r.color;
    name.append(dot, document.createTextNode(r.name + (r.bot ? ' (bot)' : '') + (r.me ? ' (you)' : '')));
    const time = document.createElement('td');
    time.className = 'time';
    time.textContent = r.time == null ? 'DNF' : formatTime(r.time);
    tr.append(place, name, time);
    table.appendChild(tr);
  }
  $('backLobbyBtn').classList.toggle('hidden', !net.isHost);
  $('resultsWait').classList.toggle('hidden', net.isHost);
  hud.show(false);
  input.setTouchVisible(false);
  audio.stopAllEngines();
  showScreen('results');
}

function leaveGame(message) {
  endRace();
  net.close();
  lobby.showMenu(message);
}

$('backLobbyBtn').addEventListener('click', () => {
  endRace();
  lobby.returnToLobby();
});
$('resultsLeaveBtn').addEventListener('click', () => leaveGame());

net.onMessage = (m, from) => {
  if (!m || typeof m.t !== 'string') return;
  switch (m.t) {
    case 'join':
      lobby.handle(m, from);
      return;
    case 'reject':
      if (net.isHost) return;
      endRace();
      lobby.handle(m, from);
      return;
    case 'lobby':
      if (net.isHost) return;
      endRace();
      lobby.handle(m, from);
      return;
    case 'start':
      if (!net.isHost) beginRace(m);
      return;
    default:
      if (race) race.handle(m, from);
  }
};
net.onPeerLeave = (peer) => {
  lobby.peerLeft(peer);
  if (race) race.peerLeft(peer);
};
net.onHostChanged = (newHostId) => {
  lobby.onHostChanged(newHostId, !!race);
  if (race) race.onHostChanged(newHostId);
  if (!$('results').classList.contains('hidden')) {
    $('backLobbyBtn').classList.toggle('hidden', !net.isHost);
    $('resultsWait').classList.toggle('hidden', net.isHost);
  }
};
net.onHostLost = (message) => leaveGame(message || 'Lost connection to the game server.');
addEventListener('pagehide', () => net.close());

addEventListener('resize', resize);
applyQuality();

// Unlock audio on first interaction and optionally auto-pick a graphics preset once.
addEventListener('pointerdown', () => { audio.ensure(); }, { once: true });
if (!localStorage.getItem('kr_quality')) {
  measureFps(0.9).then((fps) => {
    settings.quality = suggestPreset(fps);
    settings.save();
    applyQuality();
    const qBtn = $('qualityBtn');
    if (qBtn) {
      const labels = { low: 'Low', medium: 'Medium', high: 'High' };
      qBtn.textContent = 'Graphics: ' + (labels[settings.quality] || 'Low');
    }
  });
}

$('settingsClose')?.addEventListener('click', () => {
  settings.quality = $('settingsQuality').value;
  settings.save();
  applyQuality();
  audio.setVolume(Number($('volSlider').value) / 100);
  audio.setMuted($('muteCheck').checked);
  const labels = { low: 'Low', medium: 'Medium', high: 'High' };
  $('qualityBtn').textContent = 'Graphics: ' + (labels[settings.quality] || 'Low');
  showScreen('menu');
});
$('volSlider')?.addEventListener('input', (e) => audio.setVolume(Number(e.target.value) / 100));
$('muteCheck')?.addEventListener('change', (e) => audio.setMuted(e.target.checked));
if ($('volSlider')) $('volSlider').value = String(Math.round(audio.volume * 100));
if ($('muteCheck')) $('muteCheck').checked = audio.muted;

let last = performance.now();
function tick(t, render) {
  const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
  last = t;
  input.update(dt);
  if (race) {
    race.update(dt, input);
    if (!render || !renderer) return;
    cam.follow(race.me, dt);
    hud.update(race);
    renderer.render(race.scene, camera);
  } else if (render && renderer) {
    showPreview(lobby.track || 0);
    cam.orbit(preview.track, t / 1000);
    renderer.render(preview.scene, camera);
  }
}
function frame() {
  requestAnimationFrame(frame);
  tick(performance.now(), true);
}
requestAnimationFrame(frame);

// Background tabs get no animation frames, which would freeze the race for everyone if the host switches tabs.
const bgTimer = new Worker(URL.createObjectURL(
  new Blob(['setInterval(() => postMessage(0), 33);'], { type: 'text/javascript' })));
if (new URLSearchParams(location.search).has('debug') || true) {
  // Always expose for automated tests; harmless in production.
  window.__game = { get race() { return race; }, net, lobby, renderer };
}
bgTimer.onmessage = () => {
  const now = performance.now();
  if (now - last > 120) tick(now, false);
};
