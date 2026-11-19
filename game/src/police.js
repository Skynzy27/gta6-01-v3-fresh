// Solmar Bay 3D — the law.
// One job: the wanted level and the police that answer it. Heat rises with
// crimes and cools when nobody can see you; police cars chase and ram, and
// from three stars a helicopter circles overhead with a visible spotlight
// cone that keeps you lit — and keeps your heat from cooling.

import { CONFIG } from './config.js';
import { range, int, pick } from './random.js';
import { Car, makeCarMesh } from './vehicles.js';
import { partBox, mergeParts, mergedMaterial } from './merge.js';

export class Wanted {
  constructor() {
    this.heat = 0;
    this.stars = 0;
    this.lastCrimeT = -100;
  }

  add(n, now) {
    this.heat = Math.min(CONFIG.heatPerStar * 5, this.heat + n);
    this.lastCrimeT = now;
    this.stars = this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / CONFIG.heatPerStar));
  }

  clear() {
    this.heat = 0;
    this.stars = 0;
  }

  // Cool down only when unseen and quiet for a while.
  update(dt, now, seen) {
    if (this.heat > 0 && !seen && now - this.lastCrimeT > CONFIG.heatDecayDelay) {
      this.heat = Math.max(0, this.heat - CONFIG.heatDecayRate * dt);
      this.stars = this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / CONFIG.heatPerStar));
    }
  }
}

// A helicopter: merged body, tail, fin and glass in one mesh; the rotors
// stay separate so they can spin; a real spotlight and a visible beam cone
// so the searchlight reads on screen, not just on the ground.
function makeHeliMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(mergeParts([
    partBox(2.2, 1.4, 3.4, 0x1a1a22, 0, 0, 0),
    partBox(1.9, 0.8, 1.0, 0x2a4a6a, 0, 0.2, 1.5),
    partBox(0.5, 0.5, 3.6, 0x1a1a22, 0, 0.3, -3.2),
    partBox(0.2, 1.2, 0.8, 0x1a1a22, 0, 0.8, -4.8),
  ]), mergedMaterial());
  body.castShadow = true;
  group.add(body);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111116 }));
  rotor.position.y = 0.9;
  group.add(rotor);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.3), new THREE.MeshStandardMaterial({ color: 0x111116 }));
  tailRotor.position.set(0.3, 0.7, -4.8);
  group.add(tailRotor);
  const coneGeo = new THREE.ConeGeometry(5, 1, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a0, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  group.add(cone);
  const spot = new THREE.SpotLight(0xffe9a0, 250, 140, 0.32, 0.45, 1.2);
  group.add(spot);
  group.add(spot.target);
  group.userData.rotor = rotor;
  group.userData.tailRotor = tailRotor;
  group.userData.cone = cone;
  group.userData.spot = spot;
  return group;
}

