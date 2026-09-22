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

// Points are [x, z] (flat) or [x, y, z]. Karts drive in point order; the start line is at the first point.
export const TRACKS = [
  {
    id: 'meadow',
    name: 'Meadow Loop',
    width: 18,
    margin: 6,
    offroadMul: 0.5,
    seed: 11,
    points: [
      [0, -120], [80, -118], [140, -85], [155, -15], [120, 40], [62, 52], [32, 92],
      [45, 138], [5, 172], [-70, 165], [-132, 112], [-155, 30], [-135, -50], [-80, -102],
    ],
    items: [0.17, 0.48, 0.78],
    boosts: [[0.3, 0], [0.62, -0.45], [0.9, 0.45]],
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
      [0, -140], [70, -142], [122, -112], [134, -62], [95, -30], [45, -42], [10, -12],
      [18, 30], [68, 42], [120, 62], [132, 112], [92, 152], [22, 152], [-28, 122],
      [-40, 72], [-90, 58], [-140, 28], [-152, -40], [-122, -102], [-62, -132],
    ],
    items: [0.15, 0.42, 0.68, 0.88],
    boosts: [[0.28, 0], [0.55, 0.4], [0.8, -0.4]],
    theme: {
      sky: 0x3a1c1c, fog: 0x5a2616, ground: 0xb8360f, groundEmissive: 0x4a0d00, hemiGround: 0x5a1a0a,
      road: '#3a3a3f', curbA: '#ffb300', curbB: '#222222',
      wallA: '#333333', wallB: '#ff6f00', deco: 'rocks', mountain: 0x2a1a18,
    },
  },
];
