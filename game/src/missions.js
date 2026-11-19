// Solmar Bay 3D — story missions.
// One job: the seven jobs Mara gives Vic, each a chain of small objectives
// with a waypoint beacon, a timer where the job needs one, and a payout.
// The manager owns the beacon, the gangsters for the shootout jobs, and the
// save slot; the game loop feeds it the player's state each frame.

import { makePersonMesh } from './people.js';
import { range } from './random.js';

export const MISSIONS = [
  {
    id: 'first-wheels', title: 'First Wheels', reward: 150,
    brief: 'Mara needs wheels. Steal a car and bring it to her garage.',
    steps: [
      { type: 'in-car', text: 'Steal a car (E next to one)' },
      { type: 'goto', x: 40, z: 40, radius: 10, text: 'Drive to Mara\'s garage' },
    ],
  },
  {
    id: 'the-pickup', title: 'The Pickup', reward: 300,
    brief: 'A package is waiting at the docks. Collect it and bring it back.',
    steps: [
      { type: 'collect', x: 200, z: -120, radius: 6, text: 'Collect the package at the docks' },
      { type: 'deliver', x: 40, z: 40, radius: 10, text: 'Deliver the package to the garage' },
    ],
  },
  {
    id: 'getaway', title: 'Getaway', reward: 450,
    brief: 'Pick Mara up — and shake the cops that follow her.',
    steps: [
      { type: 'goto', x: -80, z: -40, radius: 8, text: 'Pick up Mara' },
      { type: 'wanted', stars: 2, text: 'The cops are onto you — lose them' },
      { type: 'lose', text: 'Lose the wanted level' },
    ],
  },
  {
    id: 'turbulence', title: 'Turbulence', reward: 600,
    brief: 'Rivals moved onto the east side. Clear them out.',
    steps: [
      { type: 'goto', x: 160, z: 80, radius: 14, text: 'Reach the rival turf' },
      { type: 'shoot', count: 4, x: 160, z: 80, text: 'Take out 4 rivals (click to shoot)' },
    ],
  },
  {
    id: 'night-run', title: 'Night Run', reward: 800,
    brief: 'A buyer is waiting across town. Do not be late.',
    steps: [
      { type: 'collect', x: -120, z: -120, radius: 6, text: 'Collect the goods' },
      { type: 'timed-goto', x: 160, z: -160, radius: 10, time: 75, text: 'Deliver across town — 75 seconds' },
    ],
  },
  {
    id: 'heat', title: 'Heat', reward: 1000,
    brief: 'The whole bay is looking for you. Stay free for a minute.',
    steps: [
      { type: 'survive', stars: 3, time: 60, text: 'Survive 3 stars for 60 seconds' },
    ],
  },
  {
    id: 'big-score', title: 'The Big Score', reward: 2500,
    brief: 'The bank. The vault. The whole bay behind you. Go.',
    steps: [
      { type: 'goto', x: 0, z: 0, radius: 12, text: 'Reach the bank downtown' },
      { type: 'collect', x: 0, z: 0, radius: 8, text: 'Grab the vault cash' },
      { type: 'escape', x: -160, z: 120, radius: 12, stars: 4, text: 'Escape to the safehouse with 4 stars' },
    ],
  },
];

function makeBeacon() {
  const group = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd24e, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }),
  );
  cyl.position.y = 15;
  group.add(cyl);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshStandardMaterial({ color: 0xffd24e, emissive: 0xffb52e, emissiveIntensity: 1.6, roughness: 0.3 }),
  );
  gem.position.y = 4;
  group.add(gem);
  group.userData.gem = gem;
  return group;
}

// Rival gangsters for the shootout jobs: they stand their ground and fire
// back, and fall when the player lands three pistol hits.
class Gangsters {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.members = [];
    this.kills = 0;
    this.shootT = 0;
    this.onShootAtPlayer = null; // (damage) => void
  }

  spawn(x, z, count) {
    this.clear();
    for (let i = 0; i < count; i++) {
      const mesh = makePersonMesh(0x222226, 0x222226, 0xc98a5a);
      const px = x + range(this.rng, -10, 10);
      const pz = z + range(this.rng, -10, 10);
      mesh.position.set(px, 0, pz);
      this.scene.add(mesh);
      const member = { mesh, pos: new THREE.Vector3(px, 0, pz), health: 100, alive: true, fallT: 0 };
      mesh.userData.kind = 'gangster';
      mesh.userData.ref = member;
      this.members.push(member);
    }
  }

  clear() {
    for (const m of this.members) this.scene.remove(m.mesh);
    this.members = [];
    this.kills = 0;
  }

  // Shootable targets for the player's raycast.
  targets() {
    return this.members.filter((m) => m.alive).map((m) => ({ mesh: m.mesh, ref: m }));
  }

  hit(ref, damage) {
    if (!ref.alive) return false;
    ref.health -= damage;
    if (ref.health <= 0) {
      ref.alive = false;
      ref.fallT = 0;
      this.kills += 1;
      return true;
    }
    return false;
  }

  update(dt, playerPos) {
    this.shootT += dt;
    for (const m of this.members) {
      if (!m.alive) {
        m.fallT += dt;
        m.mesh.rotation.x = Math.max(-Math.PI / 2, m.mesh.rotation.x - dt * 5);
        continue;
      }
      const d = Math.hypot(m.pos.x - playerPos.x, m.pos.z - playerPos.z);
      m.mesh.rotation.y = Math.atan2(playerPos.x - m.pos.x, playerPos.z - m.pos.z);
      if (d < 48 && this.shootT > 1.3) {
        // A hit lands about one time in four at range.
        if (this.rng() < 0.3 && this.onShootAtPlayer) this.onShootAtPlayer(6);
      }
    }
    if (this.shootT > 1.3) this.shootT = 0;
  }
}

