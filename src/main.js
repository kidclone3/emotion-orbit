import * as THREE from 'three'
import './style.css'
import { analyzeEmotionMessage, EMOTIONS, EMOTION_ORDER } from './emotions.js'
import { DragOrbitController } from './drag-controller.js'
import { createPiChatClient } from './pi-chat.js'
import { createOrbitalDustField, createOrganicFormGeometry, createOrbitPath } from './orbit-system.js'

const app = document.querySelector('#app')
app.innerHTML = `
<main class="experience" data-emotion="wonder">
  <header class="topbar">
    <a class="brand" href="#" aria-label="Emotion Orbit home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>EMOTION ORBIT</span>
    </a>
    <div class="plate-index" aria-hidden="true"><span>FIELD</span><b>001</b><i>↗</i></div>
    <div class="status" id="bridge-status" aria-live="polite">
      <span class="status-dot" id="bridge-dot" aria-hidden="true"></span>
      <span>Pi connecting</span>
    </div>
  </header>
  <section class="copy" aria-labelledby="main-title">
    <p class="eyebrow">AFFECTIVE STUDY / 001</p>
    <h1 id="main-title">Emotion<br><em>in orbit.</em></h1>
    <p class="intro" id="emotion-copy">${EMOTIONS.wonder.copy}</p>
    <section class="chat-panel" aria-label="Conversation with Pi">
      <div class="chat-log" id="chat-log" role="log" aria-live="off">
        <article class="chat-message is-assistant"><span>Pi</span><p>What is moving through you?</p></article>
      </div>
      <form class="mood-form" id="chat-form">
        <label class="sr-only" for="chat-input">Message Pi</label>
        <div class="input-row">
          <textarea id="chat-input" name="message" rows="1" maxlength="2000" placeholder="Type a feeling…" required></textarea>
          <button type="submit" aria-label="Send message to Pi"><span>Send</span><span aria-hidden="true">↗</span></button>
        </div>
        <p class="form-note" id="form-note" role="status" aria-live="polite">Connecting…</p>
      </form>
    </section>
  </section>
  <div class="scene-wrap" id="scene-wrap" aria-label="Interactive three-dimensional emotional moon and orbiting forms. Drag to shift the orbit, tap to pulse, or press Enter or Space." tabindex="0">
    <div class="scene" id="scene"></div>
    <div class="scene-caption" aria-hidden="true"><span id="emotion-number">04</span><span class="caption-line"></span><span id="emotion-name">Wonder</span></div>
    <div class="interaction-hint" aria-hidden="true"><span>DRAG / ORBIT · TAP / PULSE</span><i></i></div>
  </div>
  <nav class="emotion-nav" aria-label="Select an emotional state">
    ${EMOTION_ORDER.map((key) => `
      <button class="emotion-button${key === 'wonder' ? ' is-active' : ''}" type="button" data-emotion="${key}" aria-pressed="${key === 'wonder'}" style="--swatch:${EMOTIONS[key].primary}">
        <span class="emotion-index">${EMOTIONS[key].number}</span><span>${EMOTIONS[key].label}</span>
      </button>`).join('')}
  </nav>
  <footer class="footer"><p>EVERY FEELING CHANGES THE FIELD</p><div class="meter"><span id="fps">60</span> FPS</div></footer>
  <div class="grain" aria-hidden="true"></div>
  <p class="sr-only" id="emotion-announcement" aria-live="polite"></p>
</main>`

