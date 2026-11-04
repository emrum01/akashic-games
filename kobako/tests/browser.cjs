const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
(async()=>{
 const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../index.html'));
 const evidence=process.env.KOBAKO_EVIDENCE||'/tmp/kobako-browser-evidence';fs.mkdirSync(evidence,{recursive:true});
 const server=http.createServer((req,res)=>{
  if(req.url==='/kobako'){res.writeHead(301,{Location:'/kobako/'});return res.end();}
  if(req.url==='/kobako/'||req.url==='/kobako/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/kobako/`;
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
  for(const javaScriptEnabled of [false,true]){
   const context=await browser.newContext({javaScriptEnabled,viewport:{width:360,height:800},hasTouch:true,isMobile:true});
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
   const response=await page.goto(url);assert.equal(response.status(),200);
   assert.equal(await page.locator('.tile').count(),33);
   assert.deepEqual(await page.locator('.letters').allTextContents(),['ほしほねしねほ','なしそねなそね','こねらこねこら','ゆとやゆや','ばみそみばそば']);
   assert(!(await page.locator('body').innerText()).includes('ことば'));
   assert.equal(await page.locator('details[open]').count(),0);
   await page.screenshot({path:path.join(evidence,javaScriptEnabled?'360-js.png':'360-no-js.png'),fullPage:true});
   if(javaScriptEnabled){
    const tile=page.locator('.tile').first();await tile.tap();assert.equal(await tile.getAttribute('aria-pressed'),'true');
    await page.locator('#undo').tap();assert.equal(await tile.getAttribute('aria-pressed'),'false');
    await tile.tap();await page.locator('#reset').tap();assert.equal(await tile.getAttribute('aria-pressed'),'false');
    await page.locator('#answer').fill('ことば');await page.locator('#answer-form button').tap();assert.match(await page.locator('#feedback').innerText(),/正解/);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#effects').childElementCount===0);assert.equal(await page.locator('#effects > *').count(),0);
    for(const width of [320,390,1280]){await page.setViewportSize({width,height:800});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.screenshot({path:path.join(evidence,'1280-js.png'),fullPage:true});
    await page.goto(url+'index.html');assert.equal(await page.locator('.tile').count(),33);
   }else{
    assert(await page.locator('.tile').first().isDisabled());assert(await page.locator('#static-note').isVisible());assert(!(await page.locator('#answer-form').isVisible()));
   }
   assert.deepEqual(errors,[]);assert(requests.every(r=>r.startsWith(url)));
   await context.close();
  }
  console.log(JSON.stringify({status:'PASS',transport:'HTTP loopback',url,checks:['JS on/off: 33 static letters','no initial answer leak','tap undo reset solve','reduced motion','320/360/390/1280 layout','no external requests or JS errors'],evidence}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
