import * as THREE from 'three';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class ChaseCam {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.h = 0;
    this.init = false;
  }

  reset() {
    this.init = false;
  }

  follow(k, dt) {
    if (!k) return;
    if (!this.init) this.h = k.h;
    this.h += wrapAngle(k.h - this.h) * (1 - Math.exp(-5 * dt));
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    this.desired.set(k.x - fx * 6.8, k.y + 2.9, k.z - fz * 6.8);
    if (!this.init) {
      this.pos.copy(this.desired);
      this.init = true;
    } else {
      this.pos.lerp(this.desired, 1 - Math.exp(-10 * dt));
    }
    this.look.set(k.x + fx * 4, k.y + 1.2, k.z + fz * 4);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    const fov = 70 + (k.boostOn ? 10 : 0);
    if (Math.abs(this.cam.fov - fov) > 0.05) {
      this.cam.fov += (fov - this.cam.fov) * (1 - Math.exp(-6 * dt));
      this.cam.updateProjectionMatrix();
    }
  }

  orbit(track, t) {
    const b = track.bounds;
    const r = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.55;
    const a = t * 0.08;
    this.cam.position.set(b.cx + Math.cos(a) * r, r * 0.4, b.cz + Math.sin(a) * r);
    this.cam.lookAt(b.cx, 0, b.cz);
    if (this.cam.fov !== 60) {
      this.cam.fov = 60;
      this.cam.updateProjectionMatrix();
    }
    this.init = false;
  }
}
