/* The two AI cores (J.A.R.V.I.S. gold, E.V. purple): a CORE hologram as GPU lines. A sphere of broken
   filaments (latitude bands, meridians, tilted circles and a knot at the centre) in four layers, each turning on its
   own axis; every filament traces on, holds, fades from its tail and rests, timed per arc in the vertex shader.
   Drawn additively (bloom gives the glow) with a soft centre sprite and a few orbiting motes. One draw call per core
   for the lines. HUD callouts and the click sheets live in the page (app.js); this module only draws and places. */
import * as THREE from 'three';
import { ROT } from './glsl.js?v=3';
import { rng } from './world.js?v=3';

export const CORES = [
  { key: 'jarvis', name: 'J.A.R.V.I.S.', tint: 0xffb547, seed: 0x4a525653 },
  { key: 'ev', name: 'E.V.', tint: 0xb57bff, seed: 0x45562121 }
];

const VS = /* glsl */`
attribute float aT,aLayer,aPeriod,aOffset;
uniform float uTime,uView,uAlpha,uAng0,uAng1,uAng2,uAng3;
varying float vA,vKnot;
${ROT}
vec3 rotL(vec3 p,int li){
 float ang=li==0?uAng0:li==1?uAng1:li==2?uAng2:uAng3;
 vec3 ax=li==2?vec3(0.,0.,1.):li==3?vec3(1.,0.,0.):vec3(0.,1.,0.);
 vec2 tl=li==0?vec2(0.):li==1?vec2(.42,.12):li==2?vec2(.25,.55):vec2(.6,.3);
 p=rotAxis(ax,ang)*p;p=rotAxis(vec3(1.,0.,0.),tl.x)*p;p=rotAxis(vec3(0.,0.,1.),tl.y)*p;
 p=rotAxis(vec3(0.,1.,0.),uView)*p;return rotAxis(vec3(1.,0.,0.),.3)*p;}
void main(){int li=int(aLayer+.5);vec3 p=rotL(position,li);
 float ph=fract(uTime/aPeriod+aOffset);
 float vis=ph<.3?step(aT,ph/.3):ph<.64?1.:ph<.9?step((ph-.64)/.26,aT):0.;
 float depth=.15+.85*(p.z+1.)*.5;
 vA=vis*depth*uAlpha*(li==3?.95:.8);vKnot=li==3?1.:0.;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const FS = /* glsl */`
