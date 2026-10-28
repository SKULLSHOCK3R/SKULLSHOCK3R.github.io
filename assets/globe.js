/* The world as a globe of baked ice-stone blocks (block.glb instanced about 2,900 times on desktop, 1,650 on phones),
   tinted per block from our map (world.js). Placement is done in the vertex shader through onBeforeCompile on the
   glb's own MeshStandardMaterial, so the blocks keep their baked colour, normal, roughness and occlusion maps:
     uPart      0..1  blocks lift off along their normals and tumble a little, with glowing seams (igloo-style parting)
     uCollapse  0..1  blocks spiral into the two AI cores and shrink away
   The instance matrices stay identity; the group handles spin, tilt, position and size. */
import * as THREE from 'three';
import { buildWorld, LABELS } from './world.js?v=3';
import { ROT } from './glsl.js?v=3';

const VERT_HEAD = /* glsl */`
attribute vec3 aHome;attribute vec3 aSize;attribute vec4 aRand;attribute float aCore;
uniform float uPart,uCollapse,uDist,uPtrAmt,uBreath,uHover;uniform vec3 uCoreA,uCoreB,uPtr;
varying float vLift;varying vec3 vLocal;varying float vRad,vFace,vH;
mat3 gM;vec3 gPos;float gShrink;
${ROT}
void blockFrame(){
 vec3 n=normalize(aHome);vec3 up=abs(n.y)<.99?vec3(0.,1.,0.):vec3(1.,0.,0.);
 vec3 tx=normalize(cross(up,n));mat3 B=mat3(tx,cross(n,tx),n);
 // parting like igloo.inc's igloo (Robin, 2026-10-26): the shell opens evenly by a small amount, blocks keep their
 // orientation (only a slight tilt), and the light core inside shows through the widening seams
 float e=smoothstep(aRand.x*.6,aRand.x*.6+.5,uPart);
 // cursor: blocks under the pointer lift and tumble a little, then settle back as uPtrAmt eases off
 float pd=distance(n,uPtr);float push=uPtrAmt*exp(-pd*pd/.045)*(.6+.8*aRand.z);
 // breathing at rest, like igloo.inc's igloo (Robin, 2026-10-26): the shell opens a little and closes again, the
 // upper blocks lifting most and tilting slightly; geometry only, no extra glow
 float br=uBreath*(.25+.75*smoothstep(-.4,1.,n.y))*(.7+.6*aRand.z);
 // hover, as igloo.inc's igloo does under the cursor (Robin, 2026-10-26: "look at how the igloo comes apart with the
 // cursor"): while the cursor is over the globe the whole shell eases open, every block moving out and tilting at
 // random, the ones nearest the cursor most; it settles shut when the cursor leaves (uHover eases in globe.update)
 // (concentrated round the cursor: with ~2,900 small blocks, the whole shell tilting at once lit up as one white ball)
 float hv=uHover*(.1+.9*exp(-pd*pd/.1))*(.7+.6*aRand.w);
 mat3 R=rotAxis(normalize(aRand.yzw-.5+.001),e*.14*(aRand.y-.5)+push*.6+br*.12*(aRand.x-.5)+hv*1.0*(aRand.y-.5));
 // (each block a different distance out and a clear tilt, so the shell breaks up like igloo's rather than swelling
 // evenly as a lit grid)
 vec3 pos=aHome*(1.+e*uDist*(.16+.14*aRand.z)+br*.07+hv*(.03+.38*aRand.z*aRand.z))+n*push*.15+vec3(0.,1.,0.)*br*.05;
 float c=smoothstep(aRand.x*.5,aRand.x*.5+.5,uCollapse);
 vec3 target=aCore<.5?uCoreA:uCoreB;
 vec3 toT=target-pos;
 vec3 swirl=normalize(cross(toT,vec3(0.,1.,0.))+vec3(.001,0.,.002));
 vec3 cp=pos+toT*c+swirl*sin(c*3.14159)*(.3+.5*aRand.z)*length(toT)*.45;
 gShrink=1.-smoothstep(.5,1.,c);
 // (Robin, 2026-10-26: "the mouse hovering over it does nothing") blocks the cursor lifts light up like parting ones
 gM=B*R;gPos=cp;vLift=max(max(e,c),min(1.,max(max(push*4.,(hv-.15)*6.),(br-.08)*4.)));/* breathing shows the light too (Robin, 2026-10-26) */vLocal=position/vec3(.5,.31,.31);}
`;
const VERT_NORMAL = /* glsl */`
blockFrame();
vec3 objectNormal=gM*normal;
#ifdef USE_TANGENT
vec3 objectTangent=gM*tangent.xyz;
#endif
`;
const VERT_POS = /* glsl */`
vec3 transformed=gPos+gM*(position*aSize)*gShrink;
// for the blue light inside the shell: this point's radius (1 = the block's home centre), which way its face points
// (1 outward, -1 toward the centre, 0 a side), and the block's half thickness in the same units
{float hr=length(aHome);vRad=length(transformed)/hr;vFace=dot(normalize(objectNormal),normalize(transformed));
 vH=.31*aSize.z/hr;}
`;
const FRAG_HEAD = /* glsl */`
uniform vec3 uSeam;uniform float uSeamAmt;varying float vLift;varying vec3 vLocal;varying float vRad,vFace,vH;
`;
const FRAG_EMISSIVE = /* glsl */`
#include <emissivemap_fragment>
{// (Robin, 2026-10-26, after glowing faces, an inner light sheet and lit-ice blocks were all wrong: "make the individual faces that dont face the outside of the sphere a light source for blue
 // light. Let the outer surface be what you had with the high textures"): every face not turned outward (the sides
 // and the back) is a solid blue light; the outer face is the scanned stone alone, with no glow
 // (Robin, 2026-10-26: the seams and gaps must not glow) dark while the globe is whole or breathing; full brightness
 // the moment a block starts to come apart, with no ramp ("dont ramp it up")
 float notOuter=(1.-smoothstep(.55,.8,vFace))*smoothstep(.005,.03,vLift);
 if(notOuter>0.){diffuseColor.rgb*=1.-notOuter;
  totalEmissiveRadiance+=vec3(.15,.45,1.)*2.05*notOuter;}}   // (Robin, 2026-10-26: keep the light, a bit less bright than 2.6;
                                                    // 1.7 hid the textured faces in the bloom, 1.1 read as paint)
`;

