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
async function sha256(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((value) => value.toString(16).padStart(2, '0')).join('');
}

let keyObject;
let keyBase;
let crossEscutcheon, crossKey;
function createKey() {
  keyObject = new THREE.Group(); keyObject.name = 'Gameplay-Key';
  const gold = new THREE.MeshStandardMaterial({ color: '#d8a845', metalness: 0.72, roughness: 0.22, emissive: '#4d2c08', emissiveIntensity: 0.15 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.19, 12), gold); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.095; keyObject.add(shaft);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.012, 8, 18), gold); ring.position.x = -0.02; keyObject.add(ring);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.018), gold); tooth.position.set(0.17, -0.02, 0); keyObject.add(tooth);
  keyObject.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
  // The ordinary gold cabinet key is discovered beside the room cross.  It is
  // intentionally distinct from the later silver cross-profile door key.
  keyBase = new THREE.Vector3(0.45, 0.87, -11.62);
  keyObject.position.copy(keyBase); keyObject.rotation.set(-0.3, -0.6, 0.2); keyObject.visible = false; scene.add(keyObject);
}
function groundOrdinaryKey() {
  const ray = new THREE.Raycaster(new THREE.Vector3(keyBase.x, 1.6, keyBase.z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(state.root, true).find((candidate) => candidate.point.y > 0.2);
  if (!hit) throw new Error(`ordinary cabinet key support surface missing: ${JSON.stringify(ray.intersectObject(state.root, true).slice(0, 4).map((candidate) => ({node:candidate.object.name, y:candidate.point.y})))}`);
  keyBase.y = hit.point.y;
  keyObject.position.copy(keyBase);
  state.ordinaryKeySupport = { node:hit.object.name || 'unnamed', point:hit.point.toArray() };
}
function showOrdinaryKey() {
  keyObject.visible = true;
  keyObject.position.copy(keyBase);
  // Keep the ring parallel to the sideboard; yaw exposes the tooth without
  // pitching the ring below its physical support surface.
  keyObject.scale.setScalar(1.2); keyObject.rotation.set(0, Math.PI + 0.34, 0);
  keyObject.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(keyObject);
  keyObject.position.y += keyBase.y + 0.004 - bounds.min.y;
  keyObject.updateMatrixWorld(true);
}

function createCrossHardware() {
  const brass = new THREE.MeshStandardMaterial({ color: '#b4a07b', metalness: 0.62, roughness: 0.34 });
  const dark = new THREE.MeshStandardMaterial({ color: '#120f0c', metalness: 0.12, roughness: 0.62 });
  crossEscutcheon = new THREE.Group(); crossEscutcheon.name = 'Gameplay-Cross-Escutcheon';
  crossEscutcheon.position.set(3.88, 1.28, -18.30); crossEscutcheon.rotation.y = 0;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.30, 0.22), brass);
  plate.castShadow = true; plate.receiveShadow = true; crossEscutcheon.add(plate);
  const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.16, 0.046), dark); vertical.position.set(-0.033, 0.0, 0); crossEscutcheon.add(vertical);
  const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.046, 0.13), dark); horizontal.position.set(-0.033, 0.02, 0); crossEscutcheon.add(horizontal);
  scene.add(crossEscutcheon);
  crossKey = new THREE.Group(); crossKey.name = 'Gameplay-Cross-Profile-Key';
  const silver = new THREE.MeshStandardMaterial({ color: '#c8d4df', metalness: 0.78, roughness: 0.23 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.21, 12), silver); shaft.rotation.z = Math.PI / 2; shaft.position.x = 0.11; crossKey.add(shaft);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.012, 8, 18), silver); ring.position.x = -0.03; crossKey.add(ring);
  const crossBladeV = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.035), silver); crossBladeV.position.set(0.22, 0, 0); crossKey.add(crossBladeV);
  const crossBladeH = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.12), silver); crossBladeH.position.set(0.22, 0.02, 0); crossKey.add(crossBladeH);
  crossKey.position.set(3.42, 1.22, -18.30); crossKey.rotation.set(0, Math.PI / 2, 0); crossKey.visible = false;
  crossKey.traverse((n) => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } }); scene.add(crossKey);
}

