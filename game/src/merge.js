// Solmar Bay 3D — geometry merging.
// One job: build a whole low-poly object (a car, a person) as ONE mesh.
// Parts are boxes, cylinders and spheres painted with vertex colours and
// merged into a single BufferGeometry, so one mesh (one draw call) draws
// the whole object. The material is shared: MeshStandardMaterial with
// vertexColours on. Parts that must move on their own (a spinning rotor, a
// flashing light bar) stay separate meshes; everything static is merged.

function paint(geo, color) {
  const c = new THREE.Color(color);
  const count = geo.attributes.position.count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geo;
}

export function partBox(w, h, d, color, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return paint(geo, color);
}

export function partCylinder(radiusTop, radiusBottom, height, segments, color, x, y, z, rotX = 0, rotZ = 0) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  if (rotX) geo.rotateX(rotX);
  if (rotZ) geo.rotateZ(rotZ);
  geo.translate(x, y, z);
  return paint(geo, color);
}

export function partSphere(radius, widthSeg, heightSeg, color, x, y, z) {
  const geo = new THREE.SphereGeometry(radius, widthSeg, heightSeg);
  geo.translate(x, y, z);
  return paint(geo, color);
}

// Merge parts (all with position, normal and colour) into one geometry.
// The parts are indexed geometries; indices are offset as they are joined.
export function mergeParts(parts) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const p of parts) {
    vertexCount += p.attributes.position.count;
    indexCount += p.index.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const colour = new Float32Array(vertexCount * 3);
  const index = new Uint32Array(indexCount);
  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    const n = p.attributes.position.count;
    position.set(p.attributes.position.array, vOff * 3);
    normal.set(p.attributes.normal.array, vOff * 3);
    colour.set(p.attributes.color.array, vOff * 3);
    const src = p.index.array;
    for (let i = 0; i < src.length; i++) index[iOff + i] = src[i] + vOff;
    vOff += n;
    iOff += src.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

// One shared material for every merged object: vertex colours carry the
// paint. Lambert, not Standard: the per-pixel PBR shader is what makes a
// software renderer crawl (a full screen of lit pixels at ~1 fps), and
// Lambert is a fraction of that cost for the same flat low-poly look.
export const mergedMaterial = () => new THREE.MeshLambertMaterial({
  vertexColors: true,
});
