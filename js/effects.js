import * as THREE from 'three';

function makePool(geo, mat, n, scene) {
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return {
    mesh,
    life: new Float32Array(n),
    max: n,
    m: new THREE.Matrix4(),
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    s: new THREE.Vector3(),
  };
}

export class Effects {
  constructor(scene, scale = 1) {
    this.scene = scene;
    this.scale = scale;
    const n = Math.max(20, Math.floor(120 * scale));
    this.smoke = makePool(
      new THREE.SphereGeometry(0.35, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0.45, depthWrite: false }),
      n, scene,
    );
    this.sparks = makePool(
      new THREE.SphereGeometry(0.18, 5, 4),
      new THREE.MeshBasicMaterial({ color: 0x2f9bff }),
      n, scene,
    );
    this.boost = makePool(
      new THREE.ConeGeometry(0.2, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.85 }),
      Math.floor(n * 0.5), scene,
    );
    this.burst = makePool(
      new THREE.SphereGeometry(0.25, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      Math.floor(n * 0.6), scene,
    );
    this.tmp = { vx: new Float32Array(n * 4), vy: new Float32Array(n * 4), vz: new Float32Array(n * 4) };
  }

  spawn(pool, x, y, z, life, sx = 1, sy = 1, sz = 1) {
    if (pool.mesh.count >= pool.max) return -1;
    const i = pool.mesh.count++;
    pool.life[i] = life;
    pool.p.set(x, y, z);
    pool.q.identity();
    pool.s.set(sx, sy, sz);
    pool.m.compose(pool.p, pool.q, pool.s);
    pool.mesh.setMatrixAt(i, pool.m);
    pool.mesh.instanceMatrix.needsUpdate = true;
    return i;
  }

  drift(k) {
    if (!k.drifting || this.scale < 0.2) return;
    const side = k.driftDir;
    const bx = k.x - Math.sin(k.h) * 1.2 + Math.cos(k.h) * side * 0.9;
    const bz = k.z - Math.cos(k.h) * 1.2 - Math.sin(k.h) * side * 0.9;
    this.spawn(this.smoke, bx, k.y + 0.2, bz, 0.5 + Math.random() * 0.3, 0.8, 0.8, 0.8);
    const color = k.driftLevel === 2 ? 0xff8a00 : k.driftLevel === 1 ? 0x2f9bff : 0xdddddd;
    this.sparks.mesh.material.color.setHex(color);
    this.spawn(this.sparks, bx, k.y + 0.15, bz, 0.25, 0.6, 0.6, 0.6);
  }

  boostFx(k) {
    if (!k.boostOn) return;
    const bx = k.x - Math.sin(k.h) * 1.8;
    const bz = k.z - Math.cos(k.h) * 1.8;
    this.spawn(this.boost, bx, k.y + 0.5, bz, 0.2, 0.7, 0.7, 0.7);
  }

  pickup(x, y, z) {
    for (let i = 0; i < 8 * this.scale; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(this.burst, x + Math.cos(a) * 0.4, y + Math.random(), z + Math.sin(a) * 0.4, 0.4, 0.5, 0.5, 0.5);
    }
  }

  hit(x, y, z) {
    for (let i = 0; i < 12 * this.scale; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(this.burst, x + Math.cos(a), y + 0.5 + Math.random(), z + Math.sin(a), 0.55, 0.7, 0.7, 0.7);
    }
  }

  update(dt) {
    for (const pool of [this.smoke, this.sparks, this.boost, this.burst]) {
      let w = 0;
      for (let i = 0; i < pool.mesh.count; i++) {
        pool.life[i] -= dt;
        if (pool.life[i] <= 0) continue;
        pool.mesh.getMatrixAt(i, pool.m);
        pool.m.decompose(pool.p, pool.q, pool.s);
        pool.p.y += dt * 0.8;
        pool.s.multiplyScalar(1 + dt * 0.6);
        pool.m.compose(pool.p, pool.q, pool.s);
        if (w !== i) {
          pool.mesh.setMatrixAt(w, pool.m);
          pool.life[w] = pool.life[i];
        } else {
          pool.mesh.setMatrixAt(i, pool.m);
        }
        w++;
      }
      if (w !== pool.mesh.count) {
        pool.mesh.count = w;
        pool.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
