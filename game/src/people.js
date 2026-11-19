// Solmar Bay 3D — people.
// One job: low-poly people and how they move. Pedestrians stroll the
// sidewalks and flee from danger; the player walks, runs and (in main.js)
// gets in and out of cars. Limbs swing from hip and shoulder pivots, so a
// walk cycle is just two sines.

import { CONFIG, nearestRoad } from './config.js';
import { range, int, pick } from './random.js';
import { resolveCircle } from './world.js';

const SHIRTS = [0xe05a4e, 0x4e8ae0, 0x4ec27a, 0xe0c24e, 0x9a4ed0, 0xe0e0e0, 0x4e4e55];
const PANTS = [0x2a2a33, 0x3a4a6a, 0x5a4a3a, 0x222226];
const SKINS = [0xe8b98a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

// A low-poly person as ONE merged mesh (one draw call): torso, head, hair,
// arms and legs are vertex-coloured parts. Pedestrians and gangsters use
// this; their walk is a bob and a rock, not a limb swing — at street
// distance the bob reads as walking and costs nothing.
import { partBox, mergeParts, mergedMaterial } from './merge.js';

export function makePersonMesh(shirt, pants, skin) {
  const parts = [
    partBox(0.62, 0.72, 0.34, shirt, 0, 1.08, 0),
    partBox(0.36, 0.36, 0.34, skin, 0, 1.66, 0),
    partBox(0.38, 0.12, 0.36, 0x1a1a1e, 0, 1.86, 0),
    partBox(0.2, 0.72, 0.22, pants, -0.16, 0.37, 0),
    partBox(0.2, 0.72, 0.22, pants, 0.16, 0.37, 0),
    partBox(0.2, 0.6, 0.22, shirt, -0.38, 1.1, 0),
    partBox(0.2, 0.6, 0.22, shirt, 0.38, 1.1, 0),
  ];
  const mesh = new THREE.Mesh(mergeParts(parts), mergedMaterial());
  mesh.castShadow = true;
  mesh.userData.person = true;
  return mesh;
}

// The player alone keeps swinging limbs: the camera is close enough that
// the walk cycle is visible. userData.limbs = { legL, legR, armL, armR }.
export function makePlayerMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.08;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skinMat);
  head.position.y = 1.66;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), hairMat);
  hair.position.y = 1.86;
  group.add(hair);

  const limbs = {};
  for (const [name, x, mat, len] of [
    ['legL', -0.16, pantsMat, 0.72],
    ['legR', 0.16, pantsMat, 0.72],
    ['armL', -0.38, shirtMat, 0.6],
    ['armR', 0.38, shirtMat, 0.6],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, name.startsWith('leg') ? 0.74 : 1.4, 0);
    const part = new THREE.Mesh(new THREE.BoxGeometry(0.2, len, 0.22), mat);
    part.position.y = -len / 2;
    part.castShadow = true;
    pivot.add(part);
    group.add(pivot);
    limbs[name] = pivot;
  }
  group.userData.limbs = limbs;
  return group;
}

// Swing the limbs for a walk cycle; phase advances with distance walked.
export function walkCycle(mesh, phase, amount) {
  const l = mesh.userData.limbs;
  const s = Math.sin(phase) * amount;
  l.legL.rotation.x = s;
  l.legR.rotation.x = -s;
  l.armL.rotation.x = -s * 0.8;
  l.armR.rotation.x = s * 0.8;
}

