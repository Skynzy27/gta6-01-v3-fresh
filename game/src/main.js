// Solmar Bay 3D — the game itself.
// One job: wire every system together and run the loop. This file owns the
// renderer, the camera, the player/car state, shooting, the save slot and
// the staged ?shot= scenes the screenshots are taken from. The systems in
// src/ do the work; this file decides when each one runs.

import { CONFIG } from './config.js';
import { mulberry32 } from './random.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { buildWorld } from './world.js';
import { Car, Traffic, makeCarMesh } from './vehicles.js';
import { Pedestrians, PlayerController } from './people.js';
import { Wanted, Police } from './police.js';
import { MissionManager, MISSIONS } from './missions.js';
import { Hud } from './hud.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || CONFIG.seed);
const shot = params.get('shot') || '';
// ?quality=low turns off antialiasing and shadows for slow machines.
const lowQuality = params.get('quality') === 'low';
const rng = mulberry32(seed);

// --- Renderer, scene, camera. ---
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowQuality });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = !lowQuality;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Systems. ---
const input = new Input();
input.attach(canvas);
const sound = new SoundBank();
const world = buildWorld(scene, rng);
const traffic = new Traffic(scene, rng, world.colliders, world.bounds);
const peds = new Pedestrians(scene, rng, world.colliders, world.bounds);
const wanted = new Wanted();
const police = new Police(scene, rng, world.colliders, world.bounds);
const missions = new MissionManager(scene, rng);
const hud = new Hud();

traffic.spawn(14);
peds.spawn(24);

const player = new PlayerController(scene, world.playerSpawn);
let playerCar = null; // the Car the player is driving, or null on foot
const ownedCars = new Set(); // cars the player has stolen before (no heat to re-enter)
let cash = 0;
let ammo = CONFIG.pistolAmmo;
let reloading = false;
let reloadT = 0;
let lastDamageT = -100;
let mode = 'menu'; // menu | playing | paused | over
let muted = false;

// --- Save slot. ---
function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveGame() {
  try {
    localStorage.setItem(CONFIG.saveKey, JSON.stringify({
      cash, mission: missions.index, done: missions.doneIds,
    }));
  } catch (e) { /* private mode: progress just does not persist */ }
}
const save = loadSave();
if (save) {
  cash = save.cash || 0;
  missions.doneIds = save.done || [];
}

// --- Camera (chase cam with mouse orbit). ---
let camYaw = Math.PI / 2; // start looking west, at the sunset
let camPitch = 0.3;
let camDist = 11;
let lastDragT = -100;

function updateCamera(dt, t, target) {
  const mouse = input.consumeMouse();
  if (mouse.dx || mouse.dy) {
    camYaw -= mouse.dx * 0.005;
    camPitch = THREE.MathUtils.clamp(camPitch + mouse.dy * 0.003, 0.08, 1.05);
    lastDragT = t;
  }
  const wheel = input.consumeWheel();
  if (wheel) camDist = THREE.MathUtils.clamp(camDist * (1 + wheel * 0.09), 4, 18);
  // In a car, the camera eases back behind the car unless the player is
  // actively orbiting it.
  if (playerCar && t - lastDragT > 1.2) {
    const want = playerCar.heading + Math.PI;
    let dh = want - camYaw;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    camYaw += dh * Math.min(1, dt * 1.6);
  }
  const wantDist = playerCar ? 11 : 7;
  camDist += (wantDist - camDist) * Math.min(1, dt * 2);
  const cp = Math.cos(camPitch);
  const cx = target.x + Math.sin(camYaw) * cp * camDist;
  const cy = target.y + Math.sin(camPitch) * camDist;
  const cz = target.z + Math.cos(camYaw) * cp * camDist;
  camera.position.set(cx, Math.max(cy, 1.4), cz);
  camera.lookAt(target.x, target.y + 0.4, target.z);
}

// --- Wanted crimes. ---
function commitCrime(heat, now) {
  wanted.add(heat, now);
}

