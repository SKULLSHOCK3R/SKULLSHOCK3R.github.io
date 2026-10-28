/* Particle sculptures for the closing chamber. Each shape is a flat white-on-transparent drawing (Luffy from
   assets/luffy-mask.png, cut from Robin's silhouette picture after art by @xariis_f; the Straw Hat Jolly Roger and the
   envelope drawn here), sampled into n grains with volume from a chamfer distance transform (the "inflate": grains
   sit on a front and back surface whose depth grows with the distance to the outline, plus a thinner filling).
   Each grain carries a baked shade from the inflated surface's normal, so the sculpture reads as lit. Output per
   grain: x, y, z in world units and shade, packed for a float texture. */
import { rng } from './world.js?v=3';

function blank(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = x.strokeStyle = '#fff';
  x.lineCap = x.lineJoin = 'round';
  return { c, x };
}

export function drawJolly(H) {
  const b = blank(H, H), x = b.x;
  x.scale(H / 400, H / 400);
  function bone(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), nx = -dy / l * 15, ny = dx / l * 15;
    x.lineWidth = 30;
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke();
    [[x1, y1], [x2, y2]].forEach((e) => {
      x.beginPath(); x.arc(e[0] + nx, e[1] + ny, 19, 0, 7); x.fill();
      x.beginPath(); x.arc(e[0] - nx, e[1] - ny, 19, 0, 7); x.fill();
    });
  }
  bone(78, 190, 322, 372);
  bone(322, 190, 78, 372);
  x.beginPath(); x.arc(200, 222, 90, 0, 7); x.fill();
  x.beginPath(); x.moveTo(156, 280); x.lineTo(244, 280); x.lineTo(240, 338); x.lineTo(160, 338); x.closePath(); x.fill();
  x.beginPath(); x.ellipse(200, 132, 80, 62, 0, Math.PI, 0); x.closePath(); x.fill();
  x.beginPath(); x.ellipse(200, 136, 152, 30, 0, 0, 7); x.fill();
  x.globalCompositeOperation = 'destination-out';
  x.fillRect(122, 112, 156, 9);
  x.beginPath(); x.ellipse(164, 222, 24, 28, 0, 0, 7); x.fill();
  x.beginPath(); x.ellipse(236, 222, 24, 28, 0, 0, 7); x.fill();
  x.beginPath(); x.moveTo(200, 254); x.lineTo(188, 276); x.lineTo(212, 276); x.closePath(); x.fill();
  [178, 200, 222].forEach((tx) => { x.fillRect(tx - 3, 300, 6, 40); });
  return b.c;
}

export function drawMail(H) {
  const b = blank(Math.round(H * 1.44), H), x = b.x, s = H / 250;
  x.scale(s, s);
  x.lineWidth = 24;
  x.strokeRect(26, 30, 308, 190);
  x.lineWidth = 20;
  x.beginPath(); x.moveTo(26, 30); x.lineTo(180, 140); x.lineTo(334, 30); x.stroke();
  x.lineWidth = 14;
  x.beginPath(); x.moveTo(26, 220); x.lineTo(138, 118); x.moveTo(334, 220); x.lineTo(222, 118); x.stroke();
  return b.c;
}

export function loadMask(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const b = blank(img.naturalWidth, img.naturalHeight);
      b.x.drawImage(img, 0, 0);
      resolve(b.c);
    };
    img.onerror = () => reject(new Error('mask failed to load: ' + url));
    img.src = url;
  });
}

/* Samples n grains inside the drawing. height: world height of the drawing; thick: half depth at the thickest point;
   base: world y of the drawing's bottom; out: Float32Array(n * 4) to fill (x, y, z, shade); nrm (optional):
   Float32Array(n * 4) for each grain's surface normal (x, y, z, 1), for the lit grains in ending.js. */
export function sample(canvas, n, height, thick, base, seed, out, nrm) {
  const w = canvas.width, h = canvas.height, px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const d = new Float32Array(w * h), inside = [];
  let i, X, Y, v, dmax = 1;
  for (i = 0; i < w * h; i++) d[i] = px[i * 4 + 3] > 127 ? 1e6 : 0;
  for (Y = 0; Y < h; Y++) for (X = 0; X < w; X++) {
    i = Y * w + X;
    if (!d[i]) continue;
    v = X && Y ? d[i] : 0;
    if (X > 0) v = Math.min(v, d[i - 1] + 1);
    if (Y > 0) {
      v = Math.min(v, d[i - w] + 1);
      if (X > 0) v = Math.min(v, d[i - w - 1] + 1.414);
      if (X < w - 1) v = Math.min(v, d[i - w + 1] + 1.414);
    }
    d[i] = v;
  }
  for (Y = h - 1; Y >= 0; Y--) for (X = w - 1; X >= 0; X--) {
    i = Y * w + X;
    if (!d[i]) continue;
    v = d[i];
    if (X < w - 1) v = Math.min(v, d[i + 1] + 1);
    if (Y < h - 1) {
      v = Math.min(v, d[i + w] + 1);
      if (X < w - 1) v = Math.min(v, d[i + w + 1] + 1.414);
      if (X > 0) v = Math.min(v, d[i + w - 1] + 1.414);
    }
    d[i] = v;
    inside.push(i);
    if (v > dmax) dmax = v;
  }
  const R = rng(seed), u = height / h, lx = -0.42, ly = 0.78, lz = 0.46;
  for (let k = 0; k < n; k++) {
    i = inside[Math.floor(R() * inside.length)];
    X = i % w; Y = (i - X) / w;
    const rel = d[i] / dmax, depth = thick * Math.sqrt(rel);
    const surf = R() < 0.62, side = R() < 0.5 ? -1 : 1;
    const z = surf ? side * depth * (0.86 + 0.14 * R()) : (R() * 2 - 1) * depth;
    // shade from the inflated surface normal (distance-field gradient, flipped to world y up)
    let shade = 0.42, nx = 0, ny = 0, nz = side;
    if (surf) {
      const gx = (X < w - 1 && X > 0) ? d[i + 1] - d[i - 1] : 0, gy = (Y < h - 1 && Y > 0) ? d[i + w] - d[i - w] : 0;
      const kf = 0.5 / Math.sqrt(rel + 0.03);
      nx = -gx * kf; ny = gy * kf; nz = side;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      shade = 0.3 + 0.7 * Math.max(0, nx * lx + ny * ly + nz * lz) + 0.12 * Math.max(0, -nz);
    }
    if (nrm) {   // lit grains: the normal carries the light, the shade becomes occlusion (inner grains darker)
      nrm[k * 4] = nx; nrm[k * 4 + 1] = ny; nrm[k * 4 + 2] = nz; nrm[k * 4 + 3] = 1;
      shade = surf ? 0.75 + 0.25 * Math.sqrt(rel) : 0.35;
    }
    out[k * 4] = (X + R() - w / 2) * u;
    out[k * 4 + 1] = (h - Y - R()) * u + base;
    out[k * 4 + 2] = z;
    out[k * 4 + 3] = shade;
  }
  return out;
}
