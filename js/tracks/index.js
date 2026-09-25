function figureEight() {
  const pts = [];
  const a = 165, n = 40, bridgeHeight = 8.5, t0 = -Math.PI * 0.62;
  for (let i = 0; i < n; i++) {
    const t = t0 + (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const y = c > 0 ? bridgeHeight * Math.pow(c, 1.4) : 0;
    pts.push([a * Math.sin(t), y, a * 1.1 * Math.sin(t) * c]);
  }
  return pts;
}

function snowyPoints() {
  // Climbing alpine loop with hills.
  const pts = [];
  const n = 28;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 130 + 25 * Math.sin(t * 2);
    const y = 4 + 10 * Math.max(0, Math.sin(t - 0.4)) + 6 * Math.max(0, Math.sin(t * 2 + 1));
    pts.push([Math.cos(t) * r, y, Math.sin(t) * r * 0.85]);
  }
  return pts;
}

function neonPoints() {
  const pts = [];
  const n = 32;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = 120 + 40 * Math.sin(t * 3);
    const y = i > 8 && i < 14 ? 7 : (i > 20 && i < 24 ? 4 : 0);
    pts.push([Math.cos(t) * r * 1.1, y, Math.sin(t) * r]);
  }
  return pts;
}

// Points are [x, z] (flat) or [x, y, z]. jumps: [{ at: 0..1 along track, launch }]
export const TRACKS = [
  {
    id: 'meadow',
    name: 'Meadow Loop',
    width: 18,
    margin: 6,
    offroadMul: 0.5,
    seed: 11,
    points: [
      [0, 0, -120], [80, 1, -118], [140, 2, -85], [155, 1, -15], [120, 0, 40], [62, 0, 52], [32, 2, 92],
      [45, 4, 138], [5, 3, 172], [-70, 1, 165], [-132, 0, 112], [-155, 0, 30], [-135, 1, -50], [-80, 0, -102],
    ],
    items: [0.17, 0.48, 0.78],
    boosts: [[0.3, 0], [0.62, -0.45], [0.9, 0.45]],
    jumps: [{ at: 0.55, launch: 9 }],
    theme: {
      sky: 0x8fd3ff, fog: 0xbfe6ff, ground: 0x5cb85c, hemiGround: 0x3c6e3c,
      road: '#5a5f66', curbA: '#e53935', curbB: '#ffffff',
      wallA: '#ffffff', wallB: '#e53935', deco: 'trees', mountain: 0x6b8f71,
    },
  },
  {
    id: 'bridge',
    name: 'Sunset Bridge 8',
    width: 16,
    margin: 6,
    offroadMul: 0.55,
    seed: 23,
    points: figureEight(),
    items: [0.2, 0.52, 0.8],
    boosts: [[0.12, 0], [0.4, 0.4], [0.66, -0.4]],
    jumps: [{ at: 0.35, launch: 8 }],
    theme: {
      sky: 0xffa877, fog: 0xffc9a0, ground: 0xe6c27a, hemiGround: 0x8a6b3a,
      road: '#4d4f5c', curbA: '#1e88e5', curbB: '#ffffff',
      wallA: '#607d8b', wallB: '#90a4ae', deco: 'palms', mountain: 0x9c6b5a,
    },
  },
  {
    id: 'volcano',
    name: 'Volcano Twist',
    width: 15,
    margin: 5,
    offroadMul: 0.38,
    seed: 37,
    points: [
      [0, 0, -140], [70, 1, -142], [122, 2, -112], [134, 3, -62], [95, 4, -30], [45, 3, -42], [10, 2, -12],
      [18, 1, 30], [68, 2, 42], [120, 4, 62], [132, 5, 112], [92, 4, 152], [22, 2, 152], [-28, 1, 122],
      [-40, 0, 72], [-90, 1, 58], [-140, 2, 28], [-152, 1, -40], [-122, 0, -102], [-62, 0, -132],
    ],
    items: [0.15, 0.42, 0.68, 0.88],
    boosts: [[0.28, 0], [0.55, 0.4], [0.8, -0.4]],
    jumps: [{ at: 0.5, launch: 10 }],
    theme: {
      sky: 0x3a1c1c, fog: 0x5a2616, ground: 0xb8360f, groundEmissive: 0x4a0d00, hemiGround: 0x5a1a0a,
      road: '#3a3a3f', curbA: '#ffb300', curbB: '#222222',
      wallA: '#333333', wallB: '#ff6f00', deco: 'rocks', mountain: 0x2a1a18,
    },
  },
  {
    id: 'snow',
    name: 'Snowy Summit',
    width: 16,
    margin: 5,
    offroadMul: 0.45,
    seed: 51,
    points: snowyPoints(),
    items: [0.18, 0.45, 0.72],
    boosts: [[0.25, 0], [0.58, 0.35], [0.85, -0.35]],
    jumps: [{ at: 0.22, launch: 11 }, { at: 0.68, launch: 9 }],
    theme: {
      sky: 0xc9e7ff, fog: 0xe8f4ff, ground: 0xeef5fb, hemiGround: 0x9bb4c8,
      road: '#5c6675', curbA: '#1e88e5', curbB: '#ffffff',
      wallA: '#dbe7f3', wallB: '#90caf9', deco: 'pines', mountain: 0xb0c4d8,
    },
  },
  {
    id: 'neon',
    name: 'Neon City',
    width: 15,
    margin: 5,
    offroadMul: 0.5,
    seed: 77,
    points: neonPoints(),
    items: [0.16, 0.4, 0.64, 0.88],
    boosts: [[0.3, 0], [0.55, -0.4], [0.8, 0.4]],
    jumps: [{ at: 0.4, launch: 10 }],
    theme: {
      sky: 0x12081f, fog: 0x1a0f2e, ground: 0x1a1228, hemiGround: 0x2a1840,
      road: '#2a2f42', curbA: '#ff00aa', curbB: '#00e5ff',
      wallA: '#7c4dff', wallB: '#00e5ff', deco: 'neon', mountain: 0x0d0618,
      groundEmissive: 0x0a0614,
    },
  },
];