// --- Entering and leaving cars. ---
function nearestStealable() {
  const pos = player.pos;
  let best = null;
  let bestD = 4.5;
  const lists = [traffic.cars, traffic.parked, police.cars];
  for (const list of lists) {
    for (const car of list) {
      if (!car.alive) continue;
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
  }
  return best;
}

function enterCar(car, now) {
  // Take it out of whatever fleet owned it.
  let i = traffic.cars.indexOf(car);
  if (i >= 0) traffic.cars.splice(i, 1);
  traffic.takeParked(car);
  i = police.cars.indexOf(car);
  if (i >= 0) police.cars.splice(i, 1);
  if (!ownedCars.has(car)) {
    ownedCars.add(car);
    commitCrime(CONFIG.heatSteal, now);
    hud.toast('Car stolen — the cops noticed');
  }
  playerCar = car;
  car.kind = 'player';
  player.hide();
  sound.ensure();
}

function exitCar(now) {
  if (!playerCar) return;
  const f = playerCar.forward();
  player.pos.set(playerCar.pos.x - f.x * 3, 0, playerCar.pos.z - f.z * 3);
  player.heading = playerCar.heading;
  player.show();
  playerCar.speed = 0;
  playerCar = null;
}

// --- Shooting (on foot, left click). ---
const raycaster = new THREE.Raycaster();
let muzzleLight = null;
let muzzleT = 0;
let tracer = null;

function shoot(now) {
  if (ammo <= 0 || reloading) return;
  ammo -= 1;
  sound.ensure();
  sound.shot();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  raycaster.far = CONFIG.pistolRange;
  const targets = [];
  for (const t of missions.gangsters.targets()) targets.push(t.mesh);
  for (const w of peds.walkers) if (w.state === 'walk') targets.push(w.mesh);
  const hits = raycaster.intersectObjects(targets, true);
  let end = null;
  let hitSomething = false;
  if (hits.length > 0) {
    const hit = hits[0];
    end = hit.point.clone();
    // The hit mesh is a merged person; its userData names the target.
    const kind = hit.object.userData.kind;
    const ref = hit.object.userData.ref;
    if (kind === 'gangster' && ref) {
      hitSomething = true;
      const killed = missions.gangsters.hit(ref, CONFIG.pistolDamage);
      if (killed) hud.toast('Rival down');
    } else if (kind === 'walker' && ref) {
      hitSomething = true;
      peds.hitByCar(ref);
      commitCrime(CONFIG.heatShot, now);
    }
  }
  if (!end) end = raycaster.ray.at(CONFIG.pistolRange, new THREE.Vector3());
  // Muzzle flash + tracer line, gone in a blink.
  if (!muzzleLight) {
    muzzleLight = new THREE.PointLight(0xffc27a, 0, 18);
    scene.add(muzzleLight);
  }
  muzzleLight.position.copy(player.pos).add(new THREE.Vector3(0, 1.5, 0));
  muzzleLight.intensity = 60;
  muzzleT = 0.06;
  if (!tracer) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    scene.add(tracer);
  }
  const start = player.pos.clone().add(new THREE.Vector3(0, 1.45, 0));
  tracer.geometry.setFromPoints([start, end]);
  tracer.material.opacity = 0.9;
  // Gunfire draws attention when the law is close.
  const nearCop = police.cars.some((c) => Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < 60);
  if (hitSomething || nearCop) commitCrime(CONFIG.heatShot, now);
}

// --- Damage, busted, wasted. ---
function damagePlayer(amount, now) {
  player.health -= amount;
  lastDamageT = now;
  if (player.health <= 0) endGame('wasted');
}

function endGame(kind) {
  mode = 'over';
  sound.busted();
  const lost = Math.floor(cash * (kind === 'busted' ? 0.15 : 0.1));
  cash = Math.max(0, cash - lost);
  saveGame();
  police.clear();
  wanted.clear();
  hud.showEnd(
    kind,
    kind === 'busted'
      ? `The Solmar Bay PD caught you. Bail cost $${lost.toLocaleString('en-US')}.`
      : `You woke up at St. Marina hospital, $${lost.toLocaleString('en-US')} lighter.`,
  );
}

function respawn() {
  player.health = CONFIG.playerHealth;
  player.pos.set(world.playerSpawn.x, 0, world.playerSpawn.z);
  player.heading = Math.PI;
  player.show();
  if (playerCar) {
    playerCar.speed = 0;
    playerCar = null;
  }
  ammo = CONFIG.pistolAmmo;
  hud.hideEnd();
  mode = 'playing';
  hud.toast('Back on the streets');
}

// --- Missions wiring. ---
missions.onObjective = (text) => hud.setObjective(text);
missions.onComplete = (m) => {
  cash += m.reward;
  hud.toast(`Job complete: ${m.title} — +$${m.reward}`);
  sound.missionDone();
  saveGame();
};
missions.onMessage = (text) => hud.toast(text);
missions.gangsters.onShootAtPlayer = (dmg) => damagePlayer(dmg, clockT);
peds.onHit = () => commitCrime(CONFIG.heatHitPed, clockT);

function startMission(index) {
  missions.start(index);
  hud.toast(`${MISSIONS[index].title} — ${MISSIONS[index].brief}`);
}