export async function createGlobe(ctx, loader) {
  const gltf = await loader.loadAsync('assets/models/block.glb?v=3');   // 2048 bake, bolder detail (2026-10-26)
  let srcGeo = null, mat = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !srcGeo) { srcGeo = o.geometry; mat = o.material; } });
  const world = buildWorld(ctx.phone ? 36 : 48);
  const geo = srcGeo.clone();
  geo.setAttribute('aHome', new THREE.InstancedBufferAttribute(world.home, 3));
  geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(world.size, 3));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(world.rand, 4));
  geo.setAttribute('aCore', new THREE.InstancedBufferAttribute(world.core, 1));

  const U = {
    uPart: { value: 0 }, uCollapse: { value: 0 }, uDist: { value: 1.0 },
    uCoreA: { value: new THREE.Vector3(-1.5, 0, 0) }, uCoreB: { value: new THREE.Vector3(1.5, 0, 0) },
    uSeam: { value: new THREE.Color(0.45, 0.7, 1.0) }, uSeamAmt: { value: 0 },
    uPtr: { value: new THREE.Vector3(0, 0, 1) }, uPtrAmt: { value: 0 }, uBreath: { value: 0 }, uHover: { value: 0 }
  };
  mat.metalness = 0;
  mat.roughness = 0.85;   // a little sheen over the scanned roughness, so the storm light shows in the ice
  // image-based light from a 360 degree render of the same Blender storm as the opening plate (asset-src/render_plate.py
  // in "pano" mode): reflections and soft fill that match the sky behind the globe
  try {
    const env = await new THREE.TextureLoader().loadAsync('assets/env/storm-pano.jpg');
    env.mapping = THREE.EquirectangularReflectionMapping;
    env.colorSpace = THREE.SRGBColorSpace;
    mat.envMap = env;
    mat.envMapIntensity = 1.8;   // (Robin, 2026-10-26: the photoreal pass at 1.25 left the globe dim)
    mat.envMapRotation.set(0, Math.PI / 2, 0);   // the panorama's lit cloud bank toward the viewer's side
  } catch (e) { /* the globe still renders with the scene lights alone */ }
  mat.fog = false;   // the scene fog is for the chamber floor only
  mat.aoMapIntensity = 1;
  mat.normalScale.set(2.2, 2.2);   // the scanned relief shows at the bricks' on-screen size
  mat.emissive = new THREE.Color(0, 0, 0);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', VERT_POS);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => 'globe-blocks';

  const mesh = new THREE.InstancedMesh(geo, mat, world.count);
  const id = new THREE.Matrix4(), col = new THREE.Color();
  // photoreal (Robin, 2026-10-26): the map colours muted toward natural ice and stone, and each brick's shade varied a
  // little, so the bricks read as real material rather than painted plastic
  for (let i = 0; i < world.count; i++) {
    mesh.setMatrixAt(i, id);
    col.setRGB(world.color[i * 3], world.color[i * 3 + 1], world.color[i * 3 + 2], THREE.LinearSRGBColorSpace);
    const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    col.lerp(new THREE.Color(lum, lum, lum * 1.08), 0.3).multiplyScalar(1.0 + 0.3 * world.rand[i * 4 + 1]);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'globe';
  group.rotation.order = 'XYZ';
  group.rotation.x = 0.36;
  group.add(mesh);
  // the light within: a bright core just inside the shell (hidden until the seams open; bloom spreads it) and a point
  // light at the centre that catches the inner faces and edges of the blocks
  const coreGlow = new THREE.Mesh(new THREE.SphereGeometry(0.84, 48, 32), new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 2.5, 3.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false
  }));
  const innerLight = new THREE.PointLight(0xd6e6ff, 0, 0, 2);
  group.add(coreGlow, innerLight);

  const anchorsLocal = LABELS.map((L, k) => {
    const i = world.anchors[k], n = new THREE.Vector3(world.home[i * 3], world.home[i * 3 + 1], world.home[i * 3 + 2]);
    return { name: L.name, gold: !!L.gold, home: n.clone(), n: n.normalize(), rand: [world.rand[i * 4], world.rand[i * 4 + 2]] };
  });
  const tmp = new THREE.Vector3();
  const inv = new THREE.Matrix4(), localRay = new THREE.Ray(), unitSphere = new THREE.Sphere(new THREE.Vector3(), 1.02), hit = new THREE.Vector3();
  let lastHit = null;

  /* state: time, dt, part, collapse, position (Vector3), radius, coreA/coreB world positions, flash,
     ray (the pointer's world ray, or null) */
  function update(s) {
    group.position.copy(s.position);
    group.scale.setScalar(s.radius);
    group.rotation.y = s.time * 0.1 + s.part * 0.6 + s.collapse * 1.2;
    group.updateMatrixWorld();
    // the cursor disturbs the blocks it passes over: the push grows with pointer speed and eases off over ~2 s
    let kick = 0;
    if (s.ray) {
      inv.copy(group.matrixWorld).invert();
      localRay.copy(s.ray).applyMatrix4(inv);
      if (localRay.intersectSphere(unitSphere, hit)) {
        hit.normalize();
        // a resting cursor still holds a small lift; moving it pushes harder
        kick = Math.max(0.35, lastHit ? Math.min(1, hit.distanceTo(lastHit) / Math.max(s.dt, 0.004) * 0.6) : 0);
        U.uPtr.value.lerp(hit, 1 - Math.exp(-s.dt * 18)).normalize();
        lastHit = (lastHit || new THREE.Vector3()).copy(hit);
      } else lastHit = null;
    } else lastHit = null;
    U.uPtrAmt.value = Math.max(U.uPtrAmt.value * Math.exp(-s.dt * 1.6), kick) * (1 - s.collapse);
    // the shell eases open over about 1.5 s while the cursor is on it, and shut over about 2 s after it leaves
    const over = lastHit !== null && s.collapse < 0.05 ? 1 : 0;
    U.uHover.value += (over - U.uHover.value) * (1 - Math.exp(-s.dt * (over ? 1.6 : 1.2)));
    U.uPart.value = s.part;
    U.uCollapse.value = s.collapse;
    // breath: opens and closes every 4.5 s, then rests a moment (igloo's rhythm), only while the globe is whole
    const ph = (s.time % 4.5) / 4.5, swell = Math.pow(Math.sin(Math.PI * Math.min(1, ph / 0.7)), 2);
    U.uBreath.value = swell * (1 - Math.min(1, s.part * 4)) * (1 - s.collapse);
    group.worldToLocal(U.uCoreA.value.copy(s.coreA));
    group.worldToLocal(U.uCoreB.value.copy(s.coreB));
    // seams: a faint glow even when closed, bright white-blue while parting, warming toward the cores while collapsing
    U.uSeam.value.setRGB(0.75 + 0.25 * s.collapse, 0.88 - 0.2 * s.collapse, 1.0 - 0.3 * s.collapse);
    U.uSeamAmt.value = (0.12 + Math.min(1, s.part * 1.6) * 1.5 + s.collapse * 0.8 + s.flash * 0.25) * (1 - smooth(0.93, 1, s.collapse));
    // the light within rises as the shell opens and fades as the blocks leave for the cores
    const within = (0.08 + 0.92 * smooth(0.02, 0.55, s.part)) * (1 - smooth(0.15, 0.7, s.collapse));
    // no central glow (Robin, 2026-10-26: "remove the central glow ... make the inner surfaces of the cubes glow"):
    // the light is the blocks' own inner faces (FRAG_EMISSIVE)
    coreGlow.visible = false;
    innerLight.intensity = 0;
    void within;
    mesh.visible = s.collapse < 0.995;
    // how brightly the globe shines right now (its inner faces show as the shell opens: breathing, hover, parting),
    // for its light in the water and on Luffy (Robin, 2026-10-27: "only when the globe lights up")
    light = Math.max(smooth(0.08, 0.4, U.uBreath.value), U.uHover.value, Math.min(1, s.part * 1.6)) * (1 - s.collapse);
  }
  let light = 0;
  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  /* World positions of the label anchors for the parted globe (the same lift as the shader). */
  function anchors(part) {
    return anchorsLocal.map((a) => {
      const e = smooth(a.rand[0] * 0.6, a.rand[0] * 0.6 + 0.5, part);
      tmp.copy(a.home).multiplyScalar(1 + e * U.uDist.value * (0.16 + 0.14 * a.rand[1])).addScaledVector(a.n, 0.08);
      return { name: a.name, gold: a.gold, world: group.localToWorld(tmp.clone()) };
    });
  }

  return { group, update, anchors, count: world.count, labels: LABELS, get light() { return light; } };
}
