import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createAppServer} from '../scripts/serve.mjs';

const [, , modulePath, executablePath, screenshotDirectory] = process.argv;
const {chromium} = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const server = createAppServer().listen(0,'127.0.0.1');
await once(server,'listening');
let browser;
try {
  browser = await chromium.launch({executablePath,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader','--no-first-run']});
  const page = await browser.newPage({viewport:{width:1380,height:940},reducedMotion:'reduce',acceptDownloads:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.querySelector('#layer-credit').textContent.includes('Viking'));
  const panel=page.locator('#mars-time');
  const input=page.locator('#mars-time-input');
  const toggle=()=>panel.locator('summary').click();
  const setInput=async value=>{
    await input.fill(value);
    await input.press('Enter');
  };
  await toggle();
  assert.equal(await page.locator('#mars-time-play').getAttribute('aria-pressed'),'false');
  await setInput('2026-11-15T12:00:00Z');
  assert.equal(await page.locator('#mars-time-mtc').textContent(),'00:18:42');
  const before=await page.locator('#sun-coordinate-readout').textContent();
  await page.getByRole('button',{name:'+1 Mars hour',exact:true}).click();
  assert.equal(await page.locator('#mars-time-mtc').textContent(),'01:18:42');
  assert.notEqual(await page.locator('#sun-coordinate-readout').textContent(),before);
  await page.locator('#mars-time-mission').selectOption('curiosity');
  assert.match(await page.locator('#mars-time-rover-sol').textContent(),/Curiosity · Sol/);
  await page.locator('#mars-time-input-kind').selectOption('mars');
  await toggle();

  const mode=async name=>page.getByRole('button',{name,exact:true}).click();
  const screenshot=async (type,phase)=>{
    await toggle();
    await setInput(phase==='day'?'12:00:00':phase==='low'?'07:00:00':'00:00:00');
    await toggle();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const path=screenshotDirectory ? screenshotDirectory+'/mars-sun-'+type+'-'+phase+'.png' : undefined;
    const png=await page.locator('#surface').screenshot({path});
    return page.evaluate(async data=>{
      const img=new Image();
      img.src='data:image/png;base64,'+data;
      await img.decode();
      const canvas=document.createElement('canvas');
      canvas.width=img.width; canvas.height=img.height;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0);
      const bytes=ctx.getImageData(Math.floor(img.width*.43),Math.floor(img.height*.43),
        Math.floor(img.width*.14),Math.floor(img.height*.14)).data;
      let sum=0;
      for(let index=0;index<bytes.length;index+=4) sum+=bytes[index]+bytes[index+1]+bytes[index+2];
      return sum/(bytes.length*.75);
    },png.toString('base64'));
  };

  for (const [name,type] of [['Globe','globe'],['2D map','map'],['Terrain','terrain']]) {
    if (type==='terrain') {
      await page.getByRole('button',{name:'Open local terrain'}).click();
      await page.waitForFunction(()=>document.querySelector('#layer-credit').textContent.includes('HiRISE'));
    } else await mode(name);
    const noon=await screenshot(type,'day');
    const midnight=await screenshot(type,'night');
    assert.ok(noon>midnight*1.25,type+' day '+noon.toFixed(1)+' / night '+midnight.toFixed(1));
    if (type==='terrain') {
      const low=await screenshot(type,'low');
      assert.ok(midnight<low && low<noon,'Low-sun illumination lies between midnight and noon');
    }
    console.log(type+' luminance noon / midnight',noon.toFixed(1),midnight.toFixed(1));
  }

  await page.getByRole('button',{name:'Load mission demo'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#waypoints h3').length===3);
  await page.getByRole('button',{name:'Generate routes'}).click();
  await page.getByRole('button',{name:'Best window'}).waitFor();
  await page.getByText('Advanced settings',{exact:true}).click();
  await page.locator('#eva-start-time').fill('01:00:00');
  await page.locator('#eva-start-time').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#eva-warnings').textContent.includes('darkness'));
  await page.getByRole('button',{name:'Best window'}).click();
  await page.getByRole('button',{name:'Use suggested start'}).click();
  assert.ok(!(await page.locator('#eva-warnings').textContent()).includes('darkness'));
  const replayStart=await page.locator('#mars-time-utc').textContent();
  await page.getByRole('button',{name:'Play traverse',exact:true}).click();
  await page.waitForFunction(previous=>document.querySelector('#mars-time-utc').textContent!==previous,replayStart);
  await page.getByRole('button',{name:'Pause traverse',exact:true}).click();
  assert.equal(await page.locator('#mars-time-play').getAttribute('aria-pressed'),'false');
  await page.getByText('Leg and stop times',{exact:true}).click();
  assert.equal(await page.locator('#eva-stops li').count(),3);
  assert.match(await page.locator('#eva-stops').textContent(),/LTST · Sun/);
  const solBefore=await page.locator('#mars-time-utc').textContent();
  await page.locator('#progress').focus();
  await page.keyboard.press('End');
  assert.notEqual(await page.locator('#mars-time-utc').textContent(),solBefore);
  assert.match(await page.locator('#progress-value').textContent(),/2\.95 km/);
  const download = page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON'}).click();
  const json=JSON.parse(await readFile(await (await download).path(),'utf8'));
  assert.equal(json.solarSchedule.stops.length,3);
  assert.ok(json.solarSchedule.legs.length>=4);
  await page.evaluate(()=>{window.print=()=>{};});
  await page.getByRole('button',{name:'Print report'}).click();
  assert.match(await page.locator('#print-report').textContent(),/EVA solar timeline/);
  await toggle();
  await page.locator('#mars-time-speed').selectOption('3600');
  const clock=await page.locator('#mars-time-utc').textContent();
  await page.locator('#mars-time-play').click();
  await page.waitForFunction(previous=>document.querySelector('#mars-time-utc').textContent!==previous,clock);
  await page.locator('#mars-time-play').click();
  assert.deepEqual(errors,[]);
  console.log('Mars time browser workflow passed.');
} finally {
  await browser?.close();
  server.close();
}