// --- Game start / pause. ---
function startGame(fresh) {
  if (fresh) {
    cash = 0;
    missions.doneIds = [];
    missions.index = -1;
    try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
  }
  sound.ensure();
  sound.click();
  hud.hideMenu();
  hud.hideEnd();
  mode = 'playing';
  const next = missions.doneIds.length;
  if (next < MISSIONS.length) startMission(next);
  else hud.setObjective('All jobs done — Solmar Bay is yours.');
}

hud.onPlay = () => startGame(true);
hud.onContinue = () => startGame(false);
hud.onResume = () => {
  mode = 'playing';
  hud.showPause(false);
  sound.click();
};
hud.onRespawn = () => respawn();

// --- Staged scenes for the screenshots (?shot=...). ---
function stageShot() {
  if (!shot) return;
  if (shot === 'start') return; // menu over the sunset city: the cover
  startGame(false);
  if (shot === 'chase') {
    const car = new Car(makeCarMesh(0xc23b2e), 0, 40, -Math.PI / 2, 'player');
    scene.add(car.mesh);
    ownedCars.add(car);
    playerCar = car;
    player.hide();
    wanted.add(CONFIG.heatPerStar * 3, 0);
    hud.setObjective('Getaway — lose the cops');
  } else if (shot === 'drive') {
    const car = new Car(makeCarMesh(0x2e6fc2), -40, 0, -Math.PI / 2, 'player');
    scene.add(car.mesh);
    ownedCars.add(car);
    playerCar = car;
    player.hide();
    hud.setObjective('Solmar Bay — cruise the avenue');
  } else if (shot === 'mission') {
    player.pos.set(155, 0, 75);
    player.heading = Math.PI * 0.75;
    wanted.add(CONFIG.heatPerStar, 0);
    startMission(3); // Turbulence: the rival turf shootout
    hud.setObjective('Turbulence — reach the rival turf');
  }
  camYaw = Math.PI / 2;
}