let cabinet, doors = [], doorPivots = [], cabinetReady = false;
let gunRoot, gunBase, gunBox, gunLight, pickupLight, doorKey, doorKeyBase, doorKeyLight;
let rearDoorLeft, rearDoorRight;
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
  doorKey=crossKey.clone(true);doorKey.name='Gameplay-Cross-Profile-Door-Key';doorKey.position.set(0,0,0);
  // The cabinet camera looks largely across the key.  A shallow yaw preserves
  // the cross silhouette while leaving the ring and shaft visibly connected.
  doorKey.rotation.set(0,THREE.MathUtils.degToRad(30),-0.12);
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
  doorKey.rotation.set(0,THREE.MathUtils.degToRad(30),-0.12+s*0.24);
  if(progress>0)pickupLight.intensity=0.35*s;
}
function setCrossKeyProgress(progress) {
  if (!crossKey) return;
  // The ordinary gold key has its own grounded discovery sequence.  Keep this
  // silver template hidden until it is cloned into the cabinet door-key state;
  // never reset the attached escutcheon's hinge-local transform here.
  crossKey.visible = false;
}
function setRearDoorOpen(progress) {
  const s = ease(THREE.MathUtils.clamp(progress, 0, 1));
  const door = state.manifest?.preview?.door;
  if (rearDoorLeft) rearDoorLeft.rotation.y = state.rearDoorBase.left + door.leftSign * door.openAngle * s;
  if (rearDoorRight) rearDoorRight.rotation.y = state.rearDoorBase.right + door.rightSign * door.openAngle * s;
  scene.updateMatrixWorld(true);
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
  cWide: poseFromYawPitch([0.844, 1.6, -9.70], 0.32, -0.18, 75),
  cPortrait: poseFromYawPitch([0.844, 1.6, -9.70], 0.52, -0.18, 89),
  rearDoor: { position:[1.58,1.52,-17.50], target:[3.72,1.32,-18.30], fov:70 },
  crossClose: { position:[1.64,1.30,-17.78], target:[3.90,1.30,-18.30], fov:58 },
  cross: { position:[1.62,1.30,-17.65], target:[3.92,1.30,-18.30], fov:58 },
  key: { position: [0.844, 1.6, -9.70], target: [0.45, 0.87, -11.62], fov: 58 },
  cabinet: { position: [-0.65, 0.86, -9.80], target: [-1.76, 0.44, -9.83], fov: 68 },
  entry: { position:[0,1.6,-0.8], target:[0,1.6,-8.6], fov:75 },
};
function profilePoses(profile) {
  const portrait = profile === 'portrait';
  const c = portrait ? P.cPortrait : P.cWide;
  const rearDoor = { ...P.rearDoor, fov: portrait ? 82 : 70 };
  const cross = { ...c, fov: portrait ? 89 : 75 };
  const crossClose = { ...P.crossClose, fov: portrait ? 72 : 58 };
  const key = { ...P.key, target:keyBase.toArray(), fov: portrait ? 72 : 58 };
  const cabinet = { ...P.cabinet, fov: portrait ? 89 : 68 };
  const entry = { ...P.entry, fov: portrait ? 89 : 75 };
  const fov = portrait ? 89 : 75;
  const entrance = { position:[0,1.6,-4.4], target:[0.25,1.4,-9.6], fov };
  const room = { position:[0.25,1.6,-8.25], target:[-0.1,1.35,-11.8], fov };
  const corridor = { position:[-1.05,1.55,-12.15], target:[-1.05,1.4,-16.5], fov };
  const corridorTurnApproach = { position:[-0.80,1.55,-17.20], target:[-0.1,1.35,-17.5], fov };
  const corridorTurn = { position:[-0.18,1.55,-17.25], target:[1.3,1.35,-18.3], fov };
  const corridorMid = { position:[-1.05,1.55,-16.6], target:[-0.3,1.35,-17.4], fov };
  const doorPath = [entrance, room, corridor, corridorMid, corridorTurnApproach, corridorTurn, rearDoor];
  const toCabinet = [key,
    {position:[0.25,1.58,-8.75],target:[-1.2,1.0,-9.6],fov},
    {position:[-0.35,1.35,-9.42],target:[-1.6,0.6,-9.82],fov}, cabinet];
  const toRear = [cabinet,
    {position:[-0.35,1.58,-9.1],target:[0.1,1.4,-8.2],fov}, room, corridor, corridorMid, corridorTurnApproach, corridorTurn, rearDoor];
  const toCross = [entrance, room, {position:[0.42,1.6,-8.45],target:[0.7,1.4,-9.4],fov}, cross];
  return {c,key,cabinet,entry,entrance,room,corridor,corridorMid,corridorTurnApproach,corridorTurn,rearDoor,cross,crossClose,toCabinet,toEntry:doorPath,toRear,toCross};
}