export class MissionManager {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.index = -1; // no mission yet
    this.step = 0;
    this.beacon = makeBeacon();
    this.beacon.visible = false;
    scene.add(this.beacon);
    this.gangsters = new Gangsters(scene, rng);
    this.timer = 0;
    this.surviveT = 0;
    this.active = false;
    this.doneIds = [];
    this.onObjective = null; // (text) => void, HUD
    this.onComplete = null; // (mission) => void, reward + save
    this.onMessage = null; // (text) => void, toast
  }

  get current() {
    return this.index >= 0 ? MISSIONS[this.index] : null;
  }

  get currentStep() {
    const m = this.current;
    return m ? m.steps[this.step] : null;
  }

  start(index) {
    this.index = index;
    this.step = 0;
    this.active = true;
    this.timer = 0;
    this.surviveT = 0;
    this.enterStep();
  }

  enterStep() {
    const step = this.currentStep;
    if (!step) return;
    const hasPoint = step.x !== undefined;
    this.beacon.visible = hasPoint;
    if (hasPoint) this.beacon.position.set(step.x, 0, step.z);
    if (step.type === 'timed-goto') this.timer = step.time;
    if (step.type === 'survive') this.surviveT = 0;
    if (step.type === 'shoot') this.gangsters.spawn(step.x, step.z, step.count + 1);
    if (this.onObjective) this.onObjective(`${this.current.title} — ${step.text}`);
  }

  nextStep(ctx) {
    this.step += 1;
    const m = this.current;
    if (this.step >= m.steps.length) {
      this.complete(ctx);
      return;
    }
    this.enterStep();
  }

  complete(ctx) {
    const m = this.current;
    this.active = false;
    this.beacon.visible = false;
    this.gangsters.clear();
    this.doneIds.push(m.id);
    if (this.onComplete) this.onComplete(m);
    // Next job unlocks.
    const next = this.index + 1;
    if (next < MISSIONS.length) {
      this.start(next);
      if (this.onMessage) this.onMessage(`Job complete: ${m.title} — next: ${MISSIONS[next].title}`);
    } else if (this.onMessage) {
      this.onMessage('All jobs done — Solmar Bay is yours, Vic.');
    }
  }

  failStep(ctx, reason) {
    if (this.onMessage) this.onMessage(reason);
    this.timer = 0;
    this.surviveT = 0;
    this.enterStep(); // retry the same step
  }

  // ctx: { playerPos, inCar, wantedStars, addHeat, now }
  update(dt, ctx) {
    if (!this.active) return;
    const step = this.currentStep;
    if (!step) return;
    const m = this.current;
    this.beacon.userData.gem.rotation.y += dt * 2;
    this.beacon.userData.gem.position.y = 4 + Math.sin(ctx.now * 2) * 0.5;
    const d = step.x !== undefined
      ? Math.hypot(ctx.playerPos.x - step.x, ctx.playerPos.z - step.z)
      : Infinity;

    switch (step.type) {
      case 'in-car':
        if (ctx.inCar) this.nextStep(ctx);
        break;
      case 'goto':
      case 'collect':
      case 'deliver':
        if (d < step.radius) {
          if (step.type === 'collect' || step.type === 'deliver') {
            if (ctx.onPickup) ctx.onPickup();
          }
          this.nextStep(ctx);
        }
        break;
      case 'timed-goto':
        this.timer -= dt;
        if (this.onObjective) {
          this.onObjective(`${m.title} — ${step.text} (${Math.max(0, Math.ceil(this.timer))}s)`);
        }
        if (d < step.radius) this.nextStep(ctx);
        else if (this.timer <= 0) this.failStep(ctx, 'Too slow — try the run again.');
        break;
      case 'wanted':
        if (ctx.wantedStars >= step.stars) this.nextStep(ctx);
        break;
      case 'lose':
        if (ctx.wantedStars === 0) this.nextStep(ctx);
        break;
      case 'shoot':
        if (this.gangsters.kills >= step.count) this.nextStep(ctx);
        break;
      case 'survive': {
        if (ctx.wantedStars >= step.stars) {
          this.surviveT += dt;
          if (this.onObjective) {
            this.onObjective(`${m.title} — ${step.text} (${Math.ceil(step.time - this.surviveT)}s left)`);
          }
          if (this.surviveT >= step.time) this.nextStep(ctx);
        } else {
          this.surviveT = Math.max(0, this.surviveT - dt * 2);
        }
        break;
      }
      case 'escape':
        if (d < step.radius && ctx.wantedStars >= step.stars) this.nextStep(ctx);
        break;
      default:
        break;
    }
    this.gangsters.update(dt, ctx.playerPos);
  }

  waypoint() {
    const step = this.currentStep;
    if (!step || step.x === undefined) return null;
    return { x: step.x, z: step.z };
  }
}
