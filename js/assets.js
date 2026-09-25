import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

export const CHARACTERS = [
  { id: 'dash', name: 'Dash', color: '#e53935' },
  { id: 'bolt', name: 'Bolt', color: '#1e88e5' },
  { id: 'pip', name: 'Pip', color: '#43a047' },
  { id: 'luna', name: 'Luna', color: '#8e24aa' },
  { id: 'rex', name: 'Rex', color: '#fb8c00' },
  { id: 'nova', name: 'Nova', color: '#00acc1' },
  { id: 'moxie', name: 'Moxie', color: '#ec407a' },
  { id: 'blip', name: 'Blip', color: '#fdd835' },
];

export const KART_BODIES = [
  { id: 'speedy', name: 'Speedy', speed: 1.06, accel: 0.92, handling: 0.95 },
  { id: 'balanced', name: 'Balanced', speed: 1, accel: 1, handling: 1 },
  { id: 'tank', name: 'Tank', speed: 0.94, accel: 1.08, handling: 0.9 },
  { id: 'drifter', name: 'Drifter', speed: 0.98, accel: 1, handling: 1.12 },
];

export function loadGltf(url) {
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve, reject) => {
    loader.load(url, (g) => resolve(g), undefined, reject);
  });
  cache.set(url, p);
  return p;
}

export async function preloadAssets(onProgress) {
  const urls = [];
  for (const id of ['speedy', 'balanced', 'tank', 'drifter']) {
    urls.push(`assets/models/kart-${id}.glb`);
  }
  for (const c of CHARACTERS) urls.push(`assets/models/char-${c.id}.glb`);
  let done = 0;
  const results = await Promise.all(urls.map(async (url) => {
    try {
      const g = await loadGltf(url);
      done++;
      if (onProgress) onProgress(done / urls.length, url);
      return { url, ok: true, g };
    } catch {
      done++;
      if (onProgress) onProgress(done / urls.length, url);
      return { url, ok: false };
    }
  }));
  return results;
}

export function getCachedScene(url) {
  const p = cache.get(url);
  return p && p.then ? null : null;
}

export async function cloneModel(url) {
  try {
    const g = await loadGltf(url);
    return g.scene.clone(true);
  } catch {
    return null;
  }
}
