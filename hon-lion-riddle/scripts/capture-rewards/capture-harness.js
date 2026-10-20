import { saveJpg as saveCanvasJpg } from './capture-io.js';
import * as THREE from 'three';
import { GLTFLoader } from '/vendor/examples/jsm/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from '/vendor/examples/jsm/lights/RectAreaLightUniformsLib.js';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
RectAreaLightUniformsLib.init();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0a09');
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
const loader = new GLTFLoader();
const state = {
  status: 'loading', root: null, manifest: null, gun: null, gunAsset: '/gun.glb', gunLoaded: false,
  viewport: null, renderInfo: { triangles: 0, textures: 0 }, warnings: [], assetRevision: null,
};
window.__CAPTURE__ = state;

function resizeRenderer(width, height) {
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  renderer.setPixelRatio(1); renderer.setSize(width, height, false); renderer.setViewport(0, 0, width, height);
  camera.aspect = width / height; camera.updateProjectionMatrix();
  state.viewport = { width, height, drawingBufferWidth: canvas.width, drawingBufferHeight: canvas.height };
}
function configureLights(data) {
  for (const light of data.lights ?? []) {
    const color = new THREE.Color(light.color);
    const obj = light.type === 'area'
      ? new THREE.RectAreaLight(color, light.intensity, light.width ?? 1, light.height ?? 1)
      : light.type === 'spot'
        ? new THREE.SpotLight(color, light.intensity, light.distance, Math.PI / 5, 0.65)
        : new THREE.PointLight(color, light.intensity, light.distance, light.decay ?? 2);
    obj.position.fromArray(light.position);
    if (light.type === 'area') obj.rotation.fromArray(light.rotation ?? [0, Math.PI, 0]);
    obj.castShadow = light.castShadow ?? false;
    if (obj.castShadow && obj.shadow) { obj.shadow.bias = -0.0002; obj.shadow.normalBias = 0.025; obj.shadow.mapSize.set(1024, 1024); }
    scene.add(obj);
  }
  scene.add(new THREE.HemisphereLight('#b7aa96', '#24150d', data.environment?.hemisphereIntensity ?? 0.32));
  scene.add(new THREE.AmbientLight('#8c765e', data.environment?.ambientIntensity ?? 0.08));
}
function poseCamera(pose) {
  camera.position.fromArray(pose.position);
  camera.lookAt(new THREE.Vector3().fromArray(pose.target));
  camera.fov = pose.fov;
  camera.aspect = state.viewport.width / state.viewport.height;
  camera.updateProjectionMatrix();
}
function renderPose(pose) { poseCamera(pose); renderer.render(scene, camera); state.renderInfo.triangles = renderer.info.render.triangles; return pose; }
function ease(t) { return t * t * (3 - 2 * t); }
function lerpPose(a, b, t) {
  const s = ease(Math.max(0, Math.min(1, t)));
  const p = new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), s);
  const target = new THREE.Vector3().fromArray(a.target).lerp(new THREE.Vector3().fromArray(b.target), s);
  return { position: p.toArray(), target: target.toArray(), fov: a.fov + (b.fov - a.fov) * s };
}
function waitFrame() { return new Promise((resolve) => requestAnimationFrame(resolve)); }
async function waitReady() { while (state.status !== 'ready') await waitFrame(); }

let keyObject;
let keyBase;
function createKey() {
  keyObject = new THREE.Group(); keyObject.name = 'Gameplay-Key';
  const gold = new THREE.MeshStandardMaterial({ color: '#d8a845', metalness: 0.72, roughness: 0.22, emissive: '#4d2c08', emissiveIntensity: 0.15 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.19, 12), gold); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.095; keyObject.add(shaft);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.012, 8, 18), gold); ring.position.x = -0.02; keyObject.add(ring);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.018), gold); tooth.position.set(0.17, -0.02, 0); keyObject.add(tooth);
  keyObject.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  keyBase = new THREE.Vector3(1.20, 1.11, -11.42);
  keyObject.position.copy(keyBase); keyObject.rotation.set(-0.3, -0.6, 0.2); keyObject.visible = false; scene.add(keyObject);
}

