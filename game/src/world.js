// Solmar Bay 3D — the city.
// One job: build everything that never moves (streets, buildings, beach,
// ocean, sunset sky) and hand the game the collision boxes and spawn points.
// All placement comes from a seeded generator, so the city is identical on
// every load for a given seed.

import { CONFIG, nearestRoad } from './config.js';
import { range, int, pick } from './random.js';
import { partBox, mergeParts, mergedMaterial } from './merge.js';

// Push a circle (x, z, radius) out of every building box it overlaps.
export function resolveCircle(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      z = cz + (dz / d) * r;
    } else if (d2 <= 0.0001) {
      // Centre inside the box: push out along the smallest penetration.
      const pl = x - c.minX;
      const pr = c.maxX - x;
      const pt = z - c.minZ;
      const pb = c.maxZ - z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) x = c.minX - r;
      else if (m === pr) x = c.maxX + r;
      else if (m === pt) z = c.minZ - r;
      else z = c.maxZ + r;
    }
  }
  return { x, z };
}

export function circleHitsColliders(x, z, r, colliders) {
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// A canvas texture of lit windows for building facades.
function windowTexture(rng, litChance) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#1c1a26';
  g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      if (rng() < litChance) {
        g.fillStyle = pick(rng, ['#ffd28a', '#ffbe6e', '#ffe9b0', '#9fd8ff']);
        g.fillRect(x, y, 10, 12);
      } else {
        g.fillStyle = '#2c2a3a';
        g.fillRect(x, y, 10, 12);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A soft radial glow (sun halo, clouds, lamp halos).
function glowTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = 128;
  cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene, rng) {
  const colliders = [];
  const half = CONFIG.cityHalf;
  const block = CONFIG.block;
  const roadHalf = CONFIG.roadWidth / 2;

  // --- Sky: gradient dome + sun disc low over the ocean. ---
  const skyCv = document.createElement('canvas');
  skyCv.width = 4;
  skyCv.height = 256;
  const sg = skyCv.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#241640');
  grad.addColorStop(0.45, '#7a2d5e');
  grad.addColorStop(0.72, '#d94f6a');
  grad.addColorStop(0.88, '#ff9a3d');
  grad.addColorStop(1, '#ffc46b');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCv);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Sun disc + halo, low on the horizon over the ocean (west).
  const sunDir = new THREE.Vector3(CONFIG.sunDir.x, CONFIG.sunDir.y, CONFIG.sunDir.z).normalize();
  const sunPos = sunDir.clone().multiplyScalar(820);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sun.position.copy(sunPos);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshBasicMaterial({
      map: glowTexture('rgba(255,190,90,0.85)', 'rgba(255,120,60,0)'),
      transparent: true, depthWrite: false, fog: false,
    }),
  );
  halo.position.copy(sunPos).multiplyScalar(0.98);
  halo.lookAt(0, 0, 0);
  scene.add(halo);

  // A few pink clouds, soft sprites high up (one instanced mesh).
  const cloudTex = glowTexture('rgba(255,170,190,0.5)', 'rgba(255,170,190,0)');
  const clouds = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }),
    9,
  );
  const cDummy = new THREE.Object3D();
  for (let i = 0; i < 9; i++) {
    cDummy.position.set(range(rng, -500, 500), range(rng, 120, 210), range(rng, -500, 500));
    cDummy.scale.set(range(rng, 160, 320), range(rng, 22, 44), 1);
    cDummy.lookAt(0, cDummy.position.y, 0);
    cDummy.updateMatrix();
    clouds.setMatrixAt(i, cDummy.matrix);
  }
  clouds.instanceMatrix.needsUpdate = true;
  scene.add(clouds);

  // --- Light: warm low sun + purple dusk fill. The fill is the light the
  // streets actually see: the sun is low, so its grazing light barely
  // touches flat ground, and without a strong hemisphere the roads read
  // as a black void.
  scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFar);
  const hemi = new THREE.HemisphereLight(0x9a6aa8, 0x5a4450, 1.25);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xffb36b, 2.1);
  sunLight.position.copy(sunDir).multiplyScalar(260);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(512, 512);
  sunLight.shadow.camera.left = -70;
  sunLight.shadow.camera.right = 70;
  sunLight.shadow.camera.top = 70;
  sunLight.shadow.camera.bottom = -70;
  sunLight.shadow.camera.near = 40;
  sunLight.shadow.camera.far = 520;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // --- Ground: concrete city, sand beach, animated ocean. ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2 + 160, half * 2 + 160),
    new THREE.MeshLambertMaterial({ color: 0x4a4a52 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.x = -40;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(62, half * 2 + 160),
    new THREE.MeshLambertMaterial({ color: 0xd9b380 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CONFIG.beachX - 26, 0.02, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const oceanGeo = new THREE.PlaneGeometry(140, half * 2 + 320, 28, 48);
  const ocean = new THREE.Mesh(
    oceanGeo,
    new THREE.MeshLambertMaterial({ color: 0x27355e }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(CONFIG.oceanX - 70, 0.05, 0);
  scene.add(ocean);
  const oceanBase = oceanGeo.attributes.position.array.slice();

  // --- Roads: all strips merged into one mesh, with dashed centre lines. ---
  const dashGeo = new THREE.BoxGeometry(0.5, 0.06, 3);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.6 });
  // Roads run on multiples of the block size (0, ±40, ±80, ...); the blocks
  // sit halfway between them, so a road centre is never inside a building.
  const roadCoords = [];
  const roadMax = Math.floor(half / block) * block;
  for (let c = -roadMax; c <= roadMax; c += block) roadCoords.push(c);
  const roadParts = [];
  const dashSpots = [];
  for (const c of roadCoords) {
    roadParts.push(partBox(CONFIG.roadWidth, 0.08, half * 2, 0x23232c, c, 0.04, 0));
    roadParts.push(partBox(half * 2, 0.08, CONFIG.roadWidth, 0x23232c, 0, 0.04, c));
    for (let t = -half + 10; t <= half - 10; t += 12) {
      dashSpots.push([c, t, 0]);
      dashSpots.push([t, c, 1]);
    }
  }
  const roads = new THREE.Mesh(mergeParts(roadParts), mergedMaterial());
  roads.receiveShadow = true;
  scene.add(roads);
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const dummy = new THREE.Object3D();
  dashSpots.forEach(([x, z, rot], i) => {
    dummy.position.set(x, 0.1, z);
    dummy.rotation.set(0, rot ? Math.PI / 2 : 0, 0);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true;
  scene.add(dashes);

  // --- Boardwalk along the beach, with palms. ---
  const boardwalk = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.3, half * 2),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  boardwalk.position.set(CONFIG.beachX + 2, 0.15, 0);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);

  // --- Buildings: one to four boxes per block, lit windows, rooftop kit. ---
  const winTexA = windowTexture(rng, 0.45);
  const winTexB = windowTexture(rng, 0.3);
  const facadeTints = [0x8a7a9e, 0x9e8a7a, 0x7a8a9e, 0xb08a7a, 0x6a6a7e];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 });
  const kitSpots = [];
  const beaconSpots = [];
  const buildingMats = [];
  for (let bi = 0; bi < 5; bi++) {
    const tex = bi % 2 === 0 ? winTexA : winTexB;
    buildingMats.push(new THREE.MeshLambertMaterial({
      color: facadeTints[bi], map: tex, emissive: 0xffc27a, emissiveMap: tex, emissiveIntensity: 0.5,
    }));
  }
  // Buildings are one InstancedMesh per facade material (five draw calls for
  // the whole city instead of one per building); colliders are still per box.
  const buckets = buildingMats.map(() => []);
  // Blocks sit halfway between roads (centres at ±20, ±60, ...); buildings
  // stay small enough that their faces never reach the road or the sidewalk.
  for (let bx = -half + block / 2 + 20; bx <= half - block / 2 - 20; bx += block) {
    for (let bz = -half + block / 2 + 20; bz <= half - block / 2 - 20; bz += block) {
      if (bx <= -180) continue; // westernmost column is the beach
      const count = int(rng, 1, 3);
      for (let k = 0; k < count; k++) {
        const w = range(rng, 12, 18);
        const d = range(rng, 12, 18);
        const h = range(rng, 9, 58);
        const cx = bx + range(rng, -3, 3);
        const cz = bz + range(rng, -3, 3);
        const mi = int(rng, 0, buildingMats.length - 1);
        buckets[mi].push({ cx, cz, w, h, d });
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
        // Rooftop box + blinking beacon on the tall ones (instanced later).
        if (h > 30 && rng() < 0.6) {
          kitSpots.push([cx, h + 1, cz]);
          beaconSpots.push([cx, h + 2.6, cz]);
        }
      }
    }
  }
  buckets.forEach((list, mi) => {
    if (list.length === 0) return;
    const inst = new THREE.InstancedMesh(boxGeo, buildingMats[mi], list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.cx, b.h / 2, b.cz);
      dummy.scale.set(b.w, b.h, b.d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = true;
    inst.receiveShadow = true;
    scene.add(inst);
  });
  // Rooftop kits and beacons, instanced (one draw call each).
  const kits = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 2, 3), new THREE.MeshStandardMaterial({ color: 0x3a3a44 }), Math.max(1, kitSpots.length));
  kitSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    kits.setMatrixAt(i, dummy.matrix);
  });
  kits.instanceMatrix.needsUpdate = true;
  scene.add(kits);
  const beaconMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 8), beaconMat, Math.max(1, beaconSpots.length));
  beaconSpots.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    beaconMesh.setMatrixAt(i, dummy.matrix);
  });
  beaconMesh.instanceMatrix.needsUpdate = true;
  scene.add(beaconMesh);

  // --- Palms along the boardwalk and a few avenues. ---
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 1 });
  const frondGeo = new THREE.ConeGeometry(2.6, 1.1, 6);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e7a3a, roughness: 0.9 });
  const palmSpots = [];
  for (let z = -half + 10; z <= half - 10; z += 22) {
    palmSpots.push([CONFIG.beachX + 8, z]);
    if (rng() < 0.5) palmSpots.push([nearestRoad(80) + 7, z]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length * 5);
  palmSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 3.5, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let f = 0; f < 5; f++) {
      const a = (f / 5) * Math.PI * 2 + rng() * 0.4;
      dummy.position.set(x + Math.cos(a) * 1.4, 7.2, z + Math.sin(a) * 1.4);
      dummy.rotation.set(Math.sin(a) * 0.9, 0, Math.cos(a) * 0.9 + 0.5);
      dummy.updateMatrix();
      fronds.setMatrixAt(i * 5 + f, dummy.matrix);
    }
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  });
  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);

  // --- Streetlights at every second intersection (emissive heads, no real lights). ---
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.4 });
  const bulbGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd27a, emissiveIntensity: 2.2 });
  const lampSpots = [];
  for (let i = 0; i < roadCoords.length; i += 2) {
    for (let j = 0; j < roadCoords.length; j += 2) {
      lampSpots.push([roadCoords[i] + roadHalf + 0.8, roadCoords[j] + roadHalf + 0.8]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    dummy.position.set(x, 3.25, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 6.6, z);
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  bulbs.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(bulbs);

  // Spawn points: player starts on the main avenue facing the sunset.
  const playerSpawn = { x: 0, z: 40 };
  const carSpawns = [];
  for (let i = 0; i < 12; i++) {
    const c = roadCoords[int(rng, 0, roadCoords.length - 1)];
    const t = int(rng, -4, 4) * block;
    carSpawns.push({ x: c, z: t });
  }

  return {
    colliders,
    sunLight,
    playerSpawn,
    carSpawns,
    bounds: { minX: -half, maxX: half, minZ: -half, maxZ: half },
    update(dt, t) {
      // Ocean swell.
      const pos = oceanGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const bx = oceanBase[i * 3];
        const by = oceanBase[i * 3 + 1];
        pos.setZ(i, Math.sin(bx * 0.08 + t * 0.9) * 0.7 + Math.cos(by * 0.06 + t * 0.7) * 0.7);
      }
      pos.needsUpdate = true;
      oceanGeo.computeVertexNormals();
      // Rooftop beacons blink.
      const on = Math.sin(t * 2.4) > 0;
      beaconMat.emissiveIntensity = on ? 2.4 : 0.15;
    },
  };
}
