// Solmar Bay 3D — deterministic randomness.
// One job: a seeded generator so the city, traffic and pedestrians are the
// same on every load (and every screenshot) for a given seed.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A number in [a, b).
export function range(rng, a, b) {
  return a + rng() * (b - a);
}

// An integer in [a, b].
export function int(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

// One element of an array.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