const $ = (selector) => document.querySelector(selector)
const experience = $('.experience')
const sceneMount = $('#scene')
const sceneWrap = $('#scene-wrap')
const emotionCopy = $('#emotion-copy')
const emotionNumber = $('#emotion-number')
const emotionName = $('#emotion-name')
const announcement = $('#emotion-announcement')
const formNote = $('#form-note')
const chatForm = $('#chat-form')
const chatInput = $('#chat-input')
const chatLog = $('#chat-log')
const chatSubmit = chatForm.querySelector('button')
const bridgeStatus = $('#bridge-status span:last-child')
const bridgeDot = $('#bridge-dot')
const fpsOutput = $('#fps')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
if (new URLSearchParams(location.search).get('view') === 'no-post') experience.dataset.view = 'no-post'
const dragOrbit = new DragOrbitController({
  sensitivity: reduceMotion ? .0012 : .0025, damping: reduceMotion ? 10 : 6, maxPitch: .14
})
let renderer
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, powerPreference: 'high-performance'
  })
}
catch (error) {
  sceneMount.innerHTML = '<p class="webgl-error">This experience needs WebGL. Try enabling hardware acceleration.</p>';
  throw error
}
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1
renderer.setClearColor(0x050606, 0)
sceneMount.append(renderer.domElement)
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(36, 1, .1, 80)
camera.position.z = 9.2
const field = new THREE.Group(), orbitStage = new THREE.Group()
field.add(orbitStage);
scene.add(field)
const state = {
  time:{
    value:0
  }, energy:{
    value:EMOTIONS.wonder.energy
  }, turbulence:{
    value:EMOTIONS.wonder.turbulence
  }, burst:{
    value:0
  }, primary:{
    value:new THREE.Color(EMOTIONS.wonder.primary)
  }, accent:{
    value:new THREE.Color(EMOTIONS.wonder.accent)
  }, glow:{
    value:new THREE.Color(EMOTIONS.wonder.glow)
  }, shape:{
    value:EMOTIONS.wonder.shape
  }, particleSize:{
    value:EMOTIONS.wonder.particleSize
  }
}
const moonMaterial = new THREE.ShaderMaterial({
  uniforms: state,
  vertexShader: `
    uniform float time, energy, turbulence, burst, shape;
    varying vec3 vNormal, vWorld, vView;
    void main() {
      vec3 p = position;
      float broad = sin(p.x * 2.1 + p.y * 1.7 + time * (.1 + turbulence * .035)) * cos(p.z * 2.4 - time * .08);
      float fine = sin(p.y * 8.2 - time * (.14 + turbulence * .08) + sin(p.x * 4.1)) * .5 + .5;
      float breath = sin(time * (.32 + energy * .2)) * (.007 + energy * .004) + burst * .018;
      p.y *= 1. + shape * .018;
      p.xz *= 1. - shape * .009;
      p += normal * (broad * turbulence * .006 + fine * turbulence * .0018 + breath);
      vec4 world = modelMatrix * vec4(p, 1.);
      vec4 view = viewMatrix * world;
      vNormal = normalize(normalMatrix * normal);
      vWorld = world.xyz;
      vView = -view.xyz;
      gl_Position = projectionMatrix * view;
    }`,
  fragmentShader: `
    precision highp float;
    uniform float time, energy, turbulence, burst;
    uniform vec3 primary, accent, glow;
    varying vec3 vNormal, vWorld, vView;
    float hash(vec3 p) {
      p = fract(p * .3183099 + .1);
      p *= 17.;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3. - 2. * f);
      return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y), mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) {
      float n = 0., a = .55;
      for (int i = 0; i < 3; i++) { n += noise(p) * a; p = p * 2.03 + 1.7; a *= .48; }
      return n;
    }
    void main() {
      vec3 n = normalize(vNormal), view = normalize(vView), ld = normalize(vec3(-.38,.55,.72));
      float diffuse = max(dot(n, ld), 0.), facing = max(dot(n, view), 0.), limb = smoothstep(.02, .62, facing);
      vec3 flow = vec3(time * (.018 + turbulence * .012), -time * .011, time * .007);
      float macro = fbm(normalize(vWorld) * 2.8 + vec3(7.1) + flow);
      float detail = noise(vWorld * 8.5 + vec3(3.7) + flow * 2.) * .62 + noise(vWorld * 19.1 + vec3(1.9) - flow * 3.) * .38;
      float warp = noise(vWorld * 3.1 + flow * 4.);
      float veinA = abs(sin(vWorld.y * 10.5 + vWorld.x * 3.7 + warp * 10. - time * (.08 + turbulence * .08)));
      float veinB = abs(sin(vWorld.x * 8.2 - vWorld.z * 6.4 + warp * 7. + time * .045));
      float veins = smoothstep(.86, .99, max(veinA, veinB * .76)) * turbulence;
      float micro = hash(floor(vWorld * 28. + vec3(2.4)));
      float craters = smoothstep(.37, .82, abs(macro - .53) * 2. + detail * .34);
      float paper = (hash(floor(gl_FragCoord.xyz * vec3(.55,.55,1.)) + floor(time * .7)) - .5) * .075;
      float value = (.24 + diffuse * .66) * limb;
      value *= .72 + macro * .35 + detail * .16 + micro * .08 - craters * .15 + veins * .045;
      value += paper + burst * .035;
      vec3 tint = mix(primary, accent, macro);
      float shadow = 1. - smoothstep(.08, .58, diffuse);
      float midtone = smoothstep(.12, .68, diffuse) * (1. - smoothstep(.68, 1., diffuse));
      float rim = pow(1. - facing, 2.4);
      vec3 color = vec3(value);
      color = mix(color, color * (.52 + tint * .82), shadow * (.42 + energy * .08));
      color += tint * midtone * (.105 + energy * .035);
      color += mix(glow, accent, .42) * rim * (.18 + energy * .07 + burst * .12);
      color += mix(primary, accent, .72) * veins * (.055 + energy * .018);
      color *= mix(.5, 1., limb);
      gl_FragColor = vec4(color, 1.);
    }`
})
const moon = new THREE.Mesh(new THREE.SphereGeometry(2.02,96,64),moonMaterial)
moon.scale.set(1,1.015,1);
moon.renderOrder=2;
field.add(moon)

function createMoonAuraMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: state,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    vertexShader: `
      uniform float time, energy, burst, shape;
      varying vec3 vNormal, vView, vPosition;
      void main() {
        vec3 p = position;
        p.y *= 1. + shape * .018;
        p.xz *= 1. - shape * .009;
        p += normal * (sin(time * (.3 + energy * .12)) * .006 + burst * .018);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vNormal = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        vPosition = p;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 primary, accent, glow;
      uniform float time, energy, turbulence, burst;
      varying vec3 vNormal, vView, vPosition;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float softRim = pow(1. - facing, 2.2);
        float sharpRim = pow(1. - facing, 5.4);
        float flicker = .94 + sin(facing * 31. + turbulence * 4.) * .06;
        float irregular = .76 + sin(vPosition.y * 8. + vPosition.x * 3. - time * .08) * .14
          + sin(vPosition.x * 13. - vPosition.z * 7. + time * .05) * .1;
        vec3 color = mix(glow, mix(primary, accent, .42), .58);
        float alpha = softRim * (.055 + energy * .025 + burst * .035)
          + sharpRim * (.19 + energy * .035 + burst * .1);
        alpha *= flicker * irregular;
        gl_FragColor = vec4(color, alpha);
      }`
  })
}

const shell = new THREE.Mesh(
  new THREE.SphereGeometry(2.095,64,44),
  createMoonAuraMaterial()
)
shell.renderOrder=3
field.add(shell)

function makeHaloTexture(){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=192;
  const context=canvas.getContext('2d'),gradient=context.createRadialGradient(96,96,18,96,96,96);
  gradient.addColorStop(0,'rgba(255,255,255,.3)');
  gradient.addColorStop(.45,'rgba(255,255,255,.1)');
  gradient.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle=gradient;
  context.fillRect(0,0,192,192);
  return new THREE.CanvasTexture(canvas)
}
const haloMaterial=new THREE.SpriteMaterial({
  map:makeHaloTexture(),color:EMOTIONS.wonder.glow,transparent:true,opacity:.16,
  blending:THREE.AdditiveBlending,depthWrite:false
})
const halo=new THREE.Sprite(haloMaterial)
halo.scale.setScalar(5.35)
halo.renderOrder=0
field.add(halo)

