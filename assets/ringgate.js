/* The ring gate on the way to the ending, after igloo.inc's segmented stone rings (Robin, 2026-10-26: "add some 3d
   rings rather than a whiteout transition"). As the camera dives into J.A.R.V.I.S.'s core (cores.js), three rings of
   frosted stone segments assemble around it, segments flying in from outside, each ring turning on its own axis, rims
   glowing in the core's gold; the camera passes through them and the segments part as it does. The gate follows the
   core's position and size, and is driven by the scroll alone, so scrolling back plays it in reverse. */
import * as THREE from 'three';
import { rng } from './world.js?v=3';

/* One ring segment: a rounded-square profile (width w across the ring, depth d along its axis) swept from angle a0
   to a1 at radius R, with end caps. */
function segment(R, w, d, a0, a1) {
  const steps = Math.max(8, Math.ceil((a1 - a0) / 0.05)), P = 20;
  const prof = [];
  for (let k = 0; k <= P; k++) {
    const th = 2 * Math.PI * k / P, c = Math.cos(th), s = Math.sin(th);
    prof.push([w / 2 * Math.sign(c) * Math.pow(Math.abs(c), 0.35), d / 2 * Math.sign(s) * Math.pow(Math.abs(s), 0.35)]);
  }
  const pos = [], uv = [], idx = [];
  const arcLen = R * (a1 - a0);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps, ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k <= P; k++) {
      const r = R + prof[k][0];
      pos.push(r * ca, r * sa, prof[k][1]);
      uv.push(arcLen * i / steps / 0.5, k / P * 1.2);
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < P; k++) {
      const p = i * (P + 1) + k, q = p + P + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  for (const [a, flip] of [[a0, true], [a1, false]]) {   // caps: a fan round the profile's centre
    const ca = Math.cos(a), sa = Math.sin(a), c0 = pos.length / 3;
    pos.push(R * ca, R * sa, 0); uv.push(0.5, 0.5);
    for (let k = 0; k <= P; k++) { const r = R + prof[k][0]; pos.push(r * ca, r * sa, prof[k][1]); uv.push(0.5 + prof[k][0] / w, 0.5 + prof[k][1] / d); }
    for (let k = 0; k < P; k++) flip ? idx.push(c0, c0 + 2 + k, c0 + 1 + k) : idx.push(c0, c0 + 1 + k, c0 + 2 + k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* A tileable frosted-stone grain (integer-frequency waves wrap seamlessly) for bump and roughness. */
function grainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d'), img = x.createImageData(256, 256), R = rng(0x6772616e);
  const waves = Array.from({ length: 28 }, (_, k) => [Math.round(1 + R() * (4 + k)), Math.round((R() - 0.5) * (8 + 2 * k)), R() * 6.28, 1 / (1 + k * 0.35)]);
  for (let y = 0; y < 256; y++) {
    for (let xx = 0; xx < 256; xx++) {
      let v = 0;
      for (const [fx, fy, ph, a] of waves) v += a * Math.sin(2 * Math.PI * (fx * xx + fy * y) / 256 + ph);
      const g = Math.max(0, Math.min(255, 128 + v * 30)), o = (y * 256 + xx) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = g; img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export async function createRingGate(ctx, tint) {
  const group = new THREE.Group();
  group.name = 'ringgate';
  group.visible = false;
  const grain = grainTexture();
  let env = null;
  try {
    env = await new THREE.TextureLoader().loadAsync('assets/env/storm-pano.jpg');
    env.mapping = THREE.EquirectangularReflectionMapping;
    env.colorSpace = THREE.SRGBColorSpace;
  } catch (e) { /* lit by the core's light and the scene lights alone */ }
  const gold = new THREE.Color(tint).lerp(new THREE.Color(1, 1, 1), 0.35);

  /* One material per ring: frosted stone with a fresnel rim in the core's colour (igloo's glowing edges) and a whole-
     body glow (uGlow) for the moment the ring is born as light out of the core, before it hardens into stone. */
  function stone() {
    const u = { uRim: { value: 0 }, uGlow: { value: 0 }, uRimCol: { value: gold } };
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.7, 0.75, 0.84), roughness: 0.88, metalness: 0, bumpMap: grain, bumpScale: 2.5,
      roughnessMap: grain, fog: false, transparent: true, opacity: 1, envMap: env, envMapIntensity: 1.2
    });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRim,uGlow;uniform vec3 uRimCol;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 totalEmissiveRadiance+=uRimCol*(pow(1.-abs(dot(normal,normalize(vViewPosition))),2.5)*uRim+uGlow);`);
    };
    mat.customProgramCacheKey = () => 'ringgate-stone';
    return { mat, u };
  }

  // radii in core units (the hologram sphere is radius 1): segments get fewer and heavier toward the outside
  const R = rng(0x72696e67), rings = [];
  [[1.1, 0.16, 0.18, 4, 0.2], [1.25, 0.2, 0.22, 6, -0.55], [1.4, 0.24, 0.26, 8, 0.85]].forEach(([rad, w, d, n, tilt], ri) => {
    const ring = new THREE.Group();
    const { mat, u } = stone();
    const gap = 0.14 + R() * 0.06, step = 2 * Math.PI / n;
    for (let k = 0; k < n; k++) {
      const a0 = k * step + gap / 2, a1 = (k + 1) * step - gap / 2 - R() * 0.1;
      const seg = new THREE.Mesh(segment(rad, w, d, a0, a1), mat);
      seg.userData = { mid: (a0 + a1) / 2, tumble: (R() - 0.5) * 2.4 };
      ring.add(seg);
    }
    ring.userData = { tilt, spin: (ri % 2 ? -1 : 1) * (0.35 + 0.2 * ri), mat, u, rad, w };
    group.add(ring);
    rings.push(ring);
  });
  const light = new THREE.PointLight(new THREE.Color(tint), 0, 0, 1.6);
  group.add(light);

  const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  /* state: leave (0..1), time, pos (J.A.R.V.I.S.'s core, world). The rings materialise out of the core (Robin,
     2026-10-26: "let the rings materialize from jarvis's core animation rather than pop into view"): each is born at
     the core's centre as a thin band of its gold light, swells outward while hardening into frosted stone, and
     sweeps out past the edges of the view as the camera dives in; the next follows, and the last passes as the
     overhead view of the pedestal opens (ending.js entry), as in igloo.inc's ring transition. */
  const ndc = new THREE.Vector3();
  /* Returns the portal: the last ring's opening on screen (x, y in NDC, r in half view heights); r -1 before it is
     born (the chamber stays hidden), Infinity once it has swept past the edges (the chamber is the whole view). */
  /* s.rest (0..1, while the cores are shown) and s.coreR (J.A.R.V.I.S.'s core radius, world): the first ring always
     floats within his core (Robin, 2026-10-26), small and slowly turning, and is the one that grows out into the gate */
  function update(s) {
    const rest = s.rest || 0;
    group.visible = (s.leave > 0.001 || rest > 0.01) && s.leave < 0.999;
    if (!group.visible) { light.intensity = 0; return { x: 0, y: 0, r: s.leave >= 0.999 ? Infinity : -1 }; }
    let portalOut = { x: 0, y: 0, r: -1 };
    // at the core, but never closer than z 4.4 (the core itself ends just in front of the camera at z 6)
    group.position.set(s.pos.x, s.pos.y, Math.min(s.pos.z, 4.4));
    group.scale.setScalar(1);
    const half = ctx.halfH(group.position.z);         // half the view height at the rings' depth
    rings.forEach((ring, ri) => {
      const d = ring.userData;
      const u = Math.min(1, Math.max(0, (s.leave - ri * 0.2) / 0.6));   // this ring's life
      const last = ri === rings.length - 1, floater = ri === 0 && rest > 0.01;
      if (last && u >= 0.999) portalOut = { x: 0, y: 0, r: Infinity };
      ring.visible = (u > 0.001 || floater) && u < 0.999;
      if (!ring.visible) return;
      const grow = u * u;                                                 // slow at birth, rushing out at the end
      // sized by how it looks: from a point at the core to well past the edges of the view (radius 1.9 x half height);
      // the floating first ring never smaller than its resting size inside the core
      // (Robin, 2026-10-26: "waaaaaay smaller ... sitting right at the center")
      const appar = Math.max(0.04 + grow * 1.9, floater ? 0.08 * (s.coreR || 0) / half : 0);
      ring.scale.setScalar(appar * half / d.rad);
      if (last) {                                                         // its opening is the window on the chamber
        ndc.copy(group.position).project(ctx.camera);
        portalOut = { x: ndc.x, y: ndc.y, r: appar * (d.rad - d.w / 2) / d.rad };
      }
      ring.rotation.set(d.tilt * 0.2 * (1 - u), d.tilt * 0.1 * (1 - u), d.spin * (s.time * 0.4 + u * 3));
      const born = ease(u / 0.25);                                        // from light to stone
      d.u.uGlow.value = 0.7 * (1 - born);
      d.u.uRim.value = 0.25 + 0.3 * born;
      // fade in at birth; fade out as it sweeps past the screen edge, so no huge slab ever sits on the lens
      d.mat.opacity = ease(u / 0.12) * (1 - ease((appar - 1.15) / 0.5));
      if (floater) {
        // at rest it tumbles slowly in the core's light, then rights itself into the gate as the dive begins
        const k = ease(u / 0.3);
        ring.rotation.x += (1 - k) * (0.9 + 0.25 * Math.sin(s.time * 0.37));
        ring.rotation.y += (1 - k) * 0.35 * Math.sin(s.time * 0.23);
        d.u.uGlow.value = Math.max(d.u.uGlow.value, 0.3 * (1 - k));
        d.u.uRim.value = Math.max(d.u.uRim.value, 0.6 * (1 - k));
        d.mat.opacity = Math.max(d.mat.opacity, rest * (1 - k));
      }
      d.mat.depthWrite = d.mat.opacity > 0.98;
      ring.children.forEach((seg) => {                                    // the segments open apart a touch as it grows
        const sd = seg.userData, r = 0.05 * grow;
        seg.position.set(Math.cos(sd.mid) * r, Math.sin(sd.mid) * r, 0);
        seg.rotation.set(sd.tumble * 0.15 * grow, -sd.tumble * 0.1 * grow, 0);
      });
    });
    light.intensity = Math.max(2.5 * ease(s.leave / 0.2), 0.6 * rest) * (1 - ease((s.leave - 0.8) / 0.2));
    return portalOut;
  }

  return { group, update };
}
