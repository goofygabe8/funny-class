import * as THREE from 'three';

export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ribbon(N, point, alongU) {
  const pos = new Float32Array((N + 1) * 6);
  const uv = new Float32Array((N + 1) * 4);
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const r = point(i % N, i);
    pos.set(r.a, i * 6);
    pos.set(r.b, i * 6 + 3);
    uv.set(alongU ? [r.v, 0, r.v, 1] : [0, r.v, 1, r.v], i * 4);
    if (i < N) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Track {
  constructor(def, quality = 'low') {
    this.def = def;
    this.quality = typeof quality === 'string' ? quality : (quality?.id || 'low');
    this.preset = typeof quality === 'object' ? quality : null;
    this.halfW = def.width / 2;

    const pts = def.points.map((p) =>
      p.length === 3 ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p[0], 0, p[1]));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const length = curve.getLength();
    const N = Math.max(200, Math.round(length / 1.5));
    const sp = curve.getSpacedPoints(N);
    this.N = N;
    this.length = length;
    this.spacing = length / N;

    const mk = () => new Float32Array(N);
    this.px = mk(); this.py = mk(); this.pz = mk();
    this.tx = mk(); this.tz = mk(); this.nx = mk(); this.nz = mk();
    this.wall = mk();
    for (let i = 0; i < N; i++) {
      this.px[i] = sp[i].x;
      this.py[i] = Math.max(0, sp[i].y);
      this.pz[i] = sp[i].z;
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l;
      this.tz[i] = dz / l;
      this.nx[i] = -this.tz[i];
      this.nz[i] = this.tx[i];
      const elev = Math.min(1, Math.max(0, (this.py[i] - 0.3) / 1.5));
      this.wall[i] = this.halfW + def.margin * (1 - elev) + 0.4 * elev;
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };

    this.boxes = [];
    for (const f of def.items) {
      const i = Math.floor(f * N) % N;
      for (const lf of [-0.55, -0.18, 0.18, 0.55]) {
        const l = lf * this.halfW;
        this.boxes.push({ x: this.px[i] + this.nx[i] * l, y: this.py[i] + 1.2, z: this.pz[i] + this.nz[i] * l });
      }
    }
    this.pads = def.boosts.map(([f, lf]) => ({ idx: Math.floor(f * N) % N, lat: lf * this.halfW }));
    this.ramps = (def.jumps || []).map((j) => ({
      idx: Math.floor(j.at * N) % N,
      launch: j.launch || 9,
    }));

    this.group = new THREE.Group();
    this.buildGround();
    this.buildRoad();
    this.buildWalls();
    this.buildPillars();
    this.buildStart();
    this.buildPads();
    this.buildRamps();
    this.buildDecor();
  }

  setupScene(scene, preset) {
    const th = this.def.theme;
    const p = typeof preset === 'object' ? preset : null;
    const far = p?.drawDistance || (this.quality === 'high' ? 850 : this.quality === 'medium' ? 600 : 320);
    scene.background = new THREE.Color(th.sky);
    scene.fog = new THREE.Fog(th.fog, far * (p?.fogNear || 0.35), far);
    scene.add(new THREE.HemisphereLight(0xffffff, th.hemiGround, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, p?.shadows ? 2.1 : 1.8);
    sun.position.set(120, 200, 60);
    if (p?.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(p.shadowSize || 1024, p.shadowSize || 1024);
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 500;
      const s = 180;
      sun.shadow.camera.left = -s;
      sun.shadow.camera.right = s;
      sun.shadow.camera.top = s;
      sun.shadow.camera.bottom = -s;
    }
    scene.add(sun);
    this.sun = sun;
  }

  rampAt(k) {
    if (!k || k.idx == null) return null;
    const N = this.N;
    for (const r of this.ramps) {
      let d = Math.abs(k.idx - r.idx);
      d = Math.min(d, N - d);
      if (d <= 2) return r;
    }
    return null;
  }

  heading(i) {
    return Math.atan2(this.tx[i], this.tz[i]);
  }

  locate(x, y, z, hint) {
    const { N, px, py, pz } = this;
    let best = 0, bd = Infinity;
    const test = (j) => {
      const dx = x - px[j], dz = z - pz[j], dy = y - py[j];
      const d = dx * dx + dz * dz + dy * dy * 4;
      if (d < bd) { bd = d; best = j; }
    };
    if (hint == null || hint < 0) {
      for (let j = 0; j < N; j++) test(j);
    } else {
      for (let o = -20; o <= 20; o++) test((((hint + o) % N) + N) % N);
    }
    return best;
  }

  lateral(x, z, i) {
    return (x - this.px[i]) * this.nx[i] + (z - this.pz[i]) * this.nz[i];
  }

  // Keeps a kart inside the walls, snaps it to the road height and counts laps.
  constrain(k) {
    const { N, px, py, pz, nx, nz, tx, tz } = this;
    const prev = k.idx;
    const i = this.locate(k.x, k.y, k.z, prev);
    k.idx = i;
    if (prev != null) {
      if (prev > N * 0.75 && i < N * 0.25) k.lap++;
      else if (prev < N * 0.25 && i > N * 0.75) k.lap--;
    }
    let lat = this.lateral(k.x, k.z, i);
    const lim = this.wall[i] - 1.0;
    if (Math.abs(lat) > lim) {
      const s = Math.sign(lat);
      const push = lat - s * lim;
      k.x -= nx[i] * push;
      k.z -= nz[i] * push;
      lat = s * lim;
      const vn = k.vx * nx[i] + k.vz * nz[i];
      if (vn * s > 0) {
        k.vx -= nx[i] * vn * 1.4;
        k.vz -= nz[i] * vn * 1.4;
      }
      k.vx *= 0.99;
      k.vz *= 0.99;
    }
    k.lat = lat;
    k.offroad = Math.abs(lat) > this.halfW + 0.3;
    const along = (k.x - px[i]) * tx[i] + (k.z - pz[i]) * tz[i];
    const j = along >= 0 ? (i + 1) % N : (i - 1 + N) % N;
    const f = Math.min(1, Math.abs(along) / this.spacing);
    k.y = py[i] + (py[j] - py[i]) * f;
  }

  onBoostPad(k) {
    const N = this.N;
    for (const p of this.pads) {
      let d = Math.abs(k.idx - p.idx);
      d = Math.min(d, N - d);
      if (d <= 2 && Math.abs(k.lat - p.lat) < 2) return true;
    }
    return false;
  }

  gridSlot(i) {
    const { N, px, py, pz, nx, nz } = this;
    const row = Math.floor(i / 2), col = i % 2;
    const idx = (((N - 8 - row * 6 - col * 3) % N) + N) % N;
    const lat = (col ? 1 : -1) * this.halfW * 0.38;
    return {
      x: px[idx] + nx[idx] * lat,
      y: py[idx],
      z: pz[idx] + nz[idx] * lat,
      h: this.heading(idx),
      idx,
    };
  }

  distToCenter2(x, z, step = 3) {
    let best = Infinity;
    for (let i = 0; i < this.N; i += step) {
      const dx = x - this.px[i], dz = z - this.pz[i];
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return best;
  }

  buildGround() {
    const th = this.def.theme;
    const b = this.bounds;
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 1600;
    const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: th.ground, emissive: th.groundEmissive || 0x000000 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(b.cx, -0.02, b.cz);
    this.group.add(m);
  }

  buildRoad() {
    const th = this.def.theme;
    const { px, py, pz, nx, nz, halfW } = this;
    const tex = canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = th.road;
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 4) {
        g.fillStyle = `rgba(0,0,0,${(Math.sin(y * 12.9898) * 0.5 + 0.5) * 0.07})`;
        g.fillRect(0, y, w, 4);
      }
      g.fillStyle = th.curbA;
      g.fillRect(0, 0, 4, h / 2);
      g.fillRect(w - 4, h / 2, 4, h / 2);
      g.fillStyle = th.curbB;
      g.fillRect(0, h / 2, 4, h / 2);
      g.fillRect(w - 4, 0, 4, h / 2);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillRect(5, 0, 2, h);
      g.fillRect(w - 7, 0, 2, h);
      g.fillRect(w / 2 - 1, 0, 2, h / 2);
    });
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    const geo = ribbon(this.N, (j, i) => {
      const y = py[j] + 0.05;
      return {
        a: [px[j] - nx[j] * halfW, y, pz[j] - nz[j] * halfW],
        b: [px[j] + nx[j] * halfW, y, pz[j] + nz[j] * halfW],
        v: (i * this.spacing) / 8,
      };
    }, false);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    this.group.add(mesh);
  }

  buildWalls() {
    const th = this.def.theme;
    const { px, py, pz, nx, nz, wall } = this;
    const tex = canvasTexture(16, 2, (g) => {
      g.fillStyle = th.wallA;
      g.fillRect(0, 0, 8, 2);
      g.fillStyle = th.wallB;
      g.fillRect(8, 0, 8, 2);
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const geo = ribbon(this.N, (j, i) => {
        const l = s * wall[j];
        const x = px[j] + nx[j] * l, z = pz[j] + nz[j] * l;
        return { a: [x, py[j] - 0.4, z], b: [x, py[j] + 1.0, z], v: (i * this.spacing) / 5 };
      }, true);
      this.group.add(new THREE.Mesh(geo, mat));
    }
  }

  buildPillars() {
    const { N, px, py, pz } = this;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a8f99 });
    const clear2 = (this.halfW + this.def.margin + 1) ** 2;
    for (let i = 0; i < N; i += 16) {
      if (py[i] < 2) continue;
      let blocked = false;
      for (let j = 0; j < N; j += 2) {
        if (py[j] > 1) continue;
        const dx = px[i] - px[j], dz = pz[i] - pz[j];
        if (dx * dx + dz * dz < clear2) { blocked = true; break; }
      }
      if (blocked) continue;
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(2.2, py[i], 2.2);
      m.position.set(px[i], py[i] / 2 - 0.3, pz[i]);
      this.group.add(m);
    }
  }

  buildStart() {
    const { px, py, pz, nx, nz, halfW } = this;
    const checker = canvasTexture(64, 16, (g) => {
      for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        g.fillRect(x * 8, y * 8, 8, 8);
      }
    });
    checker.magFilter = THREE.NearestFilter;
    const h = this.heading(0);
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 2, 2.4).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: checker }),
    );
    line.position.set(px[0], py[0] + 0.08, pz[0]);
    line.rotation.y = h;
    this.group.add(line);

    const postMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    const postGeo = new THREE.BoxGeometry(0.8, 7, 0.8);
    for (const s of [-1, 1]) {
      const l = s * (halfW + 1.5);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px[0] + nx[0] * l, py[0] + 3.5, pz[0] + nz[0] * l);
      this.group.add(post);
    }
    const bannerTex = checker.clone();
    bannerTex.needsUpdate = true;
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 2 + 3.8, 1.6, 0.4),
      new THREE.MeshLambertMaterial({ map: bannerTex }),
    );
    banner.position.set(px[0], py[0] + 7, pz[0]);
    banner.rotation.y = h;
    this.group.add(banner);
  }

  buildPads() {
    const tex = canvasTexture(64, 128, (g, w, h) => {
      g.fillStyle = '#ff6d00';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffee58';
      g.lineWidth = 10;
      g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const y = 22 + k * 38;
        g.beginPath();
        g.moveTo(10, y);
        g.lineTo(w / 2, y + 22);
        g.lineTo(w - 10, y);
        g.stroke();
      }
    });
    const geo = new THREE.PlaneGeometry(3.4, 6).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    for (const p of this.pads) {
      const i = p.idx;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(this.px[i] + this.nx[i] * p.lat, this.py[i] + 0.09, this.pz[i] + this.nz[i] * p.lat);
      m.rotation.y = this.heading(i);
      this.group.add(m);
    }
  }

  buildRamps() {
    const geo = new THREE.BoxGeometry(this.halfW * 1.2, 0.6, 5);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffca28 });
    for (const r of this.ramps) {
      const i = r.idx;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(this.px[i], this.py[i] + 0.5, this.pz[i]);
      m.rotation.y = this.heading(i);
      m.rotation.x = -0.35;
      this.group.add(m);
    }
  }

  buildDecor() {
    const th = this.def.theme;
    const rng = seededRandom(this.def.seed);
    const high = (this.preset?.scenery ?? (this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.7 : 0.35)) > 0.55;
    const count = Math.floor((high ? 240 : 70) * (this.preset?.scenery || 1));
    const b = this.bounds;
    const pad = 130;
    const clear = this.halfW + this.def.margin + 4;
    const spots = [];
    let tries = 0;
    while (spots.length < count && tries < count * 8) {
      tries++;
      const x = b.minX - pad + rng() * (b.maxX - b.minX + pad * 2);
      const z = b.minZ - pad + rng() * (b.maxZ - b.minZ + pad * 2);
      if (this.distToCenter2(x, z) < clear * clear) continue;
      spots.push([x, z, 0.7 + rng() * 0.8, rng() * Math.PI * 2]);
    }

    const parts = [];
    if (th.deco === 'trees' || th.deco === 'pines') {
      parts.push([new THREE.CylinderGeometry(0.4, 0.55, 2.4, 6).translate(0, 1.2, 0), 0x7b5236]);
      parts.push([new THREE.ConeGeometry(2.4, 5.5, 7).translate(0, 4.6, 0), th.deco === 'pines' ? 0x1b5e20 : 0x2e7d32]);
    } else if (th.deco === 'palms') {
      parts.push([new THREE.CylinderGeometry(0.3, 0.45, 6, 6).translate(0, 3, 0), 0x8d6e63]);
      parts.push([new THREE.ConeGeometry(3.2, 1.4, 6).translate(0, 6.4, 0), 0x2e7d32]);
    } else if (th.deco === 'neon') {
      parts.push([new THREE.BoxGeometry(3, 12, 3).translate(0, 6, 0), 0x2a1848]);
      parts.push([new THREE.BoxGeometry(3.2, 0.6, 3.2).translate(0, 12.2, 0), 0xff00aa]);
    } else {
      parts.push([new THREE.DodecahedronGeometry(2.2, 0).translate(0, 1.2, 0), 0x3b3b3b]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [geo, color] of parts) {
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }), spots.length);
      spots.forEach(([x, z, sc, rot], i) => {
        p.set(x, 0, z);
        q.setFromAxisAngle(up, rot);
        s.set(sc * (th.deco === 'rocks' ? 1.3 : 1), sc, sc);
        m4.compose(p, q, s);
        inst.setMatrixAt(i, m4);
      });
      this.group.add(inst);
    }

    if (high) {
      const r0 = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 260;
      const mat = new THREE.MeshLambertMaterial({ color: th.mountain, flatShading: true });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + rng() * 0.2;
        const r = r0 + rng() * 120;
        const hgt = 90 + rng() * 110;
        const m = new THREE.Mesh(new THREE.ConeGeometry(70 + rng() * 60, hgt, 7), mat);
        m.position.set(b.cx + Math.cos(a) * r, hgt / 2 - 2, b.cz + Math.sin(a) * r);
        this.group.add(m);
      }
    }
  }
}