precision highp float;uniform vec3 uTint,uLight;varying float vA,vKnot;
void main(){vec3 c=mix(uTint,uLight,vKnot)*vA*1.7;gl_FragColor=vec4(c,vA);}`;

function unit(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

/* Arcs on the unit sphere as line segments with per-vertex timing. */
function buildArcs(seed) {
  const R = rng(seed), D = Math.PI / 180;
  const pos = [], aT = [], aLayer = [], aPeriod = [], aOffset = [];
  function arc(li, n, e1, e2, rs, c, a0, a1) {
    const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (4 * D)));
    const rho = Math.sqrt(Math.max(0, rs * rs - c * c)), period = 3.5 + R() * 4.5, offset = R();
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * i / steps, ca = Math.cos(a), sa = Math.sin(a);
      pts.push([rho * (ca * e1[0] + sa * e2[0]) + c * n[0], rho * (ca * e1[1] + sa * e2[1]) + c * n[1], rho * (ca * e1[2] + sa * e2[2]) + c * n[2]]);
    }
    for (let i = 0; i < steps; i++) {
      pos.push(...pts[i], ...pts[i + 1]);
      aT.push(i / steps, (i + 1) / steps);
      aLayer.push(li, li); aPeriod.push(period, period); aOffset.push(offset, offset);
    }
  }
  function broken(li, n, e1, e2, rs, c, skip) {
    let a = R() * Math.PI * 2;
    const end = a + Math.PI * 2;
    for (;;) {
      const len = (6 + R() * 26) * D;
      if (a + len > end) break;
      if (!(skip && R() < skip)) arc(li, n, e1, e2, rs, c, a, a + len);
      a += len + (3 + R() * 10) * D;
    }
  }
  const Y = [0, 1, 0], X = [1, 0, 0], Z = [0, 0, 1];
  for (let i = 0; i < 12; i++) { const lat = (-75 + 150 * (i + 0.5) / 12) * D; broken(0, Y, Z, X, 1, Math.sin(lat), 0); }
  for (let i = 0; i < 12; i++) {
    const lon = i / 12 * Math.PI * 2, e1 = [Math.sin(lon), 0, Math.cos(lon)];
    broken(1, cross(e1, Y), e1, Y, 1, 0, 0.45);
  }
  for (let i = 0; i < 16; i++) {
    const n = unit([R() - 0.5, R() - 0.5, R() - 0.5]), f1 = unit(cross(n, Math.abs(n[1]) < 0.9 ? Y : X));
    broken(2, n, f1, cross(n, f1), 0.92 + R() * 0.08, 0, 0.35);
  }
  for (let i = 0; i < 50; i++) {
    const m = unit([R() - 0.5, R() - 0.5, R() - 0.5]), g1 = unit(cross(m, Math.abs(m[1]) < 0.9 ? Y : X)), a0 = R() * 6.28;
    arc(3, m, g1, cross(m, g1), 0.06 + R() * 0.24, 0, a0, a0 + (30 + R() * 110) * D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aLayer', new THREE.Float32BufferAttribute(aLayer, 1));
  g.setAttribute('aPeriod', new THREE.Float32BufferAttribute(aPeriod, 1));
  g.setAttribute('aOffset', new THREE.Float32BufferAttribute(aOffset, 1));
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SPEEDS = [1, -0.6, 0.45, -2.2];
const DIVE_TO = new THREE.Vector3(0, 0, 5.15);   // just in front of the camera (z 6): the rings pass outside the view

export function createCores(ctx) {
  const group = new THREE.Group();
  group.name = 'cores';
  const glowTex = glowTexture();
  const cores = CORES.map((def) => {
    const tint = new THREE.Color(def.tint), light = tint.clone().lerp(new THREE.Color(1, 1, 1), 0.35);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, premultipliedAlpha: true,
      uniforms: {
        uTime: { value: 0 }, uView: { value: 0 }, uAlpha: { value: 1 }, uTint: { value: tint }, uLight: { value: light },
        uAng0: { value: 0 }, uAng1: { value: 0 }, uAng2: { value: 0 }, uAng3: { value: 0 }
      }
    });
    const lines = new THREE.LineSegments(buildArcs(def.seed), mat);
    lines.frustumCulled = false;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: light, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    glow.scale.setScalar(1.9);
    // motes: a loose cloud of points drifting round the core
    const R = rng(def.seed ^ 0x9e37), n = 220, mp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1), r = 1.1 + R() * 0.9;
      mp[i * 3] = r * Math.sin(ph) * Math.cos(th); mp[i * 3 + 1] = r * Math.cos(ph); mp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: light, size: 0.018, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: true }));
    const node = new THREE.Group();
    node.add(lines, glow, motes);
    group.add(node);
    return { def, node, lines, glow, motes, mat, angles: [0, 0, 0, 0], hover: 0, hot: false };
  });

  const target = new THREE.Vector3();
  /* state: time, dt, reveal (0..1 as the world collapses into them), leave (0..1 toward the ending), radius */
  function update(s) {
    const stacked = ctx.aspect < 0.9;
    cores.forEach((c, i) => {
      const side = i === 0 ? -1 : 1;
      if (stacked) target.set(0, side * -0.95 * s.radius * 1.3, 0);
      else target.set(side * 1.25 * s.radius * 1.5, 0, 0);
      target.y += Math.sin(s.time * 0.5 + i * 2.1) * 0.03 * s.radius;
      // on the way to the ending (Robin, 2026-10-26, after igloo.inc's ring fly-through) the camera dives into
      // J.A.R.V.I.S.'s core: it slides to the centre and rushes at the lens until its rings pass around the view and
      // its bright centre covers the switch; E.V.'s core drifts away to its side
      const dive = i === 0 ? ease(s.leave) : 0;   // the ring gate (ringgate.js) comes at the end of the dive
      if (i === 0) {
        target.lerp(DIVE_TO, Math.pow(dive, 1.6));
      } else {
        target.y += s.leave * s.leave * side * 2.2;
        target.x += s.leave * side * 1.2;
        target.z += s.leave * 1.5;
      }
      c.node.position.copy(target);
      const pop = 0.25 + 0.75 * ease(s.reveal);
      c.hover += ((c.hot ? 1 : 0) - c.hover) * Math.min(1, s.dt * 6);
      c.node.scale.setScalar(s.radius * pop * (1 + 0.06 * c.hover + (i === 0 ? dive * 1.4 : s.leave * 0.4)));
      for (let k = 0; k < 4; k++) c.angles[k] += SPEEDS[k] * 0.22 * s.dt * (1 + 1.5 * c.hover);
      const u = c.mat.uniforms;
      u.uTime.value = s.time; u.uView.value = s.time * 0.05;
      u.uAng0.value = c.angles[0]; u.uAng1.value = c.angles[1]; u.uAng2.value = c.angles[2]; u.uAng3.value = c.angles[3];
      // the diving core's rings stay bright until the camera is inside them; its glow sprite eases off, since at that
      // range it would fill the view
      const fadeOut = i === 0 ? 1 - ease((s.leave - 0.88) / 0.12) : 1 - s.leave;
      const alpha = ease(s.reveal) * fadeOut * (1 + 0.5 * c.hover + (i === 0 ? s.leave * 0.8 : 0));
      u.uAlpha.value = alpha;
      const breath = 0.5 + 0.5 * Math.sin(s.time * Math.PI / 2 + i);
      c.glow.material.opacity = Math.min(0.8, (0.35 + 0.2 * breath + 0.25 * c.hover) * alpha * (1 - dive));
      c.motes.material.opacity = 0.5 * alpha;
      c.motes.rotation.y = s.time * 0.08;
      c.motes.rotation.x = s.time * 0.03;
    });
  }
  function ease(t) { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }
  function worldPos(i, out) { return cores[i].node.getWorldPosition(out); }
  function worldRadius(i) { return cores[i].node.scale.x; }
  function setHot(i, on) { cores[i].hot = on; }

  return { group, update, worldPos, worldRadius, setHot, cores };
}
