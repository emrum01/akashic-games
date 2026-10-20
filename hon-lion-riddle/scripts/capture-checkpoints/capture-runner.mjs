import { writeFile } from 'node:fs/promises';
import { finalizeCapture } from './finalize-capture.mjs';

// The game package does not own Playwright.  CI may resolve its normal package
// name; a local capture can supply the already installed ESM entry explicitly.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = process.env.CAPTURE_OUTPUT;
const port = process.env.CAPTURE_PORT || '8842';
if (!root) throw new Error('Set CAPTURE_OUTPUT');
const browser = await chromium.launch({ headless:true, args:['--enable-gpu','--use-angle=metal','--enable-webgl','--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:'networkidle', timeout:120000 });
  await page.waitForFunction(() => ['ready','error'].includes(window.__CAPTURE__?.status), { timeout:120000 });
  const info = await page.evaluate(() => ({ status:window.__CAPTURE__.status, error:window.__CAPTURE__.error, loaded_scene_sha256:window.__CAPTURE__.loadedSceneSha256, gun_sha256:window.__CAPTURE__.gunSha256, gun_placement:window.__CAPTURE__.gunPlacement, shelf_y:window.__CAPTURE__.shelfY, scene:window.__CAPTURE__.manifest.scene, sceneManifestSha256:window.__CAPTURE__.sceneManifestSha256, route_audit:window.__CAPTURE__.routeAudit, pickup_audit:window.__CAPTURE__.pickupAudit, padlock:window.__CAPTURE__.padlock, padlock_sha256:window.__CAPTURE__.padlockSha256 }));
  if (info.status !== 'ready') throw new Error(info.error);
  const recovery = process.env.CAPTURE_RECOVERY === 'affected-routes';
  const requestedProfiles = process.env.CAPTURE_PROFILES ? process.env.CAPTURE_PROFILES.split(',') : ['wide','portrait'];
  if (!requestedProfiles.every(profile => ['wide','portrait'].includes(profile))) throw new Error('CAPTURE_PROFILES must be wide and/or portrait');
  for (const profile of requestedProfiles) {
    console.log(`Capturing ${profile}${recovery ? ' affected routes' : ''}`);
    await page.evaluate(({ profile, recovery }) => recovery ? window.__CAPTURE__.captureAffectedProfile(profile) : window.__CAPTURE__.captureProfile(profile), { profile, recovery });
  }
  await page.evaluate(() => window.__CAPTURE__.saveAudit?.());
  await writeFile(`${root}/checkpoint-audit.json`, JSON.stringify(info, null, 2) + '\n');
  await finalizeCapture(root, info, errors);
} finally { await browser.close(); }
