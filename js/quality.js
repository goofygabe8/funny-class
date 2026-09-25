// Low / Medium / High presets for Chromebook-friendly performance.
export const PRESETS = {
  low: {
    id: 'low',
    label: 'Low',
    pixelRatio: 0.75,
    antialias: false,
    shadows: false,
    shadowSize: 0,
    fogNear: 0.35,
    fogFar: 280,
    drawDistance: 320,
    scenery: 0.35,
    particles: 0.4,
    post: false,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    pixelRatio: 1,
    antialias: false,
    shadows: true,
    shadowSize: 1024,
    fogNear: 0.4,
    fogFar: 520,
    drawDistance: 600,
    scenery: 0.7,
    particles: 0.75,
    post: false,
  },
  high: {
    id: 'high',
    label: 'High',
    pixelRatio: 1,
    antialias: true,
    shadows: true,
    shadowSize: 2048,
    fogNear: 0.45,
    fogFar: 850,
    drawDistance: 900,
    scenery: 1,
    particles: 1,
    post: true,
  },
};

export function getPreset(id) {
  return PRESETS[id] || PRESETS.low;
}

export function applyRendererQuality(renderer, preset) {
  if (!renderer) return;
  const dpr = Math.min(devicePixelRatio || 1, 1) * preset.pixelRatio;
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = !!preset.shadows;
  if (preset.shadows) {
    renderer.shadowMap.type = 2; // THREE.PCFSoftShadowMap without importing three here
  }
}

// Quick FPS probe used on the first menu frame to pick a starting preset.
export function suggestPreset(fps) {
  if (fps >= 50) return 'high';
  if (fps >= 30) return 'medium';
  return 'low';
}

export async function measureFps(seconds = 0.8) {
  return new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    function tick(t) {
      frames++;
      if (t - t0 < seconds * 1000) requestAnimationFrame(tick);
      else resolve(frames / ((t - t0) / 1000));
    }
    requestAnimationFrame(tick);
  });
}