let cabinet, doors = [], doorPivots = [], cabinetReady = false;
let gunRoot, gunBase, gunBox, gunLight, pickupLight, doorKey, doorKeyBase, doorKeyLight;
const gunHeld = new THREE.Vector3(-1.36, 0.67, -9.80);
const keyHeld = new THREE.Vector3(-1.36, 0.67, -9.80);
const forbiddenTestGunSha256 = 'ca1c75070d7e7595c1837f2dbaaaa88a14ef80a2ab56b93656928f0258f3122e';
function setupCabinet() {
  cabinet = state.root.getObjectByName('F-LIVING-WEST-CABINET-01');
  if (!cabinet) throw new Error('missing cabinet F-LIVING-WEST-CABINET-01');
  const found = ['painted_wooden_cabinet_door_01', 'painted_wooden_cabinet_door_02'].map((name) => cabinet.getObjectByName(name));
  if (found.some((node) => !node)) throw new Error('missing cabinet doors');
  for (const [index, node] of found.entries()) {
    node.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(node);
    const hinge = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, index === 0 ? box.max.z : box.min.z);
    const pivot = new THREE.Group(); pivot.name = `Gameplay-Cabinet-Door-Pivot-${index + 1}`; pivot.position.copy(hinge); scene.add(pivot); pivot.attach(node);
    doors.push(node); doorPivots.push({ pivot, sign: index === 0 ? -1 : 1, closed: 0 });
  }
  gunLight = new THREE.PointLight('#a9c9ff', 0, 0.95, 2);
  gunLight.position.set(-1.58, 0.58, -9.63); gunLight.castShadow = false; scene.add(gunLight);
  pickupLight = new THREE.PointLight('#e5d4b8',0,1.5,2); pickupLight.position.set(-0.80,1.12,-9.6); scene.add(pickupLight);
  doorKeyLight = new THREE.PointLight('#dce5ed',0,0.85,2); doorKeyLight.position.set(-1.6,0.52,-10.08); scene.add(doorKeyLight);
  cabinetReady = true; setCabinetOpen(0);
}
function setCabinetOpen(progress) {
  if (!cabinetReady) return;
  const angle = THREE.MathUtils.degToRad(82) * ease(Math.max(0, Math.min(1, progress)));
  for (const item of doorPivots) item.pivot.rotation.y = item.sign * angle;
  scene.updateMatrixWorld(true);
}
function setGunProgress(progress) {
  if (!gunRoot) return;
  const s = ease(THREE.MathUtils.clamp(progress,0,1));
  gunRoot.visible = true;
  gunRoot.position.fromArray(gunBase).lerp(gunHeld,s);
  gunRoot.rotation.y = -0.1 - s * 0.10;
  pickupLight.intensity = 0.35 * s;
}
function lowerItem(root, heldPosition, t) {
  const s=ease(THREE.MathUtils.clamp(t,0,1));
  root.position.copy(heldPosition).lerp(new THREE.Vector3(heldPosition.x,-0.25,heldPosition.z),s);
  root.visible=t<1;
  pickupLight.intensity=0.35*(1-s);
}
function createDoorKey() {
  doorKey=keyObject.clone(true);doorKey.name='Gameplay-Room-Door-Key';doorKey.position.set(0,0,0);doorKey.rotation.set(0,Math.PI/2,-0.5);
  const silver=new THREE.MeshStandardMaterial({color:'#c8d4df',metalness:0.68,roughness:0.26});
  doorKey.traverse(node=>{if(node.isMesh)node.material=silver;});
  scene.add(doorKey);doorKey.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(doorKey),center=bounds.getCenter(new THREE.Vector3());
  const hits=new THREE.Raycaster(new THREE.Vector3(-1.79,0.6,-10.08),new THREE.Vector3(0,-1,0)).intersectObject(cabinet,true);
  if(!hits.length)throw Error('room key shelf surface missing');
  doorKeyBase=new THREE.Vector3(-1.79-center.x,hits[0].point.y+0.002-bounds.min.y,-10.08-center.z);
  doorKey.position.copy(doorKeyBase);doorKey.visible=true;
}
function setDoorKeyProgress(progress) {
  const s=ease(THREE.MathUtils.clamp(progress,0,1));
  doorKey.visible=true;
  doorKey.position.copy(doorKeyBase).lerp(keyHeld,s);
  doorKey.rotation.set(0,Math.PI/2,-0.5+s*0.7);
  if(progress>0)pickupLight.intensity=0.35*s;
}
async function loadGun() {
  const response = await fetch(state.gunAsset, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Tripo gun GLB missing at ${state.gunAsset}; capture is intentionally blocked until it is supplied`);
  const sourceBytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', sourceBytes))).map((value) => value.toString(16).padStart(2, '0')).join('');
  state.gunSha256 = digest;
  if (digest === forbiddenTestGunSha256) throw new Error('capture blocked: shared gun path still contains the temporary cross.glb test asset');
  const gltf = await new Promise((resolve, reject) => loader.parse(sourceBytes, '', resolve, reject));
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model); const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z); if (!Number.isFinite(maxDim) || maxDim <= 0) throw new Error('invalid Tripo gun bounds');
  const scale = 0.38 / maxDim;
  model.scale.setScalar(scale); model.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  model.position.sub(center);
  gunRoot = new THREE.Group(); gunRoot.name = 'Tripo-Gun'; gunRoot.add(model);
  gunRoot.rotation.set(0, -0.1, 0); gunRoot.updateMatrixWorld(true);
  const rotatedBox = new THREE.Box3().setFromObject(gunRoot);
  const floorHits = new THREE.Raycaster(new THREE.Vector3(-1.80,0.6,-9.63),new THREE.Vector3(0,-1,0)).intersectObject(cabinet,true);
  const shelfY = floorHits[0]?.point.y;
  if (!Number.isFinite(shelfY)) throw new Error('cabinet shelf surface not found');
  state.shelfY = shelfY;
  gunBase = [-1.80, shelfY + 0.002 - rotatedBox.min.y, -9.63];
  gunRoot.position.fromArray(gunBase); gunRoot.visible = false;
  gunRoot.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } }); scene.add(gunRoot); state.gunLoaded = true; state.gunPlacement = {position:gunBase, size:new THREE.Box3().setFromObject(gunRoot).getSize(new THREE.Vector3()).toArray()};
}


// Licensed padlock is supplied locally to the capture server; only rendered
// video/posters are published. Keep the model out of distributable game files.
let padlock, padlockMixer, padlockClip, unlockKey, haspHinge;
const padlockBase = new THREE.Vector3(-1.482,0.57,-9.85);
const unlockKeyBase = new THREE.Vector3(-1.330,0.57,-9.85);
const unlockDuration = 6.6;
function phase(t,start,end) { return ease(THREE.MathUtils.clamp((t-start)/(end-start),0,1)); }
async function loadPadlock() {
  const response=await fetch('/padlock.glb',{cache:'no-store'});
  if(!response.ok)throw Error('Licensed PADLOCK_ASSET is required for reward capture');
  const bytes=await response.arrayBuffer();
  state.padlockSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const gltf=await new Promise((resolve,reject)=>loader.parse(bytes,'',resolve,reject));
  const model=gltf.scene;
  padlockClip=gltf.animations[0];
  if(!model.getObjectByName('Shackle')||!padlockClip)throw Error('Padlock shackle animation missing');
  model.scale.setScalar(0.05);
  padlock=new THREE.Group();padlock.name='Gameplay-Rusty-Padlock';
  padlock.add(model);padlock.position.copy(padlockBase);padlock.rotation.y=Math.PI/2;scene.add(padlock);
  model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
  padlockMixer=new THREE.AnimationMixer(model);
  const action=padlockMixer.clipAction(padlockClip);
  action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  unlockKey=keyObject.clone(true);unlockKey.name='Gameplay-Cabinet-Unlock-Key';
  unlockKey.scale.setScalar(.65);scene.add(unlockKey);
  // A hinged hasp spans the two doors; its staple passes through the shackle.
  // These fitted mounting parts are authored accessories to the licensed lock.
  const material=model.getObjectByName('Shackle').material.clone();
  const metal=material; metal.color.set('#66574a');
  function mesh(geometry,position,parent=scene) {
    const obj=new THREE.Mesh(geometry,metal);obj.position.fromArray(position);
    obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj;
  }
  for(const z of [-9.73,-9.94]) {
    const plate=mesh(new THREE.BoxGeometry(.012,.065,.065),[-1.522,.683,z]);
    for(const y of [.662,.704])for(const dz of [-.020,.020]) {
      const screw=mesh(new THREE.SphereGeometry(.004,8,6),[-1.513,y,z+dz]);
      doorPivots[z>-9.85?0:1].pivot.attach(screw);
    }
    doorPivots[z>-9.85?0:1].pivot.attach(plate);
  }
  haspHinge=new THREE.Group();haspHinge.position.set(-1.510,.683,-9.73);scene.add(haspHinge);
  const strap=new THREE.Shape();
  strap.moveTo(0,-.032);strap.lineTo(.19,-.032);strap.lineTo(.19,.032);strap.lineTo(0,.032);strap.closePath();
  const slot=new THREE.Path();slot.moveTo(.099,-.026);slot.lineTo(.099,.026);slot.lineTo(.141,.026);slot.lineTo(.141,-.026);slot.closePath();strap.holes.push(slot);
  const strapMesh=mesh(new THREE.ExtrudeGeometry(strap,{depth:.014,bevelEnabled:true,bevelThickness:.001,bevelSize:.001,bevelSegments:1,steps:1}),[0,0,0],haspHinge);
  strapMesh.rotation.y=Math.PI/2;
  const staple=mesh(new THREE.TorusGeometry(.018,.005,8,20),[-1.493,.683,-9.85]);
  // The staple lies in XY and the padlock shackle in YZ, so the rings interlock.
  doorPivots[1].pivot.attach(staple);doorPivots[0].pivot.attach(haspHinge);
  const lockLight=new THREE.PointLight('#edd5b5',.44,1.1,2);
  lockLight.position.set(-1.05,.95,-9.75);scene.add(lockLight);
  state.padlock={source:'raulleonvalero / Animated Padlock & Key Pack',scale:0.05,
    base:padlockBase.toArray(),clip:padlockClip.name,clipSeconds:padlockClip.duration,
    unlockSeconds:unlockDuration,doorStartsAtSeconds:unlockDuration*.69};
  setPadlockProgress(0);
}
function setPadlockProgress(t) {
  if(!padlock)return;
  const lift=phase(t,.30,.49),remove=phase(t,.52,.65);
  padlockMixer.setTime(lift*(padlockClip.duration-0.000001));
  padlock.visible=t<.66;
  padlock.position.copy(padlockBase).add(new THREE.Vector3(.10*remove,-.60*remove,.08*remove));
  padlock.rotation.set(.12*remove,Math.PI/2,.15*remove);
  unlockKey.visible=t>.12&&t<.64;
  unlockKey.position.copy(unlockKeyBase);
  unlockKey.position.x+=.19*(1-phase(t,.12,.25));
  unlockKey.position.x+=.04*phase(t,.49,.54);
  unlockKey.position.y-=.60*remove;
  unlockKey.position.z+=.08*remove;
  unlockKey.rotation.set(0,Math.PI,0);
  unlockKey.rotateX(phase(t,.25,.35)*Math.PI/2);
  haspHinge.rotation.y=-phase(t,.65,.70)*Math.PI*.66;
  scene.updateMatrixWorld(true);
}
function unlockPose(profile,t) {
  const normal=profilePoses(profile).cabinet;
  const close={position:[-.99,.76,-9.72],target:[-1.49,.60,-9.85],fov:profile==='portrait'?65:55};
  if(t<.12)return lerpPose(normal,close,t/.12);
  if(t>.64)return lerpPose(close,normal,(t-.64)/.15);
  return close;
}
function drawUnlock(profile,t) {
  applyMode('cabinet-open',t);
  renderPose(unlockPose(profile,t));
}

function poseFromYawPitch(position, yaw, pitch, fov) {
  const direction = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  return { position, target: new THREE.Vector3().fromArray(position).add(direction).toArray(), fov };
}
const P = {
  cWide: poseFromYawPitch([0.844, 1.6, -9.9], 0.32, -0.18, 75),
  cPortrait: poseFromYawPitch([0.844, 1.6, -9.9], 0.52, -0.18, 89),
  key: { position: [0.84, 1.58, -11.04], target: [1.34, 1.07, -11.50], fov: 70 },
  cabinet: { position: [-0.65, 0.86, -9.80], target: [-1.76, 0.44, -9.83], fov: 68 },
  entry: poseFromYawPitch([0, 1.6, -2.4], Math.PI, -0.12, 75),
};
function profilePoses(profile) {
  const portrait = profile === 'portrait';
  const c = portrait ? P.cPortrait : P.cWide;
  const key = { ...P.key, fov: portrait ? 89 : 70 };
  const cabinet = { ...P.cabinet, fov: portrait ? 89 : 68 };
  const entry = { ...P.entry, fov: portrait ? 89 : 75 };
  const fov = portrait ? 89 : 75;
  // Walk along the clear east aisle, around the coffee table's front edge.
  const toCabinet = [key,
    {position:[0.84,1.58,-9.40],target:[0,1.1,-9.2],fov},
    {position:[0,1.50,-9.35],target:[-1.7,0.65,-9.83],fov},
    {position:[-0.65,1.35,-9.40],target:cabinet.target,fov}, cabinet];
  // Pass through the 1.3 m central opening; stay east of the hall console.
  const toEntry = [cabinet,
    {position:[-0.65,1.6,-9.0],target:[0.2,1.5,-7.8],fov},
    {position:[0.2,1.6,-8.6],target:[0.25,1.5,-7.3],fov},
    {position:[0.25,1.6,-7.5],target:[0.25,1.5,-5.8],fov},
    {position:[0.25,1.6,-5.5],target:[0.25,1.5,-3.8],fov},
    {position:[0.25,1.6,-3.8],target:entry.target,fov},entry];
  return {c,key,cabinet,entry,toCabinet,toEntry};
}

function pathPose(points, t) {
  if (t >= 1) return points.at(-1);
  const n = points.length - 1; const f = Math.max(0, Math.min(0.999999, t)) * n; const i = Math.min(n - 1, Math.floor(f));
  return lerpPose(points[i], points[i + 1], f - i);
}
function setProfile(profile) { resizeRenderer(profile === 'portrait' ? 720 : 1280, profile === 'portrait' ? 1280 : 720); }
async function save(name, body) { const r = await fetch(`/save/${name}`, { method: 'POST', body }); if (!r.ok) throw new Error(`save ${name}: ${r.status}`); }
const saveJpg=name=>saveCanvasJpg(canvas,name,save);
async function recordVideo(edge, profile, seconds, draw) {
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 7_000_000 });
  const chunks = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; }); draw(0, 0); await waitFrame(); recorder.start();
  const start = performance.now(); let frames = 0;
  await new Promise((resolve) => {
    const step = (now) => { const t = (now - start) / 1000; draw(Math.min(1, t / seconds), t); frames += 1; if (t < seconds) requestAnimationFrame(step); else resolve(); };
    requestAnimationFrame(step);
  });
  draw(1, seconds); await new Promise(resolve => setTimeout(resolve, 160)); recorder.stop(); await stopped;
  await save(`reward-${edge}-${profile}.webm`, new Blob(chunks, { type: mime }));
  return { frames, seconds: (performance.now() - start) / 1000, mime };
}
function poster(node, profile, pose, mode) { setProfile(profile); applyMode(mode, 1); renderPose(pose); return saveJpg(`reward-${node}-${profile}.jpg`); }
function applyMode(mode,t) {
  keyObject.visible=false;
  const open=['cabinet-open','gun-held','gun-stowed','armed','entry'].includes(mode);
  const amount=mode==='cabinet-open'?phase(t,.69,1):open?1:0;
  setPadlockProgress(mode==='cabinet-open'?t:open?1:0);
  setCabinetOpen(amount);setGunProgress(mode==='gun-held'?1:0);setDoorKeyProgress(mode==='armed'?1:0);
  if(['gun-stowed','armed','entry'].includes(mode))gunRoot.visible=false;
  if(mode==='entry')doorKey.visible=false;
  pickupLight.intensity=['gun-held','armed'].includes(mode)?0.35:0;
  gunLight.intensity=0.6*amount;doorKeyLight.intensity=0.25*amount;
  scene.updateMatrixWorld(true);
}
function preview(profile,node) {
  setProfile(profile);const p=profilePoses(profile);
  applyMode(node,1);renderPose(p[['cabinet-open','gun-held','gun-stowed','armed'].includes(node)?'cabinet':node]);
  return {placement:state.gunPlacement,camera:{position:camera.position.toArray(),fov:camera.fov}};
}
function auditPickup(profile) {
  setProfile(profile);const pose=profilePoses(profile).cabinet;poseCamera(pose);camera.updateMatrixWorld(true);
  const results={};
  for(const item of ['gun','door-key']) {
    let closest=Infinity,finalBounds;
    for(let i=0;i<=100;i++) {
      applyMode('cabinet-open',1);
      if(item==='gun')setGunProgress(i/100);else{gunRoot.visible=false;setDoorKeyProgress(i/100);}
      scene.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(item==='gun'?gunRoot:doorKey);
      const projected=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const v=new THREE.Vector3(x,y,z);closest=Math.min(closest,-v.clone().applyMatrix4(camera.matrixWorldInverse).z);projected.push(v.project(camera));
      }
      if(i===100)finalBounds={left:Math.min(...projected.map(p=>p.x)),right:Math.max(...projected.map(p=>p.x)),bottom:Math.min(...projected.map(p=>p.y)),top:Math.max(...projected.map(p=>p.y))};
    }
    if(closest<0.15||finalBounds.left < -0.9||finalBounds.right>0.9||finalBounds.bottom<-.4||finalBounds.top>.9)throw Error(`pickup framing failed ${profile} ${item}: ${JSON.stringify({closest,finalBounds})}`);
    results[item]={samples:101,minimum_camera_depth_m:closest,final_ndc_bounds:finalBounds,passed:true};
  }
  return results;
}
async function captureProfile(profile) {
  setProfile(profile);
  const {c:cPose,key:keyPose,cabinet:cabinetPose,entry:entryPose,toCabinet,toEntry} = profilePoses(profile);
  const records = {};
  status.textContent = `${profile}: c → key`;
  applyMode('key',1); renderPose(cPose); await saveJpg(`reward-c-${profile}.jpg`);
  records['c-key'] = await recordVideo('c-key', profile, 4.4, (t) => {
    const pose = lerpPose(cPose, keyPose, Math.min(1,t/0.6));
    keyObject.visible = t >= 0.48 && t < 0.96;
    if (t < 0.72) keyObject.position.copy(new THREE.Vector3(1.44,0.84,-11.62)).lerp(keyBase,ease((t-0.48)/0.24));
    else keyObject.position.copy(keyBase).lerp(new THREE.Vector3(0.97,1.36,-11.18),ease((t-0.72)/0.24));
    renderPose(pose);
  });
  keyObject.visible = false; renderPose(keyPose); await saveJpg(`reward-key-${profile}.jpg`);
  status.textContent = `${profile}: key → cabinet`;
  records['key-cabinet'] = await recordVideo('key-cabinet', profile, 6.4, (t) => renderPose(pathPose(toCabinet,t)));
  applyMode('cabinet',1); renderPose(cabinetPose); await saveJpg(`reward-cabinet-${profile}.jpg`);
  status.textContent = `${profile}: cabinet → cabinet-open`;
  records['cabinet-open'] = await recordVideo('cabinet-open', profile, unlockDuration, (t) => drawUnlock(profile,t));
  applyMode('cabinet-open',1); renderPose(cabinetPose); await saveJpg(`reward-cabinet-open-${profile}.jpg`);
  status.textContent = `${profile}: cabinet-open → gun-held`;
  records['cabinet-take']=await recordVideo('cabinet-take',profile,2.8,t=>{applyMode('cabinet-open',1);setGunProgress(Math.min(1,t/0.65));renderPose(cabinetPose);});
  applyMode('gun-held',1);renderPose(cabinetPose);await saveJpg(`reward-gun-held-${profile}.jpg`);
  status.textContent = `${profile}: gun-held → gun-stowed`;
  records['cabinet-stow']=await recordVideo('cabinet-stow',profile,1.2,t=>{applyMode('gun-held',1);lowerItem(gunRoot,gunHeld,t);renderPose(cabinetPose);});
  applyMode('gun-stowed',1);renderPose(cabinetPose);await saveJpg(`reward-gun-stowed-${profile}.jpg`);
  status.textContent = `${profile}: gun-stowed → armed`;
  records['cabinet-door-key']=await recordVideo('cabinet-door-key',profile,2.5,t=>{applyMode('gun-stowed',1);setDoorKeyProgress(Math.min(1,t/0.70));renderPose(cabinetPose);});
  applyMode('armed',1);renderPose(cabinetPose);await saveJpg(`reward-armed-${profile}.jpg`);
  status.textContent = `${profile}: armed → entry`;
  records['cabinet-entry']=await recordVideo('cabinet-entry',profile,9.2,t=>{
    if(t<0.1){applyMode('armed',1);lowerItem(doorKey,keyHeld,t/0.1);renderPose(cabinetPose);}
    else{applyMode('entry',1);renderPose(pathPose(toEntry,(t-0.1)/0.9));}
  });
  renderPose(entryPose); await saveJpg(`reward-entry-${profile}.jpg`);
  await save(`reward-${profile}.json`, JSON.stringify({profile,sourceScene:state.manifest.scene.sha256,gunSha256:state.gunSha256,padlockSha256:state.padlockSha256,padlock:state.padlock,records,camera:{c:cPose,key:keyPose,cabinet:cabinetPose,entry:entryPose},paths:{toCabinet,toEntry}}));
  return records;
}

function auditRoutes() {
  const data = state.manifest, radius = 0.16;
  function inside(p, poly) {
    let hit = false;
    for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
      const a=poly[i],b=poly[j];
      if ((a[1]>p[1])!==(b[1]>p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
    }
    return hit;
  }
  function segmentDistance(p,a,b) {
    const dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz)));
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
  }
  const poses = profilePoses('wide');
  const paths = {'c-key':[poses.c,poses.key],'key-cabinet':poses.toCabinet,'cabinet-entry':poses.toEntry};
  const report = {};
  for (const [name, points] of Object.entries(paths)) {
    let minClearance=Infinity, nearest=null;
    for(let i=0;i<=1000;i++) {
      const pose=pathPose(points,i/1000),p=[pose.position[0],pose.position[2]];
      for(let j=0;j<16;j++) {
        const angle=j*Math.PI/8,q=[p[0]+radius*Math.cos(angle),p[1]+radius*Math.sin(angle)];
        if(!data.floorPolygons.some(poly=>inside(q,poly))) throw new Error(`route ${name} leaves floor at ${i}`);
      }
      for(const wall of data.wallColliders) {
        const clearance=segmentDistance(p,wall.a,wall.b)-(wall.thickness||0.2)/2;
        if(clearance<minClearance){minClearance=clearance;nearest=wall.id;}
        if(clearance<radius)throw new Error(`route ${name} intersects ${wall.id} at ${i}`);
      }
      for(const body of data.furnitureColliders) {
        if(body.min[1]>1.7)continue;
        const clearance=Math.hypot(Math.max(body.min[0]-p[0],0,p[0]-body.max[0]),Math.max(body.min[2]-p[1],0,p[1]-body.max[2]));
        if(clearance<minClearance){minClearance=clearance;nearest=body.id;}
        if(clearance<radius)throw new Error(`route ${name} intersects ${body.id} at ${i}`);
      }
    }
    report[name]={samples:1001,radius,minimum_clearance_m:minClearance,nearest_obstacle:nearest,passed:true};
  }
  return report;
}

async function boot() {
  const response = await fetch('/scene-manifest.json', { cache: 'no-store' }); if (!response.ok) throw new Error(`manifest HTTP ${response.status}`); state.manifest = await response.json(); state.assetRevision = state.manifest.scene.sha256;
  configureLights(state.manifest); const gltf = await loader.loadAsync(state.manifest.scene.url || '/scene.glb'); state.root = gltf.scene; scene.add(state.root);
  state.root.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  createKey(); setupCabinet(); await loadGun(); createDoorKey(); await loadPadlock(); state.pickupAudit={wide:auditPickup('wide'),portrait:auditPickup('portrait')}; state.routeAudit = auditRoutes(); state.status = 'ready'; state.renderInfo.textures = renderer.info.memory.textures; resizeRenderer(1280, 720); renderPose(P.cWide); status.textContent = `ready · lamp L-05-L-01 · cabinet F-LIVING-WEST-CABINET-01 · Tripo gun loaded`;

  const select=document.querySelector('#profile');
  const slider=document.querySelector('#unlock-progress');
  async function showFrame() {
    const profile=select.value,t=Number(slider.value)/100;
    setProfile(profile);drawUnlock(profile,t);
    status.textContent=`unlock ${Math.round(t*100)}% · doors ${t<.69?'closed':'opening'} · ${profile}`;
  }
  slider.addEventListener('input',showFrame);select.addEventListener('change',showFrame);
  document.querySelector('#preview-unlock').addEventListener('click',async()=>{
    const profile=select.value;setProfile(profile);
    status.textContent=`recording unlock ${profile}…`;
    await recordVideo('cabinet-open',profile,unlockDuration,t=>drawUnlock(profile,t));
    status.textContent=`unlock ${profile} saved`;
  });
  document.querySelector('#save-frame').addEventListener('click',async()=>{
    await showFrame();await saveJpg(`reward-padlock-${slider.value}-${select.value}.jpg`);
    status.textContent=`frame ${slider.value}% saved`;
  });
  document.querySelector('#capture-all').addEventListener('click',async()=>{
    for(const button of document.querySelectorAll('button, select, input'))button.disabled=true;
    try {
      for(const profile of ['wide','portrait'])await captureProfile(profile);
      await save('reward-audit.json',JSON.stringify({status:state.status,gun_sha256:state.gunSha256,
        gun_placement:state.gunPlacement,shelf_y:state.shelfY,scene:state.manifest.scene,
        route_audit:state.routeAudit,pickup_audit:state.pickupAudit,padlock:state.padlock,
        padlock_sha256:state.padlockSha256}));
      status.textContent='capture complete: wide + portrait';
    }catch(error){status.textContent=`ERROR: ${error.message}`;}
    finally{for(const button of document.querySelectorAll('button, select, input'))button.disabled=false;}
  });
  showFrame();
  window.__CAPTURE__.captureProfile = captureProfile; window.__CAPTURE__.renderPose = renderPose; window.__CAPTURE__.setProfile = setProfile; window.__CAPTURE__.preview = preview; window.__CAPTURE__.profilePoses = profilePoses;
}
boot().catch((error) => { state.status = 'error'; state.error = String(error); status.textContent = `ERROR: ${error.message}`; console.error(error); });
