/* The world map (ours, 2026-10-25): a Red Line ring through both poles, the Grand Line on the equator between the two
   Calm Belts, the four Blues in the quadrants, seeded islands, Reverse Mountain, Mary Geoise and Laugh Tale (gold).
   buildWorld() lays blocks on a sphere in staggered latitude rows and returns per-instance data for the globe:
   home position (block centre), size (world units for a 1 x 0.62 x 0.62 block), tint, four random numbers and the core
   each block falls into when the world collapses (west half: J.A.R.V.I.S., east half: E.V.). Pure data, no DOM. */

const DEG = Math.PI / 180;

/* Linear-light tints that multiply the baked ice-stone colour map. */
const TINTS = {
  blue: [0.05, 0.17, 0.36], grand: [0.07, 0.27, 0.40], calm: [0.03, 0.09, 0.14],
  red: [0.62, 0.15, 0.10], peak: [0.80, 0.30, 0.16], land: [0.17, 0.42, 0.18], sand: [0.62, 0.50, 0.28], gold: [1.05, 0.70, 0.18]
};
const HEIGHT = { blue: 0, grand: 0, calm: -0.01, red: 0.08, peak: 0.12, land: 0.035, sand: 0.025, gold: 0.06 };

export function rng(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function angDist(l1, b1, l2, b2) {
  const c = Math.sin(b1) * Math.sin(b2) + Math.cos(b1) * Math.cos(b2) * Math.cos(l1 - l2);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/* HUD labels for the parted globe: name, longitude and latitude of the block they point at. */
export const LABELS = [
  { name: 'RED LINE', lon: 0, lat: 52 * DEG },
  { name: 'REVERSE MOUNTAIN', lon: 0, lat: 0 },
  { name: 'GRAND LINE', lon: -70 * DEG, lat: 0 },
  { name: 'CALM BELT', lon: 110 * DEG, lat: 9 * DEG },
  { name: 'NORTH BLUE', lon: -95 * DEG, lat: 48 * DEG },
  { name: 'EAST BLUE', lon: 95 * DEG, lat: 46 * DEG },
  { name: 'SOUTH BLUE', lon: 80 * DEG, lat: -48 * DEG },
  { name: 'WEST BLUE', lon: -80 * DEG, lat: -46 * DEG },
  { name: 'MARY GEOISE', lon: Math.PI, lat: 0 },
  { name: 'LAUGH TALE', lon: -12 * DEG, lat: 0.5 * DEG, gold: true }
];

export function buildWorld(nLat) {
  const R = rng(0x4f504d50);
  const islands = [];
  for (let i = 0; i < 46; i++) islands.push([-Math.PI + R() * 2 * Math.PI, (R() * 2 - 1) * 4.5 * DEG, (1.3 + R() * 2.2) * DEG, R() < 0.3 ? 'sand' : 'land']);
  for (let q = 0; q < 4; q++) {
    const east = q % 2 ? 1 : -1, north = q < 2 ? 1 : -1;
    for (let i = 0; i < 9; i++) islands.push([east * (0.12 + R() * (Math.PI - 0.24)), north * (16 + R() * 58) * DEG, (2 + R() * 3.5) * DEG, R() < 0.25 ? 'sand' : 'land']);
  }
  islands.push([0, 0, 3.6 * DEG, 'peak']);               // Reverse Mountain, where the Grand Line meets the Red Line
  islands.push([Math.PI, 0, 3.2 * DEG, 'peak']);         // Mary Geoise, on the Red Line at the other crossing
  islands.push([-12 * DEG, 0.5 * DEG, 1.8 * DEG, 'gold']); // Laugh Tale, at the end of the New World

  function classify(lon, lat) {
    const x = Math.cos(lat) * Math.sin(lon);
    const redDist = Math.asin(Math.min(1, Math.abs(x)));
    const wob = (0.7 * Math.sin(lat * 7 + 1) + 0.5 * Math.sin(lat * 13 + 2)) * DEG;
    for (let k = islands.length - 3; k < islands.length; k++) {
      const s = islands[k];
      if (angDist(lon, lat, s[0], s[1]) < s[2]) return s[3];
    }
    if (redDist < 2.6 * DEG + wob) return 'red';
    const al = Math.abs(lat);
    if (al > 12 * DEG || al < 6.5 * DEG) {
      for (let j = 0; j < islands.length - 3; j++) {
        const is = islands[j];
        if (angDist(lon, lat, is[0], is[1]) < is[2]) return is[3];
      }
    }
    return al < 6.5 * DEG ? 'grand' : al < 12 * DEG ? 'calm' : 'blue';
  }

  const home = [], size = [], color = [], rand = [], core = [], meta = [];
  for (let i = 0; i < nLat; i++) {
    const lat = -Math.PI / 2 + (i + 0.5) / nLat * Math.PI;
    const n = Math.max(4, Math.round(nLat * 2 * Math.cos(lat)));
    for (let j = 0; j < n; j++) {
      let lon = -Math.PI + (j + 0.5 + (i % 2) * 0.5) / n * 2 * Math.PI;
      if (lon > Math.PI) lon -= 2 * Math.PI;
      const kind = classify(lon, lat), h = HEIGHT[kind], depth = 0.07 + h, top = 1 + h, rc = top - depth / 2;
      const dir = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
      const shade = 0.82 + 0.32 * R(), t = TINTS[kind];
      home.push(dir[0] * rc, dir[1] * rc, dir[2] * rc);
      // block.glb is 1 x 0.62 x 0.62: x along the row (east), y north, z outward
      size.push(2 * Math.PI * Math.cos(lat) / n * top * 0.92, Math.PI / nLat * top * 0.92 / 0.62, depth / 0.62);
      color.push(t[0] * shade, t[1] * shade, t[2] * shade);
      rand.push(R() * 0.55, R(), R(), R());
      core.push(lon < 0 ? 0 : 1);
      meta.push({ lon, lat, kind });
    }
  }
  // the block nearest each label's point
  const anchors = LABELS.map((L) => {
    let best = 0, bd = 1e9;
    for (let k = 0; k < meta.length; k++) {
      const d = angDist(L.lon, L.lat, meta[k].lon, meta[k].lat);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  });
  return {
    count: meta.length,
    home: new Float32Array(home), size: new Float32Array(size), color: new Float32Array(color),
    rand: new Float32Array(rand), core: new Float32Array(core), anchors
  };
}
