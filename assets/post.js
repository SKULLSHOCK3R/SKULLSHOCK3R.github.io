/* Post-processing chain: render, bloom, tone mapping and sRGB (OutputPass), then our grade pass: radial chromatic
   aberration and smear (masks every scene change, igloo-style), film grain, vignette, whiteout and the load fade. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uSmear: { value: 0 }, uAberr: { value: 0.12 }, uWhite: { value: 0 }, uGrain: { value: 0.045 }, uVignette: { value: 0.55 }, uFade: { value: 0 },
    uSharp: { value: 0 }
  },
  vertexShader: /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;uniform vec2 uRes;uniform float uTime,uSmear,uAberr,uWhite,uGrain,uVignette,uFade,uSharp;
varying vec2 vUv;
// contrast-adaptive sharpening (after AMD FidelityFX CAS): when the page draws below the screen's own resolution
// (uSharp > 0), edges regain the contrast the browser's stretch to the screen takes away; flat and already-sharp areas
// are left nearly as they are
vec3 casDelta(vec2 uv){
 vec2 px=1./uRes;
 vec3 e=texture2D(tDiffuse,uv).rgb,b=texture2D(tDiffuse,uv-vec2(0.,px.y)).rgb,d=texture2D(tDiffuse,uv-vec2(px.x,0.)).rgb,
      f=texture2D(tDiffuse,uv+vec2(px.x,0.)).rgb,h=texture2D(tDiffuse,uv+vec2(0.,px.y)).rgb;
 vec3 mn=min(e,min(min(b,d),min(f,h))),mx=max(e,max(max(b,d),max(f,h)));
 vec3 amp=sqrt(clamp(min(mn,1.-mx)/max(mx,vec3(1e-4)),0.,1.));
 vec3 w=-amp*mix(.125,.2,uSharp);
 return ((b+d+f+h)*w+e)/(1.+4.*w)-e;}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
 vec2 uv=vUv;vec2 c=uv-.5;float r=length(c);vec2 dir=c/max(r,1e-4);
 float ab=(.0012+.012*r*r)*uAberr+.03*r*uSmear;
 vec3 col;
 if(uSmear<.004){
  col=vec3(texture2D(tDiffuse,uv+dir*ab).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-dir*ab).b);
  if(uSharp>0.)col=clamp(col+casDelta(uv),0.,1.);   // none while a scene change smears the picture anyway
 }else{
  col=vec3(0.);float sm=uSmear*.16*r;
  for(int i=0;i<7;i++){float f=(float(i)/6.-.5);vec2 o=dir*sm*f;
   col+=vec3(texture2D(tDiffuse,uv+o+dir*ab).r,texture2D(tDiffuse,uv+o).g,texture2D(tDiffuse,uv+o-dir*ab).b);}
  col/=7.;
 }
 float l=dot(col,vec3(.299,.587,.114));
 float g=hash(gl_FragCoord.xy+vec2(fract(uTime*13.7)*311.,fract(uTime*7.3)*197.))-.5;
 col+=g*uGrain*(.35+.65*(1.-l));
 col*=1.-uVignette*smoothstep(.3,1.15,r);
 col=mix(col,vec3(.94,.96,1.),uWhite);
 col*=uFade;
 gl_FragColor=vec4(col,1.);}`
};

export function createPost(renderer, scene, camera) {
  // multisampled (2026-11-12: the globe's edges looked jagged; antialiased like the rest of the models): the scene, the globe's blocks among it, is drawn into a 4x multisampled half-float target, as
  // the baked figures' frame is; ?msaa=0 to compare
  const ms = new URLSearchParams(location.search).get('msaa');
  const samples = ms === null ? 4 : Math.max(0, parseInt(ms, 10) || 0);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.6, 0.8);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  const noSharp = new URLSearchParams(location.search).get('sharp') === '0';
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  function setSize(w, h, dpr) {
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.resolution.set(Math.round(w * dpr / 2), Math.round(h * dpr / 2));
    grade.uniforms.uRes.value.set(w * dpr, h * dpr);
    // sharpening only when drawing below the screen's own pixel ratio, stronger the further below (?sharp=0 to compare)
    const under = (window.devicePixelRatio || 1) / dpr - 1;
    grade.uniforms.uSharp.value = noSharp ? 0 : Math.min(1, Math.max(0, under * 1.5));
  }
  return { composer, bloom, grade: grade.uniforms, setSize };
}
