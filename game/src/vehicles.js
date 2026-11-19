// Solmar Bay 3D — cars.
// One job: build a low-poly car from boxes, drive it with arcade physics,
// and run the city's traffic. A car is a mesh plus a small state object;
// the game loop owns the pairwise collisions between all cars.

import { CONFIG, nearestRoad } from './config.js';
import { range, int, pick } from './random.js';
import { resolveCircle } from './world.js';
import { partBox, partCylinder, mergeParts, mergedMaterial } from './merge.js';

const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe0a52e, 0x3aa655, 0x8a4fd0, 0xd0d0d0, 0x222226, 0x2eb8c2];

// A low-poly car as ONE merged mesh: body, cabin, wheels and lights are
// vertex-coloured parts of a single geometry (one draw call per car).
// Police cars get a white body, black doors and a red/blue light bar — the
// bar stays two small meshes so it can flash.
export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const paint = opts.police ? 0xf0f0f0 : color;
  const parts = [
    partBox(2.0, 0.75, 4.4, paint, 0, 0.72, 0),
    partBox(1.8, 0.65, 2.2, 0x1a2a3a, 0, 1.35, -0.25),
    partBox(0.4, 0.18, 0.1, 0xfff6c0, -0.65, 0.72, 2.22),
    partBox(0.4, 0.18, 0.1, 0xfff6c0, 0.65, 0.72, 2.22),
    partBox(0.4, 0.18, 0.1, 0x881111, -0.65, 0.72, -2.22),
    partBox(0.4, 0.18, 0.1, 0x881111, 0.65, 0.72, -2.22),
  ];
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    parts.push(partCylinder(0.42, 0.42, 0.32, 12, 0x0c0c0e, x, 0.42, z, 0, Math.PI / 2));
  }
  if (opts.police) {
    parts.push(partBox(2.02, 0.5, 1.6, 0x14141a, 0, 0.75, 0.1));
    parts.push(partBox(1.2, 0.14, 0.4, 0x14141a, 0, 1.78, -0.25));
  }
  const body = new THREE.Mesh(mergeParts(parts), mergedMaterial());
  body.castShadow = true;
  group.add(body);

  if (opts.police) {
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 2.5 }),
    );
    red.position.set(-0.3, 1.82, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.16, 0.36),
      new THREE.MeshStandardMaterial({ color: 0x000055, emissive: 0x2244ff, emissiveIntensity: 2.5 }),
    );
    blue.position.set(0.3, 1.82, -0.25);
    group.add(blue);
    group.userData.lightBar = [red, blue];
  }

  group.userData.body = body;
  return group;
}

// Arcade car: throttle/steer in, position out. No real physics engine —
// speed, heading and a circle-vs-buildings resolve are all it needs.
export class Car {
  constructor(mesh, x, z, heading, kind = 'traffic') {
    this.mesh = mesh;
    this.kind = kind;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steerVis = 0;
    this.alive = true;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // controls: { throttle: -1..1, steer: -1..1, brake: bool }
  update(dt, controls, colliders, bounds) {
    const c = CONFIG;
    if (controls.brake) {
      this.speed -= Math.sign(this.speed) * c.carBrake * dt;
      if (Math.abs(this.speed) < 0.4) this.speed = 0;
    } else if (controls.throttle > 0) {
      this.speed += c.carAccel * controls.throttle * dt;
    } else if (controls.throttle < 0) {
      if (this.speed > 0.6) {
        this.speed -= c.carBrake * dt;
      } else {
        this.speed -= c.carReverse * dt;
      }
    } else {
      this.speed -= Math.sign(this.speed) * 6 * dt;
      if (Math.abs(this.speed) < 0.3) this.speed = 0;
    }
    this.speed = Math.max(-c.carMaxReverse, Math.min(c.carMaxSpeed, this.speed));
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 10);
    this.heading += controls.steer * c.carTurn * steerAuthority * dt * Math.sign(this.speed || 1);
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    // City bounds.
    this.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.pos.x));
    this.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.pos.z));
    // Buildings: slide along them, lose speed on a hard hit.
    const before = { x: this.pos.x, z: this.pos.z };
    const fixed = resolveCircle(this.pos.x, this.pos.z, c.carRadius, colliders);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    const pushed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    if (pushed > 0.02) this.speed *= 0.55;
    // Visuals: the body leans into turns and acceleration. (The wheels are
    // part of the merged body mesh, so they do not spin on their own.)
    this.steerVis += (controls.steer - this.steerVis) * Math.min(1, dt * 8);
    this.mesh.userData.body.rotation.z = -this.steerVis * 0.05 * Math.min(1, Math.abs(this.speed) / 20);
    this.mesh.userData.body.rotation.x = THREE.MathUtils.clamp(-this.speed * 0.0012, -0.05, 0.05);
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
  }

  // Push two cars apart (circle vs circle) and trade a little speed.
  collideWith(other) {
    const dx = other.pos.x - this.pos.x;
    const dz = other.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const min = CONFIG.carRadius * 2;
    if (d > 0.001 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      this.pos.x -= nx * push;
      this.pos.z -= nz * push;
      other.pos.x += nx * push;
      other.pos.z += nz * push;
      const avg = (this.speed + other.speed) / 2;
      this.speed = avg * 0.85;
      other.speed = avg * 0.85;
    }
  }
}