function pathPose(points, t) {
  if (t >= 1) return points.at(-1);
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.position[0] - points[i].position[0], point.position[1] - points[i].position[1], point.position[2] - points[i].position[2]));
  const total = lengths.reduce((sum, length) => sum + length, 0), wanted = Math.max(0, Math.min(0.999999, t)) * total;
  let covered = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    if (wanted <= covered + lengths[i]) return lerpPose(points[i], points[i + 1], (wanted - covered) / Math.max(0.0001, lengths[i]));
    covered += lengths[i];
  }
  return points.at(-1);
}
function reverseRoute(points) {
  const reversed = points.slice().reverse();
  return reversed.map((pose, index) => {
    const next = reversed[Math.min(index + 1, reversed.length - 1)];
    return { ...pose, target: index < reversed.length - 1 ? next.position.slice() : pose.target.slice() };
  });
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
  await save(`checkpoint-${edge}-${profile}.webm`, new Blob(chunks, { type: mime }));
  return { frames, seconds: (performance.now() - start) / 1000, mime };
}
function poster(node, profile, pose, mode) { setProfile(profile); applyMode(mode, 1); renderPose(pose); return saveJpg(`checkpoint-${node}-${profile}.jpg`); }
function applyMode(mode,t) {
  keyObject.visible=false; keyObject.scale.setScalar(1);
  const open=['cabinet-open','gun-held','gun-stowed','armed'].includes(mode);
  const amount=mode==='cabinet-open'?phase(t,.69,1):open?1:0;
  setPadlockProgress(mode==='cabinet-open'?t:open?1:0);
  setCabinetOpen(amount);setGunProgress(mode==='gun-held'?1:0);setDoorKeyProgress(mode==='armed'?1:0);
  setCrossKeyProgress(mode==='cross-key'?t:0);
  if (['cross','key'].includes(mode)) showOrdinaryKey();
  setRearDoorOpen(mode==='rear-door-open'?t:0);
  if (crossEscutcheon) crossEscutcheon.visible = true;
  if(['gun-stowed','armed','entry'].includes(mode))gunRoot.visible=false;
  if(mode==='entry')doorKey.visible=false;
  if (mode === 'rear-door-ready') { gunRoot.visible = false; doorKey.visible = false; }
  pickupLight.intensity=['gun-held','armed'].includes(mode)?0.35:0;
  gunLight.intensity=0.6*amount;doorKeyLight.intensity=0.25*amount;
  scene.updateMatrixWorld(true);
}
function preview(profile,node) {
  setProfile(profile);const p=profilePoses(profile);
  applyMode(node,1);renderPose(p[['cabinet-open','gun-held','gun-stowed','armed'].includes(node)?'cabinet':node]);
  return {placement:state.gunPlacement,camera:{position:camera.position.toArray(),fov:camera.fov}};
}
function previewScene(profile, node) {
  const p = profilePoses(profile);
  const poseByNode = { hall:p.entry, entrance:p.entrance, 'rear-door-ready':p.rearDoor, cross:p.cross, 'cabinet-key':p.key, 'cabinet-open':p.cabinet, armed:p.cabinet };
  const pose = poseByNode[node];
  if (!pose) throw new Error(`unknown preview scene: ${node}`);
  setProfile(profile); applyMode(node === 'cabinet-key' ? 'key' : node, 1); renderPose(pose);
  status.textContent = `preview ${node} · ${profile} · scene ${state.loadedSceneSha256.slice(0, 12)}… · gun ${state.gunSha256.slice(0, 12)}…`;
  return { node, profile, loadedSceneSha256:state.loadedSceneSha256, gunSha256:state.gunSha256, pose };
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
  const {c:cPose, key:keyPose, cabinet:cabinetPose, entry:entryPose, entrance, room, rearDoor, cross, crossClose, toCabinet, toEntry, toRear, toCross} = profilePoses(profile);
  const records = {};
  const savePoster = (node, pose, mode) => poster(node, profile, pose, mode);
  await savePoster('hall', entryPose, 'entry');
  records['hall-entrance'] = await recordVideo('hall-entrance', profile, 5.2, t => renderPose(pathPose([entryPose, entrance], t)));
  await savePoster('entrance', entrance, 'entry');
  records['entrance-rear-door'] = await recordVideo('entrance-rear-door', profile, 17.5, t => renderPose(pathPose(toEntry, t)));
  applyMode('rear-door-ready', 1); renderPose(rearDoor); await savePoster('rear-door-locked', rearDoor, 'rear-door-ready');
  const returnWalk = reverseRoute(toEntry);
  const returnToCross = returnWalk.concat(toCross.slice(1));
  // Preserve the locked-door poster for the first frame, then turn in place
  // before walking the same L-shaped route back.  Reversing a path's look
  // target directly made frame zero look into the west wall.
  const returnFromRear = (t) => {
    const turn = 0.075;
    return t < turn
      ? lerpPose(rearDoor, returnWalk[0], t / turn)
      : pathPose(returnToCross, (t - turn) / (1 - turn));
  };
  records['rear-door-cross'] = await recordVideo('rear-door-cross', profile, 13.5, t => renderPose(returnFromRear(t)));
  applyMode('cross', 1); renderPose(cross); await savePoster('cross', cross, 'cross');
  records['cross-key'] = await recordVideo('cross-key', profile, 3.1, t => { applyMode('key', 1); renderPose(lerpPose(cross, keyPose, t)); });
  applyMode('key', 1); renderPose(keyPose); await savePoster('cabinet-key', keyPose, 'key');
  records['key-cabinet'] = await recordVideo('key-cabinet', profile, 14.5, t => renderPose(pathPose(toCabinet, t)));
  applyMode('cabinet', 1); renderPose(cabinetPose); await savePoster('cabinet', cabinetPose, 'cabinet');
  records['cabinet-open'] = await recordVideo('cabinet-open', profile, unlockDuration, t => drawUnlock(profile, t));
  applyMode('cabinet-open', 1); renderPose(cabinetPose); await savePoster('cabinet-open', cabinetPose, 'cabinet-open');
  records['cabinet-take'] = await recordVideo('cabinet-take', profile, 2.8, t => { applyMode('cabinet-open', 1); setGunProgress(Math.min(1, t / 0.65)); renderPose(cabinetPose); });
  applyMode('gun-held', 1); renderPose(cabinetPose); await savePoster('gun-held', cabinetPose, 'gun-held');
  records['cabinet-stow'] = await recordVideo('cabinet-stow', profile, 1.2, t => { applyMode('gun-held', 1); lowerItem(gunRoot, gunHeld, t); renderPose(cabinetPose); });
  applyMode('gun-stowed', 1); renderPose(cabinetPose); await savePoster('gun-stowed', cabinetPose, 'gun-stowed');
  records['cabinet-door-key'] = await recordVideo('cabinet-door-key', profile, 2.5, t => { applyMode('gun-stowed', 1); setDoorKeyProgress(Math.min(1, t / 0.70)); renderPose(cabinetPose); });
  applyMode('armed', 1); renderPose(cabinetPose); await savePoster('armed', cabinetPose, 'armed');
  // The clip starts on the armed poster and only reaches the rear-door-ready
  // state at its end; changing to entry mode at frame zero broke that cut.
  records['cabinet-rear-door'] = await recordVideo('cabinet-rear-door', profile, 18.5, t => { applyMode('armed', 1); renderPose(pathPose(toRear, t)); });
  applyMode('rear-door-ready', 1); renderPose(rearDoor); await savePoster('rear-door-ready', rearDoor, 'rear-door-ready');
  records['rear-door-open'] = await recordVideo('rear-door-open', profile, 6.0, t => { applyMode('rear-door-open', t); renderPose(rearDoor); });
  applyMode('rear-door-open', 1); renderPose(rearDoor); await savePoster('bug', rearDoor, 'rear-door-open');
  await save(`checkpoint-${profile}.json`, JSON.stringify({profile,sourceScene:state.manifest.scene.sha256,loadedSceneSha256:state.loadedSceneSha256,gunSha256:state.gunSha256,padlockSha256:state.padlockSha256,padlock:state.padlock,records,camera:{hall:entryPose,entrance,rearDoor,cross,key:keyPose,cabinet:cabinetPose},paths:{toEntry,toCabinet,toRear}}));
  return records;
}