const dustData=createOrbitalDustField({count:innerWidth<700?520:980})
const dustGeometry=new THREE.BufferGeometry()
dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustData.positions,3))
dustGeometry.setAttribute('aRadius',new THREE.BufferAttribute(dustData.radii,1))
dustGeometry.setAttribute('aSeed',new THREE.BufferAttribute(dustData.seeds,1))
const dustMaterial=new THREE.ShaderMaterial({
  uniforms:{...state,orbitSpeed:{value:EMOTIONS.wonder.orbitSpeed}},
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`
    attribute float aRadius, aSeed;
    uniform float time, energy, burst, particleSize, orbitSpeed;
    varying float vSeed, vDepth;
    void main(){
      vec3 p=position;
      float direction=step(.48,aSeed)*2.-1.;
      float angle=time*orbitSpeed*(.16+.2*(1.-smoothstep(2.18,4.75,aRadius)))*direction*(.7+aSeed*.5);
      float c=cos(angle),s=sin(angle);
      p.xz=mat2(c,-s,s,c)*p.xz;
      p.y+=sin(time*(.18+orbitSpeed*.45)+aSeed*19.)*(.025+energy*.018)+burst*.08*sin(aSeed*31.);
      p*=1.+burst*(.008+aSeed*.012);
      vec4 mv=modelViewMatrix*vec4(p,1.);
      gl_PointSize=(particleSize*(.18+aSeed*.16)+burst*.45)*(24./max(2.,-mv.z));
      gl_Position=projectionMatrix*mv;
      vSeed=aSeed;
      vDepth=smoothstep(4.75,2.18,aRadius);
    }`,
  fragmentShader:`
    precision highp float;
    uniform vec3 primary,accent,glow;
    uniform float energy;
    varying float vSeed,vDepth;
    void main(){
      float d=length(gl_PointCoord-.5);
      float alpha=smoothstep(.5,.08,d)*(.13+energy*.045+vDepth*.12);
      vec3 color=mix(primary,accent,vSeed);
      color=mix(color,glow,.22+vDepth*.22);
      gl_FragColor=vec4(color,alpha);
    }`
})
const dust=new THREE.Points(dustGeometry,dustMaterial)
dust.rotation.set(.28,.08,-.12)
dust.renderOrder=1
field.add(dust)
const orbitDefs=[
{
  radiusX:4.45,radiusY:1.72,inclination:.18,yaw:.12,phase:.2,speed:.043,opacity:.48
},{
  radiusX:4.7,radiusY:2.15,inclination:.72,yaw:-.22,phase:1.1,speed:-.032,opacity:.38
},{
  radiusX:4.12,radiusY:2.78,inclination:-.58,yaw:.28,phase:2.4,speed:.027,opacity:.42
},{
  radiusX:5.02,radiusY:1.4,inclination:1.02,yaw:-.48,phase:.7,speed:-.022,opacity:.22
},{
  radiusX:3.86,radiusY:2.35,inclination:.45,yaw:.68,phase:1.8,speed:.037,opacity:.2
},{
  radiusX:4.72,radiusY:2.62,inclination:-.92,yaw:-.13,phase:2.9,speed:-.018,opacity:.18
},{
  radiusX:4.28,radiusY:1.92,inclination:.82,yaw:.5,phase:3.4,speed:.024,opacity:.2
}
]
const orbitLines=orbitDefs.map((d,i)=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(createOrbitPath({
    ...d,segments:320
  }),3));
  const m=new THREE.LineBasicMaterial({
    color:i===6?0xb8c64b:0xd9dad3,transparent:true,opacity:d.opacity,depthTest:true,depthWrite:false
  });
  const line=new THREE.LineLoop(g,m);
  line.renderOrder=1;
  orbitStage.add(line);
  return{
    line,speed:d.speed
  }
})
function organicMaterial(seed){
  return new THREE.ShaderMaterial({
    uniforms:{
      ...state,seed:{
        value:seed
      }
    },
    side: THREE.DoubleSide,
    depthWrite: true,
    transparent: true,
    alphaTest: .025,
    vertexShader: `
      attribute float aSeed;
      uniform float time, energy, turbulence, burst, seed;
      varying vec3 vNormal, vView;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vec3 p = position;
        float edge = smoothstep(.4, 1., abs(uv.x * 2. - 1.));
        float wave = sin(uv.x * 12. + time * (.62 + energy * .28) + seed) * cos(uv.y * 8. - time * (.38 + turbulence * .16));
        float crossWave = sin((uv.x + uv.y) * 18. - time * (.24 + turbulence * .22) + seed * 1.7);
        p.z += (wave + crossWave * .34) * (.026 + turbulence * .028) * (.42 + edge) + burst * .055 * sin(uv.y * 9.);
        p.x += sin(uv.y * 10. + time * (.2 + turbulence * .1) + seed) * turbulence * .008 * edge;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vNormal = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        vUv = uv;
        vSeed = aSeed;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float;
      uniform vec3 primary, accent, glow;
      uniform float energy, seed;
      varying vec3 vNormal, vView;
      varying vec2 vUv;
      varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + seed) * 43758.5453); }
      void main() {
        vec3 n = normalize(vNormal), view = normalize(vView);
        if (!gl_FrontFacing) n = -n;
        float facing = abs(dot(n, view)), rim = pow(1. - facing, 2.1);
        float light = .2 + max(dot(n, normalize(vec3(-.45,.6,.72))), 0.) * .8;
        float folds = sin(vUv.x * 24. + vUv.y * 11. + seed) * .07 + (hash(floor(vUv * 84.)) - .5) * .08;
        float edge = 1. - smoothstep(.73, .98, max(abs(vUv.x * 2. - 1.), abs(vUv.y * 2. - 1.)));
        vec3 gray = vec3(clamp(light + folds, .05, .92));
        float foldSignal = smoothstep(.08, .34, abs(folds) + rim * .28);
        vec3 emotion = mix(primary, accent, .35 + vSeed * .35);
        gray = mix(gray, gray * .58 + emotion * .72, foldSignal * (.24 + energy * .08));
        vec3 redEdge = mix(vec3(.72,.025,.018), primary, .08);
        vec3 cyanEdge = mix(vec3(.008,.48,.58), accent, .08);
        vec3 fringe = mix(cyanEdge, redEdge, smoothstep(-.24, .24, n.x));
        float edgeSignal = smoothstep(.12, .72, rim) * smoothstep(.12, .82, light);
        vec3 color = mix(gray, fringe, edgeSignal * (.31 + energy * .07));
        color += glow * rim * (.07 + energy * .035);
        color += vec3(vSeed * .025);
        gl_FragColor = vec4(color, smoothstep(.02, .22, edge));
      }`
  })
}
const formDefs=[
{
  seed:13,width:1.5,height:1.04,depth:.28,home:[-2.8,2.25,.25],drift:[.34,.18],scale:.92,rotation:[-.34,.26,-.72],rate:.92
},
{
  seed:29,width:1.16,height:1.46,depth:.25,home:[2.15,2.68,.2],drift:[.26,.19],scale:.82,rotation:[.22,-.2,.38],rate:1.14
},
{
  seed:47,width:1.08,height:.82,depth:.32,home:[3.05,.72,.38],drift:[.28,.16],scale:.82,rotation:[-.14,.52,-.86],rate:.78
},
{
  seed:61,width:1.58,height:1.28,depth:.34,home:[2.15,-1.9,.85],drift:[.36,.2],scale:.98,rotation:[.4,-.18,.22],rate:.68
},
{
  seed:83,width:1.34,height:1.02,depth:.29,home:[-2.95,-1.76,.62],drift:[.3,.2],scale:.88,rotation:[-.48,.4,.7],rate:1.02
}
]
const orbiters=formDefs.map(d=>{
  const data=createOrganicFormGeometry({
    ...d,columns:30,rows:22
  }),g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(data.positions,3));
  g.setAttribute('uv',new THREE.BufferAttribute(data.uvs,2));
  g.setAttribute('aSeed',new THREE.BufferAttribute(data.seeds,1));
  g.setIndex(new THREE.BufferAttribute(data.indices,1));
  g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,organicMaterial(d.seed));
  mesh.scale.setScalar(d.scale);
  mesh.rotation.set(...d.rotation);
  mesh.position.set(...d.home);
  mesh.renderOrder=3;
  orbitStage.add(mesh);
  return{
    ...d,mesh,phase:d.seed*.17
  }
})
const target={
  primary:new THREE.Color(EMOTIONS.wonder.primary),accent:new THREE.Color(EMOTIONS.wonder.accent),glow:new THREE.Color(EMOTIONS.wonder.glow),energy:EMOTIONS.wonder.energy,turbulence:EMOTIONS.wonder.turbulence,orbitSpeed:EMOTIONS.wonder.orbitSpeed,particleSize:EMOTIONS.wonder.particleSize,shape:EMOTIONS.wonder.shape
}
let currentVisualContext={
  label:EMOTIONS.wonder.label,primary:EMOTIONS.wonder.primary,accent:EMOTIONS.wonder.accent
},orbitSpeed=target.orbitSpeed,visualShape=target.shape,burst=0,pointerX=0,pointerY=0,targetPointerX=0,targetPointerY=0,lastTime=performance.now(),frameCount=0,fpsStartedAt=lastTime
function setCssPalette(e){
  document.documentElement.style.setProperty('--emotion-primary',e.primary);
  document.documentElement.style.setProperty('--emotion-accent',e.accent);
  document.documentElement.style.setProperty('--emotion-bg',e.background);
  document.documentElement.style.setProperty('--emotion-glow',e.glow)
}
function applyVisualState(visual,name,source='control'){
  const e=EMOTIONS[name];
  if(!e)return;
  target.primary.set(visual.primary);
  target.accent.set(visual.accent);
  target.glow.set(visual.glow);
  Object.assign(target,{
    energy:visual.energy,turbulence:visual.turbulence,orbitSpeed:visual.orbitSpeed,particleSize:visual.particleSize,shape:visual.shape
  });
  currentVisualContext={
    label:source==='chat'?`${e.label} blend`:e.label,primary:visual.primary,accent:visual.accent
  };
  experience.dataset.emotion=name;
  setCssPalette(visual);
  emotionCopy.textContent=e.copy;
  emotionNumber.textContent=e.number;
  emotionName.textContent=source==='chat'?`${e.label} blend`:e.label;
  announcement.textContent=`${e.label} visual state. ${e.copy}`;
  document.querySelectorAll('.emotion-button').forEach(b=>{
    const active=b.dataset.emotion===name;
    b.classList.toggle('is-active',active);
    b.setAttribute('aria-pressed',String(active))
  })
}
function selectEmotion(name){
  const e=EMOTIONS[name];
  if(e){
    applyVisualState(e,name);
    formNote.textContent=`Field tuned to ${e.label}. You can keep talking to Pi.`
  }
}
function resize(){
  const {
    width,height
  }
  =sceneWrap.getBoundingClientRect();
  if(!width||!height)return;
  const renderScale=width>=1200?.74:width>=900?.84:1;
  renderer.setPixelRatio(Math.min(devicePixelRatio,width<620?1.15:1.35));
  renderer.setSize(Math.floor(width*renderScale),Math.floor(height*renderScale),false);
  camera.aspect=width/height;
  camera.position.z=width<620?11.5:width<960?10.2:9.4;
  field.position.set(width<620?.28:width<960?.7:1.05,width<620?1.05:.08,0);
  field.scale.setScalar(width<620?.82:width<960?.94:1);
  camera.updateProjectionMatrix()
}
function stirField(){
  burst=1;
  sceneWrap.classList.remove('is-stirred');
  requestAnimationFrame(()=>sceneWrap.classList.add('is-stirred'))
}
function animate(now){
  const delta=Math.min((now-lastTime)/1000,.05),motion=reduceMotion?.1:1,elapsed=now/1000;
  lastTime=now;
  state.time.value=elapsed*motion;
  burst=THREE.MathUtils.damp(burst,0,3.1,delta);
  state.burst.value=burst;
  state.primary.value.lerp(target.primary,.035);
  state.accent.value.lerp(target.accent,.035);
  state.glow.value.lerp(target.glow,.035);
  state.energy.value=THREE.MathUtils.damp(state.energy.value,target.energy,3.4,delta);
  state.turbulence.value=THREE.MathUtils.damp(state.turbulence.value,target.turbulence,3.4,delta);
  state.particleSize.value=THREE.MathUtils.damp(state.particleSize.value,target.particleSize,3.4,delta);
  orbitSpeed=THREE.MathUtils.damp(orbitSpeed,target.orbitSpeed,3.4,delta);
  visualShape=THREE.MathUtils.damp(visualShape,target.shape,2.8,delta);
  state.shape.value=visualShape;
  dustMaterial.uniforms.orbitSpeed.value=orbitSpeed;
  haloMaterial.color.copy(state.glow.value);
  pointerX=THREE.MathUtils.damp(pointerX,targetPointerX,3.2,delta);
  pointerY=THREE.MathUtils.damp(pointerY,targetPointerY,3.2,delta);
  dragOrbit.tick(delta);
  orbitStage.rotation.y=dragOrbit.rotation.yaw+pointerX*.035;
  orbitStage.rotation.x=dragOrbit.rotation.pitch*.35+pointerY*.025;
  moon.rotation.y=elapsed*(.012+orbitSpeed*.012)*motion+dragOrbit.rotation.yaw*.12;
  moon.rotation.z=Math.sin(elapsed*.12)*.016*motion;
  const pulse=1+Math.sin(elapsed*(.34+state.energy.value*.2))*(.006+state.energy.value*.004)*motion+burst*.016;
  moon.scale.set(pulse,1.015*pulse,pulse);
  const shellPulse=1+Math.sin(elapsed*(.25+state.energy.value*.1)+1.7)*.004*motion+burst*.028;
  shell.scale.set(shellPulse,1.015*shellPulse,shellPulse);
  shell.rotation.y-=delta*orbitSpeed*.15*motion;
  haloMaterial.opacity=.095+state.energy.value*.075+burst*.1;
  halo.scale.setScalar(5.05+state.energy.value*.42+Math.sin(elapsed*(.27+state.energy.value*.08))*.1*motion+burst*.4);
  dust.rotation.y+=delta*orbitSpeed*.075*motion;
  dust.rotation.z=Math.sin(elapsed*.11)*.025*motion;
  for(let i=0;
  i<orbitLines.length;
  i++){
    const orbit=orbitLines[i];
    orbit.line.rotation.y+=delta*orbit.speed*orbitSpeed*.42*motion;
    orbit.line.rotation.z=Math.sin(elapsed*(.07+i*.009)+i)*.012*motion
  }
  for(let i=0;
  i<orbiters.length;
  i++){
    const o=orbiters[i],driftTime=elapsed*(.08+orbitSpeed*.23)*o.rate*motion+o.phase;
    o.mesh.position.x=o.home[0]+Math.cos(driftTime)*o.drift[0];
    o.mesh.position.y=o.home[1]+Math.sin(driftTime)*o.drift[1];
    o.mesh.position.z=o.home[2]+Math.sin(driftTime*.73+i)*(.08+state.turbulence.value*.025);
    o.mesh.rotation.z+=delta*(.045+i*.011)*(i%2?-1:1)*(1+orbitSpeed)*motion;
    o.mesh.rotation.y+=delta*(i%2?-.036:.041)*(1+state.turbulence.value*.22)*motion;
    o.mesh.rotation.x+=Math.sin(elapsed*(.16+i*.025)+o.phase)*delta*.018*state.turbulence.value*motion;
    const shapeX=1+visualShape*(i%2?.045:-.035),shapeY=1-visualShape*(i%2?.025:-.032);
    const liveScale=o.scale*(1+burst*.025+Math.sin(elapsed*(.28+i*.035)+o.phase)*.008*state.energy.value*motion);
    o.mesh.scale.set(liveScale*shapeX,liveScale*shapeY,liveScale)
  }
  camera.position.x=pointerX*.08;
  camera.position.y+=((-pointerY*.07)-camera.position.y)*Math.min(1,delta*2.5);
  camera.lookAt(.12+pointerX*.035,field.position.y*.25,0);
  renderer.render(scene,camera);
  frameCount++;
  if(now-fpsStartedAt>=750){
    fpsOutput.textContent=String(Math.min(99,Math.round(frameCount*1000/(now-fpsStartedAt))));
    frameCount=0;
    fpsStartedAt=now
  }
  requestAnimationFrame(animate)
}
sceneWrap.addEventListener('pointermove',e=>{
  if(e.pointerId===dragOrbit.activePointerId){
    e.preventDefault();
    const r=dragOrbit.move(e.pointerId,e.clientX,e.clientY);
    if(r.dragging)sceneWrap.classList.add('is-dragging');
    targetPointerX=targetPointerY=0;
    return
  }
  if(reduceMotion)return;
  const b=sceneWrap.getBoundingClientRect();
  targetPointerX=((e.clientX-b.left)/b.width-.5)*2;
  targetPointerY=((e.clientY-b.top)/b.height-.5)*2
})
sceneWrap.addEventListener('pointerleave',()=>{
  if(dragOrbit.activePointerId===null)targetPointerX=targetPointerY=0
})
sceneWrap.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(!dragOrbit.start(e.pointerId,e.clientX,e.clientY))return;
  sceneWrap.setPointerCapture(e.pointerId);
  sceneWrap.classList.add('is-pressed');
  targetPointerX=targetPointerY=0
})
function finishPointer(e,cancelled=false){
  const r=dragOrbit.end(e.pointerId);
  if(!r.handled)return;
  if(sceneWrap.hasPointerCapture(e.pointerId))sceneWrap.releasePointerCapture(e.pointerId);
  sceneWrap.classList.remove('is-pressed','is-dragging');
  if(!cancelled&&!r.dragged)stirField()
}
sceneWrap.addEventListener('pointerup',e=>finishPointer(e));
sceneWrap.addEventListener('pointercancel',e=>finishPointer(e,true));
sceneWrap.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){
    e.preventDefault();
    stirField()
  }
});
document.querySelectorAll('.emotion-button').forEach(b=>b.addEventListener('click',()=>selectEmotion(b.dataset.emotion)))
let bridgeOnline=false,waitingForPi=false,activeAssistantText=null,messageSequence=0
function appendChatMessage(role,text=''){
  const article=document.createElement('article');
  article.className=`chat-message is-${role}`;
  const author=document.createElement('span');
  author.textContent=role==='assistant'?'Pi':'You';
  const body=document.createElement('p');
  body.textContent=text;
  article.append(author,body);
  chatLog.append(article);
  chatLog.scrollTop=chatLog.scrollHeight;
  return body
}
function setWaitingForPi(waiting){
  waitingForPi=waiting;
  chatForm.setAttribute('aria-busy',String(waiting));
  chatSubmit.disabled=waiting||!bridgeOnline
}
function updateBridgeStatus(status,message){
  bridgeOnline=status==='online';
  bridgeDot.dataset.status=status;
  bridgeStatus.textContent=status==='online'?'Pi connected':status==='connecting'?'Pi connecting':'Pi offline';
  if(!waitingForPi)formNote.textContent=message??(bridgeOnline?'Pi is ready · visual readings are interpretive.':'The Pi bridge is unavailable.');
  chatSubmit.disabled=waitingForPi||!bridgeOnline
}
function finishAssistantResponse(){
  activeAssistantText?.closest('.chat-message')?.classList.remove('is-typing');
  activeAssistantText=null;
  setWaitingForPi(false);
  formNote.textContent=bridgeOnline?'The visual reading is interpretive, not a diagnosis.':'Pi disconnected. Your last message remains here.'
}
function handlePiMessage(message){
  if(message.type==='bridge_status'){
    updateBridgeStatus(message.status,message.message);
    return
  }
  if(message.type==='assistant_delta'){
    if(!activeAssistantText){
      activeAssistantText=appendChatMessage('assistant');
      activeAssistantText.closest('.chat-message').classList.add('is-typing')
    }
    const n=activeAssistantText.firstChild??activeAssistantText.appendChild(document.createTextNode(''));
    n.appendData(message.delta);
    activeAssistantText.closest('.chat-message').classList.remove('is-typing');
    chatLog.scrollTop=chatLog.scrollHeight;
    return
  }
  if(message.type==='assistant_done'){
    if(activeAssistantText&&!activeAssistantText.textContent.trim()){
      activeAssistantText.textContent='Pi returned no text. Please try again.';
      activeAssistantText.closest('.chat-message').classList.add('is-error')
    }
    finishAssistantResponse();
    return
  }
  if(message.type==='assistant_error'){
    if(!activeAssistantText)activeAssistantText=appendChatMessage('assistant');
    activeAssistantText.textContent=message.message;
    activeAssistantText.closest('.chat-message').classList.add('is-error');
    finishAssistantResponse()
  }
}
const piChat=createPiChatClient({
  onMessage:handlePiMessage,onStatus:updateBridgeStatus
})
chatForm.addEventListener('submit',e=>{
  e.preventDefault();
  const message=chatInput.value.trim();
  if(!message||waitingForPi){
    chatInput.focus();
    return
  }
  const reading=analyzeEmotionMessage(message),visualContext=reading.matched?{
    label:`${EMOTIONS[reading.dominant].label} blend`,primary:reading.visual.primary,accent:reading.visual.accent
  }
  :currentVisualContext;
  setWaitingForPi(true);
  const id=`message-${Date.now()}-${messageSequence++}`;
  try{
    piChat.send(message,id,visualContext)
  }
  catch(error){
    formNote.textContent=error.message;
    setWaitingForPi(false);
    chatInput.focus();
    return
  }
  appendChatMessage('user',message);
  chatInput.value='';
  activeAssistantText=appendChatMessage('assistant');
  activeAssistantText.closest('.chat-message').classList.add('is-typing');
  if(reading.matched){
    applyVisualState(reading.visual,reading.dominant,'chat');
    stirField();
    formNote.textContent=`Pi is responding · field blending toward ${EMOTIONS[reading.dominant].label.toLowerCase()}.`
  }
  else formNote.textContent='Pi is responding · the field is holding steady.'
})
chatInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
    e.preventDefault();
    chatForm.requestSubmit()
  }
})
addEventListener('beforeunload',()=>piChat.close());
addEventListener('resize',resize);
new ResizeObserver(resize).observe(sceneWrap);
setCssPalette(EMOTIONS.wonder);
resize();
requestAnimationFrame(animate)