// City traffic: cars that stay on the road grid, turn at intersections and
// brake for the car ahead. Parked cars are the same objects, parked.
export class Traffic {
  constructor(scene, rng, colliders, bounds) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.bounds = bounds;
    this.cars = [];
    this.parked = [];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const color = pick(this.rng, CAR_COLORS);
      const mesh = makeCarMesh(color);
      const alongRoad = this.rng() < 0.5;
      const line = int(this.rng, -5, 5) * CONFIG.block;
      const along = int(this.rng, -5, 5) * CONFIG.block;
      const dir = this.rng() < 0.5 ? 1 : -1;
      const lane = 2.4;
      let x;
      let z;
      let heading;
      if (alongRoad) {
        x = line + lane * dir;
        z = along;
        heading = dir > 0 ? 0 : Math.PI;
      } else {
        x = along;
        z = line + lane * dir;
        heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      const car = new Car(mesh, x, z, heading, 'traffic');
      car.speed = range(this.rng, 7, 12);
      car.route = { axis: alongRoad ? 'z' : 'x', dir };
      this.scene.add(mesh);
      this.cars.push(car);
    }
    // Parked cars along the roads, free to steal.
    for (let i = 0; i < 10; i++) {
      const color = pick(this.rng, CAR_COLORS);
      const mesh = makeCarMesh(color);
      const line = int(this.rng, -5, 5) * CONFIG.block;
      const along = int(this.rng, -5, 5) * CONFIG.block + range(this.rng, -8, 8);
      const side = this.rng() < 0.5;
      const x = side ? line + 4.2 : along;
      const z = side ? along : line + 4.2;
      const heading = side ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const car = new Car(mesh, x, z, heading, 'parked');
      this.scene.add(mesh);
      this.parked.push(car);
    }
  }

  // The closest car of any kind within maxDist of (x, z).
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of [...this.cars, ...this.parked]) {
      if (!car.alive) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best ? { car: best, dist: bestD } : null;
  }

  // Remove a stolen parked car from the parked list (it becomes the player's).
  takeParked(car) {
    const i = this.parked.indexOf(car);
    if (i >= 0) this.parked.splice(i, 1);
  }

  update(dt, playerCar) {
    for (const car of this.cars) {
      if (!car.alive) continue;
      // Brake for the car ahead on the same road.
      const f = car.forward();
      let ahead = null;
      let aheadD = 12;
      const all = playerCar ? [...this.cars, playerCar] : this.cars;
      for (const other of all) {
        if (other === car || !other.alive) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < aheadD) {
          const dot = (dx * f.x + dz * f.z) / (dist || 1);
          if (dot > 0.86) {
            aheadD = dist;
            ahead = other;
          }
        }
      }
      const throttle = ahead ? 0 : 1;
      const controls = { throttle, steer: 0, brake: !!ahead };
      // Turn at intersections.
      const onX = Math.abs(car.pos.x / CONFIG.block - Math.round(car.pos.x / CONFIG.block)) < 0.12;
      const onZ = Math.abs(car.pos.z / CONFIG.block - Math.round(car.pos.z / CONFIG.block)) < 0.12;
      if (onX && onZ && this.rng() < dt * 0.9) {
        const turn = pick(this.rng, [-1, 0, 0, 1]);
        if (turn !== 0) {
          car.heading += turn * Math.PI / 2;
          car.pos.x = nearestRoad(car.pos.x);
          car.pos.z = nearestRoad(car.pos.z);
        }
      }
      car.update(dt, controls, this.colliders, this.bounds);
      // Too far from the action: respawn on a road near the player.
      const px = playerCar ? playerCar.pos.x : 0;
      const pz = playerCar ? playerCar.pos.z : 0;
      if (Math.hypot(car.pos.x - px, car.pos.z - pz) > 320) {
        const line = int(this.rng, -5, 5) * CONFIG.block;
        const along = int(this.rng, -5, 5) * CONFIG.block;
        car.pos.set(line + 2.4, 0, along);
        car.heading = 0;
        car.speed = range(this.rng, 7, 12);
      }
    }
    // Traffic cars nudge each other apart.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        if (this.cars[i].alive && this.cars[j].alive) this.cars[i].collideWith(this.cars[j]);
      }
    }
  }
}
