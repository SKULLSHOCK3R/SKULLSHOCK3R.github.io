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
    uSmear: { value: 0 }, uAberr: { value: 0.12 }, uWhite: { value: 0 }, uGrain: { value: 0.045 }, uVignette: { value: 0.55 }, uFade: { value: 0 }
  },
  vertexShader: /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;uniform vec2 uRes;uniform float uTime,uSmear,uAberr,uWhite,uGrain,uVignette,uFade;
varying vec2 vUv;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
void main(){
 vec2 uv=vUv;vec2 c=uv-.5;float r=length(c);vec2 dir=c/max(r,1e-4);
 float ab=(.0012+.012*r*r)*uAberr+.03*r*uSmear;
 vec3 col;
 if(uSmear<.004){
  col=vec3(texture2D(tDiffuse,uv+dir*ab).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-dir*ab).b);
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
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.6, 0.8);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  function setSize(w, h, dpr) {
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    bloom.resolution.set(Math.round(w * dpr / 2), Math.round(h * dpr / 2));
    grade.uniforms.uRes.value.set(w * dpr, h * dpr);
  }
  return { composer, bloom, grade: grade.uniforms, setSize };
}