// City pedestrians: they stroll the sidewalks, turn at corners, flee from
// gunfire and fast cars, and fall when a car hits them.
export class Pedestrians {
  constructor(scene, rng, colliders, bounds) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.bounds = bounds;
    this.walkers = [];
    this.onHit = null; // (ped) => void, set by main.js (wanted heat)
    this.onFlee = null;
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const mesh = makePersonMesh(pick(this.rng, SHIRTS), pick(this.rng, PANTS), pick(this.rng, SKINS));
      const line = int(this.rng, -5, 5) * CONFIG.block;
      const along = range(this.rng, -200, 200);
      const side = this.rng() < 0.5;
      const x = side ? line + 7.5 : along;
      const z = side ? along : line + 7.5;
      const heading = side ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = heading;
      this.scene.add(mesh);
      const walker = {
        mesh, pos: new THREE.Vector3(x, 0, z), heading,
        speed: range(this.rng, 1.1, 2.0), phase: this.rng() * 6,
        state: 'walk', fallT: 0, fadeT: 0, axis: side ? 'z' : 'x',
      };
      mesh.userData.kind = 'walker';
      mesh.userData.ref = walker;
      this.walkers.push(walker);
    }
  }

  // The closest living walker within maxDist of (x, z).
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const w of this.walkers) {
      if (w.state !== 'walk') continue;
      const d = Math.hypot(w.pos.x - x, w.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best ? { walker: best, dist: bestD } : null;
  }

  update(dt, playerPos, playerSpeed, dangerPos) {
    for (const w of this.walkers) {
      if (w.state === 'fallen') {
        w.fallT += dt;
        w.mesh.rotation.x = Math.max(-Math.PI / 2, w.mesh.rotation.x - dt * 4);
        if (w.fallT > 6) {
          // Get up elsewhere: respawn on a sidewalk far from the player.
          const line = int(this.rng, -5, 5) * CONFIG.block;
          const along = range(this.rng, -200, 200);
          w.pos.set(line + 7.5, 0, along);
          w.heading = this.rng() * Math.PI * 2;
          w.state = 'walk';
          w.fallT = 0;
          w.mesh.rotation.x = 0;
          w.mesh.position.copy(w.pos);
        }
        continue;
      }
      // Flee: run away from gunfire or a fast car nearby.
      let speed = w.speed;
      let flee = false;
      if (dangerPos && Math.hypot(w.pos.x - dangerPos.x, w.pos.z - dangerPos.z) < 14) flee = true;
      if (playerPos && playerSpeed > 8 && Math.hypot(w.pos.x - playerPos.x, w.pos.z - playerPos.z) < 10) flee = true;
      if (flee) {
        speed = 4.5;
        const away = Math.atan2(w.pos.x - (dangerPos?.x ?? playerPos.x), w.pos.z - (dangerPos?.z ?? playerPos.z));
        w.heading += (away - w.heading) * Math.min(1, dt * 4);
      } else {
        // Turn at intersections.
        const onX = Math.abs(w.pos.x / CONFIG.block - Math.round(w.pos.x / CONFIG.block)) < 0.1;
        const onZ = Math.abs(w.pos.z / CONFIG.block - Math.round(w.pos.z / CONFIG.block)) < 0.1;
        if (onX && onZ && this.rng() < dt * 0.5) {
          w.heading += pick(this.rng, [-Math.PI / 2, Math.PI / 2]);
          w.pos.x = nearestRoad(w.pos.x);
          w.pos.z = nearestRoad(w.pos.z);
        }
      }
      w.pos.x += Math.sin(w.heading) * speed * dt;
      w.pos.z += Math.cos(w.heading) * speed * dt;
      w.pos.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, w.pos.x));
      w.pos.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, w.pos.z));
      const fixed = resolveCircle(w.pos.x, w.pos.z, 0.5, this.colliders);
      w.pos.x = fixed.x;
      w.pos.z = fixed.z;
      w.phase += speed * dt * 2.4;
      // One merged mesh, so the walk is a bob and a rock, not a limb swing.
      w.mesh.position.set(w.pos.x, Math.abs(Math.sin(w.phase)) * 0.06, w.pos.z);
      w.mesh.rotation.z = Math.sin(w.phase) * 0.03;
      w.mesh.rotation.y = w.heading;
    }
  }

  // A car hit this walker: knock them down and report the crime.
  hitByCar(walker) {
    if (walker.state !== 'walk') return;
    walker.state = 'fallen';
    walker.fallT = 0;
    if (this.onHit) this.onHit(walker);
  }
}

// The player on foot: WASD relative to the camera, Shift to sprint, and a
// walk cycle that follows the speed. Entering a car is main.js's job; this
// class only moves the body and hides/shows it.
export class PlayerController {
  constructor(scene, spawn) {
    this.mesh = makePlayerMesh(0xf0f0f0, 0x2a3a5a, 0xe8b98a);
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.heading = Math.PI; // face the sunset (west) at spawn
    this.speed = 0;
    this.phase = 0;
    this.health = CONFIG.playerHealth;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
  }

  update(dt, input, camYaw, colliders, bounds) {
    let ix = 0;
    let iz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iz += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iz -= 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const target = running ? CONFIG.runSpeed : CONFIG.walkSpeed;
    const len = Math.hypot(ix, iz);
    if (len > 0) {
      ix /= len;
      iz /= len;
      // Camera-relative: forward is where the camera looks, right is the
      // camera's right. (forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw))
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const wx = ix * cos - iz * sin;
      const wz = -ix * sin - iz * cos;
      const wantHeading = Math.atan2(wx, wz);
      let dh = wantHeading - this.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      this.heading += dh * Math.min(1, dt * 10);
      this.speed += (target - this.speed) * Math.min(1, dt * 8);
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 10);
    }
    const fixed = resolveCircle(this.pos.x, this.pos.z, CONFIG.playerRadius, colliders);
    this.pos.x = fixed.x;
    this.pos.z = fixed.z;
    this.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.pos.x));
    this.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.pos.z));
    this.phase += this.speed * dt * 1.6;
    walkCycle(this.mesh, this.phase, Math.min(0.75, this.speed * 0.09));
    this.mesh.position.set(this.pos.x, Math.abs(Math.sin(this.phase)) * 0.05 * Math.min(1, this.speed / 6), this.pos.z);
    this.mesh.rotation.y = this.heading;
  }

  hide() {
    this.mesh.visible = false;
  }

  show() {
    this.mesh.visible = true;
  }
}
