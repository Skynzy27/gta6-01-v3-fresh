// Solmar Bay 3D — tuning and world constants.
// One job: every number the rest of the game reads, in one place, so a
// balance pass touches this file and nothing else.

export const CONFIG = {
  // Deterministic city: the same seed builds the same streets every load.
  seed: 1,

  // City layout (metres). Roads run on a 40 m grid; the ocean is west (-X).
  cityHalf: 220,
  block: 40,
  roadWidth: 10,
  beachX: -196,
  oceanX: -252,

  // Sunset: the sun sits low over the ocean, west-southwest, so driving
  // west puts the sun on the horizon right in front of the camera. It is
  // high enough (y 0.32) that its light still reaches the streets — a sun
  // flat on the horizon leaves the whole ground black.
  sunDir: { x: -0.82, y: 0.32, z: 0.34 },
  skyTop: 0x241640,
  skyMid: 0xc94a6d,
  skyLow: 0xff9a3d,
  fogColor: 0xe2703f,
  fogNear: 130,
  fogFar: 560,

  // Player on foot.
  walkSpeed: 6,
  runSpeed: 10.5,
  playerRadius: 0.6,
  playerHealth: 100,
  pistolAmmo: 12,
  pistolRange: 70,
  pistolDamage: 34,

  // Cars (arcade handling: fast to learn, forgiving at speed).
  carAccel: 24,
  carReverse: 12,
  carMaxSpeed: 46,
  carMaxReverse: 12,
  carBrake: 36,
  carTurn: 2.1,
  carRadius: 1.7,
  trafficSpeed: 9,

  // Wanted: heat points; one star per 25 heat, five stars maximum.
  heatPerStar: 25,
  heatSteal: 25,
  heatHitPed: 40,
  heatShot: 12,
  heatDecayDelay: 8,
  heatDecayRate: 4,

  // Police: the helicopter joins the hunt from 3 stars up.
  heliAtStars: 3,
  bustedHold: 2.0,
  bustedCarHold: 3.0,

  // Save slot in the browser.
  saveKey: 'solmar-bay-save-v1',
};

// Road axes: roads run where x or z is a multiple of the block size.
export function isRoadCoord(v) {
  const r = Math.abs(((v % CONFIG.block) + CONFIG.block) % CONFIG.block);
  return r <= CONFIG.roadWidth / 2 || r >= CONFIG.block - CONFIG.roadWidth / 2;
}

// Snap a value to the centre of the nearest road.
export function nearestRoad(v) {
  return Math.round(v / CONFIG.block) * CONFIG.block;
}