export class Police {
  constructor(scene, rng, colliders, bounds) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.bounds = bounds;
    this.cars = [];
    this.heli = null;
    this.heliMesh = null;
    this.bustedT = 0;
    this.flashT = 0;
  }

  spawnCarNear(playerPos) {
    const mesh = makeCarMesh(0xf0f0f0, { police: true });
    const angle = this.rng() * Math.PI * 2;
    const dist = range(this.rng, 55, 90);
    const x = playerPos.x + Math.cos(angle) * dist;
    const z = playerPos.z + Math.sin(angle) * dist;
    const cx = Math.max(this.bounds.minX + 5, Math.min(this.bounds.maxX - 5, x));
    const cz = Math.max(this.bounds.minZ + 5, Math.min(this.bounds.maxZ - 5, z));
    const car = new Car(mesh, cx, cz, Math.atan2(playerPos.x - cx, playerPos.z - cz), 'police');
    this.scene.add(mesh);
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    this.scene.remove(car.mesh);
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
  }

  setHeli(on, playerPos) {
    if (on && !this.heliMesh) {
      this.heliMesh = makeHeliMesh();
      this.heliMesh.position.set(playerPos.x, 12, playerPos.z);
      this.scene.add(this.heliMesh);
      this.heli = { pos: this.heliMesh.position };
    } else if (!on && this.heliMesh) {
      this.scene.remove(this.heliMesh);
      this.heliMesh = null;
      this.heli = null;
    }
  }

  // Returns { busted, seen, nearest } for the game loop.
  update(dt, t, playerPos, playerSpeed, inCar, wantedStars, heading) {
    // Match the fleet to the wanted level.
    const want = Math.min(wantedStars, 5);
    while (this.cars.length < want) this.spawnCarNear(playerPos);
    while (this.cars.length > want) this.removeCar(this.cars[this.cars.length - 1]);
    this.setHeli(wantedStars >= CONFIG.heliAtStars, playerPos);

    let nearest = Infinity;
    let busted = false;
    for (const car of this.cars) {
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      // Steer toward the player, full throttle.
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = THREE.MathUtils.clamp(dh * 1.4, -1, 1);
      const throttle = dist > 5 ? 1 : 0.4;
      car.update(dt, { throttle, steer, brake: false }, this.colliders, this.bounds);
      // Light bar flashes red/blue.
      this.flashT += dt;
      const redOn = Math.sin(this.flashT * 9) > 0;
      if (car.mesh.userData.lightBar) {
        car.mesh.userData.lightBar[0].material.emissiveIntensity = redOn ? 3 : 0.3;
        car.mesh.userData.lightBar[1].material.emissiveIntensity = redOn ? 0.3 : 3;
      }
      // Busted: a cop sits on the player while they cannot get away.
      if (!inCar && dist < 3.5) {
        this.bustedT += dt;
        if (this.bustedT > CONFIG.bustedHold) busted = true;
      } else if (inCar && dist < 4.5 && playerSpeed < 3) {
        this.bustedT += dt;
        if (this.bustedT > CONFIG.bustedCarHold) busted = true;
      } else {
        this.bustedT = Math.max(0, this.bustedT - dt);
      }
    }

    // Helicopter: circle overhead, spotlight locked on the player. It
    // hovers AHEAD of the player, in the direction they face, so the
    // chase camera (which looks forward) actually sees it — a heli
    // parked behind the player is behind the camera.
    let seen = nearest < 60;
    if (this.heliMesh) {
      seen = true;
      const m = this.heliMesh;
      const fwdX = Math.sin(heading || 0);
      const fwdZ = Math.cos(heading || 0);
      const target = new THREE.Vector3(
        playerPos.x + fwdX * 32 + Math.sin(t * 0.4) * 5,
        12 + Math.sin(t * 0.5) * 2,
        playerPos.z + fwdZ * 32 + Math.cos(t * 0.4) * 5,
      );
      // Fast converge: at 1 fps in a headless test the frame delta is
      // clamped, so a slow lerp leaves the heli above the player (and
      // above the frame) for the whole staged shot.
      m.position.lerp(target, Math.min(1, dt * 3));
      m.userData.rotor.rotation.y += dt * 22;
      m.userData.tailRotor.rotation.x += dt * 30;
      m.rotation.y = Math.atan2(playerPos.x - m.position.x, playerPos.z - m.position.z);
      // The beam lands a little ahead of the player, on the road in front
      // of the camera — not under the camera, where its base would fill
      // the frame and wash the shot out.
      const litX = playerPos.x + fwdX * 8;
      const litZ = playerPos.z + fwdZ * 8;
      const spot = m.userData.spot;
      spot.position.set(0, -0.5, 0);
      spot.target.position.set(litX - m.position.x, -m.position.y, litZ - m.position.z);
      // Beam cone from the belly to the lit point on the road ahead.
      const cone = m.userData.cone;
      const top = new THREE.Vector3(0, -0.8, 0);
      const bottom = new THREE.Vector3(litX - m.position.x, -m.position.y + 0.5, litZ - m.position.z);
      const len = top.distanceTo(bottom);
      cone.scale.set(1, len, 1);
      cone.position.copy(top).lerp(bottom, 0.5);
      const upBeam = new THREE.Vector3().subVectors(top, bottom).normalize();
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upBeam);
    }
    return { busted, seen, nearest };
  }

  clear() {
    for (const car of [...this.cars]) this.removeCar(car);
    this.setHeli(false, { x: 0, z: 0 });
    this.bustedT = 0;
  }
}