// --- Main loop. ---
const clock = new THREE.Clock();
let clockT = 0;
let frames = 0;
let autosaveT = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  clockT += dt;
  frames += 1;

  // World always breathes (ocean, beacons), even on the menu.
  world.update(dt, clockT);

  if (mode === 'menu') {
    // Slow establishing orbit for the start screen.
    camYaw += dt * 0.045;
    camPitch = 0.32;
    camDist = 150;
    const target = new THREE.Vector3(0, 18, 0);
    const cp = Math.cos(camPitch);
    camera.position.set(
      target.x + Math.sin(camYaw) * cp * camDist,
      target.y + Math.sin(camPitch) * camDist,
      target.z + Math.cos(camYaw) * cp * camDist,
    );
    camera.lookAt(target);
    // Keep the sun in frame while orbiting.
    world.sunLight.position.set(-220, 26, 90);
    world.sunLight.target.position.set(0, 0, 0);
  }

  if (mode === 'playing') {
    // Pause / mute.
    if (input.isDown('KeyP') || input.isDown('Escape')) {
      mode = 'paused';
      hud.showPause(true);
      input.keys.clear();
    }
    if (input.isDown('KeyM')) {
      muted = !muted;
      sound.setMuted(muted);
      input.keys.delete('KeyM');
      hud.toast(muted ? 'Sound off' : 'Sound on');
    }
    // Next job.
    if (input.isDown('KeyN') && !missions.active) {
      input.keys.delete('KeyN');
      const next = missions.doneIds.length;
      if (next < MISSIONS.length) startMission(next);
    }
    // Reload.
    if (input.isDown('KeyR') && !reloading && ammo < CONFIG.pistolAmmo) {
      reloading = true;
      reloadT = 0.8;
    }
    if (reloading) {
      reloadT -= dt;
      if (reloadT <= 0) {
        reloading = false;
        ammo = CONFIG.pistolAmmo;
      }
    }

    const playerPos = playerCar ? playerCar.pos : player.pos;
    const playerSpeed = playerCar ? Math.abs(playerCar.speed) : player.speed;

    // Enter / exit a car.
    if (input.isDown('KeyE')) {
      input.keys.delete('KeyE');
      if (playerCar) exitCar(clockT);
      else {
        const near = nearestStealable();
        if (near) enterCar(near, clockT);
      }
    }

    if (playerCar) {
      const throttle = (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0)
        - (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
      const steer = (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0)
        - (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
      const brake = input.isDown('Space');
      playerCar.update(dt, { throttle, steer, brake }, world.colliders, world.bounds);
      // Running over a pedestrian is a crime.
      for (const w of peds.walkers) {
        if (w.state !== 'walk') continue;
        const d = Math.hypot(w.pos.x - playerCar.pos.x, w.pos.z - playerCar.pos.z);
        if (d < 2.2 && Math.abs(playerCar.speed) > 4) {
          peds.hitByCar(w);
          playerCar.speed *= 0.7;
        }
      }
      // Police and traffic bump into the player's car.
      for (const car of [...traffic.cars, ...police.cars]) {
        if (car.alive) playerCar.collideWith(car);
      }
    } else {
      player.update(dt, input, camYaw, world.colliders, world.bounds);
      if (input.consumeClick()) shoot(clockT);
    }

    traffic.update(dt, playerCar);
    // The danger point pedestrians flee from: the last gunshot, or the player.
    const danger = null;
    peds.update(dt, playerPos, playerSpeed, danger);

    // Wanted + police.
    const heading = playerCar ? playerCar.heading : player.heading;
    const pol = police.update(dt, clockT, playerPos, playerSpeed, !!playerCar, wanted.stars, heading);
    wanted.update(dt, clockT, pol.seen);
    if (pol.busted) endGame('busted');

    // Missions: heat the jobs that need heat.
    const step = missions.currentStep;
    if (missions.active && step) {
      if (step.type === 'wanted' && wanted.stars < step.stars) wanted.add(8 * dt, clockT);
      if (step.type === 'escape' && wanted.stars < step.stars) wanted.add(10 * dt, clockT);
      if (step.type === 'survive' && wanted.stars < step.stars) wanted.add(20 * dt, clockT);
    }
    missions.update(dt, {
      playerPos, inCar: !!playerCar, wantedStars: wanted.stars,
      addHeat: (n) => wanted.add(n, clockT), now: clockT,
      onPickup: () => sound.pickup(),
    });

    // Health slowly returns when out of trouble.
    if (clockT - lastDamageT > 5 && player.health < CONFIG.playerHealth) {
      player.health = Math.min(CONFIG.playerHealth, player.health + 3 * dt);
    }

    // Camera follows the player or the car; the sun light follows too.
    const target = playerCar
      ? new THREE.Vector3(playerCar.pos.x, 2, playerCar.pos.z)
      : new THREE.Vector3(player.pos.x, 1.6, player.pos.z);
    updateCamera(dt, clockT, target);
    world.sunLight.position.set(target.x - 210, 26, target.z + 90);
    world.sunLight.target.position.set(target.x, 0, target.z);

    // HUD.
    hud.setStars(wanted.stars);
    hud.setCash(cash);
    hud.setHealth(player.health);
    hud.setSpeed(playerCar ? Math.abs(playerCar.speed) * 3.6 : null);
    hud.setAmmo(playerCar ? null : (reloading ? 0 : ammo));
    hud.setCrosshair(!playerCar);
    hud.updateToast(dt);
    const near = !playerCar ? nearestStealable() : null;
    hud.setHint(
      playerCar ? 'E — get out · Space — handbrake'
        : near ? 'E — steal this car' : 'WASD move · E near a car to get in',
    );
    hud.drawMinimap({
      half: CONFIG.cityHalf, beachX: CONFIG.beachX,
      player: playerPos, heading: playerCar ? playerCar.heading : player.heading,
      waypoint: missions.waypoint(),
      police: police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
      traffic: traffic.cars.map((c) => ({ x: c.pos.x, z: c.pos.z })),
    });
    sound.update(dt, playerCar ? Math.abs(playerCar.speed) / CONFIG.carMaxSpeed : 0, !!playerCar, police.cars.length > 0);

    // Autosave every few seconds while playing.
    autosaveT += dt;
    if (autosaveT > 5) {
      autosaveT = 0;
      saveGame();
    }
  }

  if (mode === 'paused') {
    if (input.isDown('KeyP') || input.isDown('Escape')) {
      mode = 'playing';
      hud.showPause(false);
      input.keys.clear();
    }
  }

  // Muzzle flash and tracer fade.
  if (muzzleT > 0) {
    muzzleT -= dt;
    if (muzzleT <= 0 && muzzleLight) muzzleLight.intensity = 0;
  }
  if (tracer && tracer.material.opacity > 0) {
    tracer.material.opacity = Math.max(0, tracer.material.opacity - dt * 6);
  }

  renderer.render(scene, camera);
  if (frames === 20) window.__ready = true;
}

// Debug handle for automated playtests: read-only state, no cheats.
window.__solmar = {
  get mode() { return mode; },
  get playerPos() {
    const p = playerCar ? playerCar.pos : player.pos;
    return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), speed: +(playerCar ? playerCar.speed : player.speed).toFixed(1) };
  },
  get inCar() { return !!playerCar; },
  get stars() { return wanted.stars; },
  get policeCount() { return police.cars.length; },
  get heli() { return !!police.heliMesh; },
  get cash() { return cash; },
  get mission() { return missions.current ? missions.current.id : null; },
  get health() { return Math.round(player.health); },
  get ammo() { return ammo; },
};
window.__renderer = renderer;
window.__scene = scene;

stageShot();
animate();
