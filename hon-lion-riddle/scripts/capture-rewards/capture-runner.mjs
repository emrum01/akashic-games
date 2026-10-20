const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { finalizeCapture } from './finalize-capture.mjs';
const root = process.env.CAPTURE_OUTPUT;
if (!root) throw new Error('Set CAPTURE_OUTPUT to the server output directory');
const browser = await chromium.launch({headless:true,args:['--enable-gpu','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});
 await page.goto('http://127.0.0.1:8812/',{waitUntil:'networkidle',timeout:120000});
 await page.waitForFunction(()=>['ready','error'].includes(window.__CAPTURE__?.status),null,{timeout:120000});
 const info=await page.evaluate(()=>{const s=window.__CAPTURE__;return {status:s.status,error:s.error,gun_sha256:s.gunSha256,gun_placement:s.gunPlacement,shelf_y:s.shelfY,scene:s.manifest.scene,route_audit:s.routeAudit,pickup_audit:s.pickupAudit,padlock:s.padlock,padlock_sha256:s.padlockSha256}});
 if(info.status!=='ready')throw Error(info.error);
 for(const profile of ['wide','portrait']) {
  console.log('Capturing '+profile);
  await page.evaluate(profile=>window.__CAPTURE__.captureProfile(profile),profile);
 }
 await finalizeCapture(root,info,errors);
} finally {await browser.close()}
