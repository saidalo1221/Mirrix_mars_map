import assert from 'node:assert/strict';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createAppServer} from '../scripts/serve.mjs';

const [, , modulePath, executablePath, screenshots] = process.argv;
const {chromium}=await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const server=createAppServer().listen(0,'127.0.0.1');
await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
let browser;
try {
  browser=await chromium.launch({executablePath,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run']});
  const page=await browser.newPage({viewport:{width:1440,height:940}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);
  const surface=page.locator('#surface'), loading=page.locator('#map-loading');
  await page.waitForFunction(()=>document.querySelector('#region-detail').textContent.includes('Global MOLA'));
  await loading.waitFor({state:'hidden'});
  const defaultRect=await surface.boundingBox();
  const size=page.getByText('Map size',{exact:true});
  await size.click();
  await page.locator('#map-height').focus();
  await page.keyboard.press('End');
  assert.ok((await surface.boundingBox()).height > defaultRect.height+100);
  await page.getByRole('checkbox',{name:'Wide map'}).check();
  assert.ok((await surface.boundingBox()).width > defaultRect.width+300);
  await page.reload();
  assert.equal(await page.locator('#map-height').inputValue(),'95');
  assert.equal(await page.locator('#map-wide').isChecked(),true);
  await size.click();
  await page.getByRole('button',{name:'Reset size'}).click();
  assert.equal(await page.locator('#map-height').inputValue(),'68');
  assert.equal(await page.locator('#map-wide').isChecked(),false);
  await size.click();

  let releaseTerrain;
  const terrainGate=new Promise(resolve=>{releaseTerrain=resolve;});
  await page.route('**/assets/terrain/jezero.json',async route=>{
    await terrainGate;
    await route.continue();
  });
  await page.locator('#region').selectOption('jezero');
  await loading.waitFor();
  assert.match(await loading.textContent(),/Loading terrain.*Jezero/);
  if (screenshots) await surface.screenshot({path:screenshots+'/terrain-loading-orbits.png'});
  releaseTerrain();
  await loading.waitFor({state:'hidden'});
  assert.equal(await page.locator('#map-heading').textContent(),'Regional terrain');

  await page.route('**/assets/terrain/gale.json',async route=>{
    await new Promise(resolve=>setTimeout(resolve,450));
    await route.abort();
  });
  await page.locator('#region').selectOption('gale');
  await loading.waitFor();
  assert.match(await loading.textContent(),/Loading terrain.*Gale/);
  await loading.waitFor({state:'hidden'});
  assert.match(await page.locator('#region-detail').textContent(),/fetch|request/i);
  assert.deepEqual(errors,[]);

  const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',hasTouch:true,isMobile:true});
  await mobile.goto(base);
  await mobile.getByText('Map size',{exact:true}).tap();
  const width=await mobile.evaluate(()=>document.documentElement.scrollWidth);
  assert.equal(width,390);
  await mobile.getByRole('checkbox',{name:'Wide map'}).check();
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
  assert.equal(await mobile.locator('.orbit-mars i').evaluate(item=>getComputedStyle(item).animationName),'none');
  console.log('Map sizing, persistence, mobile layout, and terrain loading success and failure passed.');
} finally {
  await browser?.close();
  server.close();
}