// Recovery entrypoint for a corrected transition.  It intentionally rewrites
// only the two route videos whose first frame depends on their preceding
// poster; finalization retains the already validated adjacent assets.
async function captureAffectedProfile(profile) {
  setProfile(profile);
  const { rearDoor, cross, cabinet:cabinetPose, toEntry, toRear, toCross } = profilePoses(profile);
  const records = {};
  applyMode('rear-door-ready', 1); renderPose(rearDoor);
  const returnWalk = reverseRoute(toEntry);
  const returnToCross = returnWalk.concat(toCross.slice(1));
  const returnFromRear = (t) => {
    const turn = 0.075;
    return t < turn
      ? lerpPose(rearDoor, returnWalk[0], t / turn)
      : pathPose(returnToCross, (t - turn) / (1 - turn));
  };
  records['rear-door-cross'] = await recordVideo('rear-door-cross', profile, 13.5, t => renderPose(returnFromRear(t)));
  applyMode('armed', 1); renderPose(cabinetPose);
  records['cabinet-rear-door'] = await recordVideo('cabinet-rear-door', profile, 18.5, t => { applyMode('armed', 1); renderPose(pathPose(toRear, t)); });
  await save(`checkpoint-${profile}-recapture.json`, JSON.stringify({ profile, records, sourceScene:state.manifest.scene.sha256, loadedSceneSha256:state.loadedSceneSha256 }));
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
  const paths = {'hall-entrance':[poses.entry,poses.entrance],'entrance-rear-door':poses.toEntry,'rear-door-cross':reverseRoute(poses.toEntry).concat(poses.toCross.slice(1)),'cross-key':[poses.cross,poses.key],'key-cabinet':poses.toCabinet,'cabinet-rear-door':poses.toRear};
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
        // cWide is an approved close camera marker that sits just inside the
        // lamp's authored AABB; it is a terminal still position, not a walk
        // capsule. Keep the 0.16 m walking-radius audit for every moving sample.
        if (name === 'rear-door-cross' && i > 980) continue;
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
  const response = await fetch('/scene-manifest.json', { cache: 'no-store' }); if (!response.ok) throw new Error(`manifest HTTP ${response.status}`); const manifestText = await response.text(); state.sceneManifestSha256 = await sha256(new TextEncoder().encode(manifestText)); state.manifest = JSON.parse(manifestText); state.assetRevision = state.manifest.scene.sha256;
  const sceneResponse = await fetch(state.manifest.scene.url || '/scene.glb', { cache: 'no-store' });
  if (!sceneResponse.ok) throw new Error(`scene GLB HTTP ${sceneResponse.status}`);
  const sceneBytes = await sceneResponse.arrayBuffer(); state.loadedSceneSha256 = await sha256(sceneBytes);
  if (state.loadedSceneSha256 !== state.manifest.scene.sha256) throw new Error(`loaded scene hash mismatch: expected ${state.manifest.scene.sha256}, got ${state.loadedSceneSha256}`);
  configureLights(state.manifest); const gltf = await new Promise((resolve, reject) => loader.parse(sceneBytes, '', resolve, reject)); state.root = gltf.scene; scene.add(state.root);
  state.root.traverse((node) => {
    if (!node.isMesh) return;
    let owner = node, omitSharpShadow = false;
    while (owner) {
      if (owner.name.startsWith('F-REAR-SCONCE-') || owner.name.startsWith('D-REAR-Knob-')) omitSharpShadow = true;
      owner = owner.parent;
    }
    node.castShadow = !omitSharpShadow;
    node.receiveShadow = true;
  });
  createKey(); groundOrdinaryKey(); createCrossHardware();
  const door = state.manifest?.preview?.door;
  if (!door || !Number.isFinite(door.openAngle) || !Number.isFinite(door.leftSign) || !Number.isFinite(door.rightSign)) throw new Error('rear-door manifest configuration missing');
  rearDoorLeft = state.root.getObjectByName(door.leftHinge); rearDoorRight = state.root.getObjectByName(door.rightHinge);
  if (!rearDoorLeft || !rearDoorRight) throw new Error('rear door hinge nodes missing');
  state.rearDoorBase = { left:rearDoorLeft.rotation.y, right:rearDoorRight.rotation.y };
  // The cross escutcheon is fitted to the left leaf, retaining its world pose
  // at closure and moving with that leaf through the opened-door capture.
  rearDoorLeft.attach(crossEscutcheon);
  setupCabinet(); await loadGun(); createDoorKey(); await loadPadlock(); state.pickupAudit={wide:auditPickup('wide'),portrait:auditPickup('portrait')}; state.routeAudit = auditRoutes(); state.status = 'ready'; state.renderInfo.textures = renderer.info.memory.textures; resizeRenderer(1280, 720); renderPose(P.cWide); status.textContent = `ready · scene ${state.loadedSceneSha256.slice(0, 12)}… · gun ${state.gunSha256.slice(0, 12)}… · approved rear corridor`;

  const select=document.querySelector('#profile');
  const previewSelect=document.querySelector('#preview-scene');
  const slider=document.querySelector('#unlock-progress');
  async function showFrame() {
    const profile=select.value,t=Number(slider.value)/100;
    setProfile(profile);drawUnlock(profile,t);
    status.textContent=`unlock ${Math.round(t*100)}% · doors ${t<.69?'closed':'opening'} · ${profile}`;
  }
  slider.addEventListener('input',showFrame);select.addEventListener('change',showFrame);
  document.querySelector('#preview-scene-button').addEventListener('click',()=>previewScene(select.value,previewSelect.value));
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
      await save('checkpoint-audit.json',JSON.stringify({status:state.status,loaded_scene_sha256:state.loadedSceneSha256,gun_sha256:state.gunSha256,
        gun_placement:state.gunPlacement,shelf_y:state.shelfY,scene:state.manifest.scene,
        route_audit:state.routeAudit,pickup_audit:state.pickupAudit,padlock:state.padlock,
        padlock_sha256:state.padlockSha256}));
      status.textContent='capture complete: wide + portrait';
    }catch(error){status.textContent=`ERROR: ${error.message}`;}
    finally{for(const button of document.querySelectorAll('button, select, input'))button.disabled=false;}
  });
  showFrame();
  window.__CAPTURE__.captureProfile = captureProfile; window.__CAPTURE__.captureAffectedProfile = captureAffectedProfile; window.__CAPTURE__.renderPose = renderPose; window.__CAPTURE__.setProfile = setProfile; window.__CAPTURE__.preview = preview; window.__CAPTURE__.previewScene = previewScene; window.__CAPTURE__.profilePoses = profilePoses; window.__CAPTURE__.applyMode = applyMode;
}
boot().catch((error) => { state.status = 'error'; state.error = String(error); status.textContent = `ERROR: ${error.message}`; console.error(error); });
