import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,writeFile,rm,mkdir,stat,symlink,open,realpath} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {_electron as electron} from 'playwright'

test('原背景设置：PNG/布局/文件边界、低性能即时切换及重启恢复',{timeout:45000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-display-')),folder=join(profile,'Background')
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app)await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
  await app.evaluate(({session,nativeImage,shell})=>{
   globalThis.imageRequests=0;shell.openPath=async path=>{globalThis.openedFolder=path;return ''}
   const pixels=Buffer.alloc(80*40*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=40;pixels[i+1]=180;pixels[i+2]=230;pixels[i+3]=255}
   globalThis.png=nativeImage.createFromBitmap(pixels,{width:80,height:40}).toPNG()
   session.fromPartition('persist:moe-site-konachan-g').protocol.handle('https',request=>{
    const url=new URL(request.url)
    if(url.pathname==='/tag.json')return new Response('[]')
    if(url.pathname==='/post.json')return new Response(JSON.stringify(Array.from({length:10},(_,i)=>({id:100+i,width:640,height:360,rating:'s',preview_url:`https://konachan.net/t${i}.png`,sample_url:`https://konachan.net/s${i}.png`,file_url:`https://konachan.net/f${i}.png` }))))
    globalThis.imageRequests++;return new Response(globalThis.png,{headers:{'content-type':'image/png'}})
   })
  })
  const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#background-directory').onclick!==null);return page
 }
 let page=await launch()
 assert.equal(await page.locator('#background-layer').isHidden(),true)
 await page.locator('#settings-toggle').click();await page.locator('#background-directory').click()
 await page.waitForFunction(async()=>{await window.moe.background();return true})
 assert.equal((await stat(folder)).isDirectory(),true)
 assert.equal(await realpath(await app.evaluate(()=>globalThis.openedFolder)),await realpath(folder))
 const bytes=Buffer.from(await app.evaluate(()=>[...globalThis.png]))
 const filename='sample width=300 height=200 ha=center.PNG'
 await writeFile(join(folder,filename),bytes)
 await writeFile(join(folder,'broken.png'),'not a png');await writeFile(join(folder,'unsupported.jpg'),bytes)
 await mkdir(join(folder,'directory.png'));await writeFile(join(profile,'outside.png'),bytes);await symlink(join(profile,'outside.png'),join(folder,'linked.png'))
 const large=await open(join(folder,'oversized.png'),'w');await large.truncate(41*1024*1024);await large.close()
 await page.locator('#change-background').click();await page.waitForFunction(()=>document.querySelector('#background-image').naturalWidth===80)
 const selected=await page.evaluate(()=>window.moe.background());assert.deepEqual({width:selected.width,height:selected.height,align:selected.align},{width:300,height:200,align:'center'})
 assert.equal(await page.locator('#background-layer').isVisible(),true)
 const layout=await page.locator('#background-image').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,fit:getComputedStyle(el).objectFit,align:getComputedStyle(el.parentElement).justifyContent}))
 assert.deepEqual(layout,{width:300,height:200,fit:'contain',align:'center'})
 assert.equal(await app.evaluate(async({net},url)=>(await net.fetch(url)).status,selected.url),200)
 for(const url of ['moe-image://background/outside.png',selected.url+'?file=outside.png','moe-image://background/../outside.png'])assert.equal(await app.evaluate(async({net},url)=>(await net.fetch(url)).status,url),404)
 await page.locator('#show-background').uncheck();await page.waitForFunction(()=>document.querySelector('#background-layer').hidden)
 await page.locator('#show-background').check();await page.locator('#background-layer').waitFor({state:'visible'})
 await page.locator('#low-performance').check();await page.waitForFunction(()=>document.documentElement.dataset.lowPerformance==='true')
 assert.equal((await page.evaluate(()=>window.moe.appearance())).acrylicEnabled,true)
 await page.locator('#settings-toggle').click();await page.locator('#parameters-toggle').click();await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click();await page.locator('.picture.loaded').nth(9).waitFor()
 assert.equal(await page.locator('.image-backdrop').first().evaluate(el=>el.width),0)
 assert.equal(await page.locator('.picture > img').first().evaluate(el=>getComputedStyle(el).animationName),'none')
 const requests=await app.evaluate(()=>globalThis.imageRequests)
 await page.locator('#settings-toggle').click();await page.locator('#low-performance').uncheck()
 await page.waitForFunction(()=>document.querySelector('.image-backdrop').width>0)
 assert.equal(await app.evaluate(()=>globalThis.imageRequests),requests,'恢复模糊底图不重新加载图片')
 assert.equal(await page.locator('.image-backdrop').first().evaluate(el=>getComputedStyle(el).display),'block')
 await page.locator('#low-performance').check();await page.waitForFunction(()=>document.querySelector('.image-backdrop').width===0)
 await page.screenshot({path:'artifacts/display-settings.png',animations:'disabled'})
 await page.locator('#show-background').uncheck();await page.waitForFunction(async()=>(await window.moe.init()).displaySettings.showBackground===false)
 await assert.rejects(()=>page.evaluate(()=>window.moe.setDisplaySettings({showBackground:'yes',lowPerformance:false})),/外观设置/)
 await app.close();app=undefined;page=await launch()
 assert.deepEqual((await page.evaluate(()=>window.moe.init())).displaySettings,{showBackground:false,lowPerformance:true})
 assert.equal(await page.locator('#background-layer').isHidden(),true)
 await page.locator('#settings-toggle').click();await page.locator('#show-background').check();await page.waitForFunction(()=>document.querySelector('#background-image').naturalWidth===80&&!document.querySelector('#background-layer').hidden)
 // The next file resets omitted filename parameters to the source defaults.
 await rm(join(folder,filename));await writeFile(join(folder,'plain.png'),bytes)
 await page.locator('#change-background').click();await page.waitForFunction(async()=>(await window.moe.background())?.width===670)
 assert.deepEqual(await page.evaluate(async()=>{const b=await window.moe.background();return [b.width,b.height,b.align]}),[670,530,'right'])
 const previous=await page.evaluate(()=>window.moe.background())
 await rm(join(folder,'plain.png'));await page.locator('#change-background').click();await page.waitForFunction(()=>!document.querySelector('#change-background').disabled)
 assert.deepEqual(await page.evaluate(()=>window.moe.background()),previous,'无有效图片时按源行为保留当前背景，不选择目录外文件')
 assert.equal(await app.evaluate(async({net},url)=>(await net.fetch(url)).status,selected.url),404)
})
