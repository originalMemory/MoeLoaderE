import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { restoreSearchSettings, validateSearchSettings } from '../src/shared/search-settings.ts'

test('搜索设置：共享加载限额、展示过滤、历史隔离/上限/清理和重启', {timeout:60000}, async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-search-settings-'))
 await writeFile(join(profile,'browser.json'),JSON.stringify({viewed:'0,1004',history:['old'],pixivHistory:['pixiv-old'],searchSettings:{loadConcurrency:5,historyLimit:5}}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app)await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
  await app.evaluate(({session,nativeImage})=>{
   globalThis.imageActive=0;globalThis.imagePeak=0;globalThis.imageStarted=0;globalThis.releaseImages=[];globalThis.holdImages=true;globalThis.searchPages=[]
   const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
   session.fromPartition('persist:moe-site-konachan-g').protocol.handle('https',async request=>{
    const url=new URL(request.url)
    if(url.pathname==='/tag.json')return new Response('[]')
    if(url.pathname==='/post.json'){
     const page=Number(url.searchParams.get('page'));globalThis.searchPages.push(page)
     return new Response(JSON.stringify(page>2?[]:Array.from({length:10},(_,i)=>({id:1000+(page-1)*10+i,width:640,height:360,rating:'s',tags:'sky',preview_url:`https://konachan.net/${page}-${i}.png`,sample_url:`https://konachan.net/${page}-${i}.png`,file_url:`https://konachan.net/${page}-${i}.png`})) ))
    }
    globalThis.imageActive++;globalThis.imageStarted++;globalThis.imagePeak=Math.max(globalThis.imagePeak,globalThis.imageActive)
    if(globalThis.holdImages)await new Promise(resolve=>globalThis.releaseImages.push(resolve))
    globalThis.imageActive--;return new Response(png,{headers:{'content-type':'image/png'}})
   })
  })
  const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#clear-history').onclick!==null);return page
 }
 const waitMain=async predicate=>{for(let i=0;i<500;i++){if(await app.evaluate(predicate))return;await new Promise(resolve=>setTimeout(resolve,10))}throw Error('等待主进程状态超时')}
 let page=await launch()
 await page.locator('#keyword').fill('first');await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click()
 await waitMain(()=>globalThis.imageActive===5)
 assert.equal(await page.locator('.picture.loading').count(),5)
 // All retry paths share the same queue, including repeated refresh requests.
 await page.locator('#gallery').focus();await page.keyboard.press('Control+r');await page.keyboard.press('Control+r')
 assert.equal(await app.evaluate(()=>globalThis.imageStarted),5)
 await page.locator('#settings-toggle').click()
 await page.locator('#load-concurrency').fill('8');await page.locator('#load-concurrency').press('Tab')
 await waitMain(()=>globalThis.imageActive===8)
 await page.locator('#load-concurrency').fill('5');await page.locator('#load-concurrency').press('Tab')
 await page.waitForFunction(async()=>(await window.moe.init()).searchSettings.loadConcurrency===5)
 await app.evaluate(()=>globalThis.releaseImages.splice(0,4).forEach(resolve=>resolve()))
 await waitMain(()=>globalThis.imageStarted===9)
 assert.equal(await app.evaluate(()=>globalThis.imageActive),5,'调低上限后只补足到五个任务')
 await page.locator('#settings-toggle').click();await page.locator('#search').click()
 await waitMain(()=>globalThis.searchPages.length===2)
 await page.waitForFunction(()=>document.querySelectorAll('.picture.loading').length===0)
 assert.equal(await app.evaluate(()=>globalThis.imageStarted),9,'新搜索不能越过旧请求占用的槽位')
 await app.evaluate(()=>{globalThis.holdImages=false;globalThis.releaseImages.splice(0).forEach(resolve=>resolve())})
 await page.locator('.picture.loaded').nth(9).waitFor()
 assert.equal(await app.evaluate(()=>globalThis.imagePeak),8)
 assert.equal(await app.evaluate(()=>globalThis.imageStarted),19,'旧搜索尚未开始的任务应丢弃')
 await page.locator('#settings-toggle').click()
 await page.locator('#hide-viewed').check()
 await page.waitForFunction(()=>document.querySelectorAll('.picture').length===5)
 assert.equal(await page.locator('.picture.viewed').count(),0)
 assert.equal(await page.locator('#next').isEnabled(),true)
 assert.deepEqual(await app.evaluate(()=>globalThis.searchPages),[1,1],'隐藏已读不补请求、不改变分页')
 await page.locator('#hide-viewed').uncheck();await page.waitForFunction(()=>document.querySelectorAll('.picture').length===10)
 await page.locator('#hide-viewed').check();await page.waitForFunction(()=>document.querySelectorAll('.picture').length===5)
 await page.screenshot({path:'artifacts/search-settings.png',animations:'disabled'})
 await page.locator('#settings-toggle').click();await page.locator('#next').click();await page.locator('.picture.loaded').nth(9).waitFor()
 assert.deepEqual(await app.evaluate(()=>globalThis.searchPages),[1,1,2])
 const search=keyword=>page.evaluate(keyword=>window.moe.search({keyword,page:1,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0}),keyword)
 for(let i=0;i<7;i++)await search(`tag-${i}`)
 await search('tag-4')
 assert.deepEqual((await page.evaluate(()=>window.moe.hints(''))).map(h=>h.word),['tag-4','tag-6','tag-5','tag-3','tag-2'])
 assert.deepEqual((await page.evaluate(()=>window.moe.hints('','pixiv'))).map(h=>h.word),['pixiv-old'])
 const before=await readFile(join(profile,'browser.json'),'utf8')
 for(const invalid of [{loadConcurrency:4,historyLimit:5,hideViewed:true},{loadConcurrency:5,historyLimit:31,hideViewed:true},{loadConcurrency:5,historyLimit:5,hideViewed:'yes'}])await assert.rejects(()=>page.evaluate(value=>window.moe.setSearchSettings(value),invalid),/搜索设置/)
 assert.equal(await readFile(join(profile,'browser.json'),'utf8'),before)
 // Exercise the full upper limit so reload cannot silently truncate at the legacy 26.
 await page.locator('#settings-toggle').click();await page.locator('#history-limit').fill('30');await page.locator('#history-limit').press('Tab')
 await page.waitForFunction(async()=>(await window.moe.init()).searchSettings.historyLimit===30)
 for(let i=0;i<32;i++)await search(`new-${i}`)
 await app.close();app=undefined
 page=await launch();await app.evaluate(()=>{globalThis.holdImages=false})
 const restored=await page.evaluate(()=>window.moe.init())
 assert.deepEqual(restored.searchSettings,{loadConcurrency:5,historyLimit:30,hideViewed:true})
 assert.equal((await page.evaluate(()=>window.moe.hints(''))).length,30)
 await app.evaluate(async({session})=>session.fromPartition('persist:moe-site-pixiv').cookies.set({url:'https://www.pixiv.net',name:'fixture',value:'preserve',expirationDate:Date.now()/1000+3600}))
 await page.locator('#settings-toggle').click()
 await page.locator('#history-limit').fill('5');await page.locator('#history-limit').press('Tab')
 await page.waitForFunction(async()=>(await window.moe.hints('')).length===5)
 await page.locator('#clear-history').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='已清除所有历史记录')
 assert.deepEqual(await page.evaluate(()=>window.moe.hints('')),[])
 assert.deepEqual(await page.evaluate(()=>window.moe.hints('','pixiv')),[])
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-pixiv').cookies.get({name:'fixture'}))[0].value),'preserve')
 await app.close();app=undefined
 page=await launch();await app.evaluate(()=>{globalThis.holdImages=false})
 assert.deepEqual(await page.evaluate(()=>window.moe.hints('')),[])
 assert.deepEqual(await page.evaluate(()=>window.moe.hints('','pixiv')),[])
 await page.locator('#parameters-toggle').click();await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click()
 await page.locator('#no-results').waitFor({state:'visible'})
 assert.equal(await page.locator('.picture').count(),0,'清除关键词历史不清除已读记录')
 assert.equal(await page.locator('#next').isEnabled(),true,'整页已读也仍能翻下一页')
 assert.deepEqual(await app.evaluate(()=>globalThis.searchPages),[1])
})


test('搜索设置恢复逐字段补默认值，IPC 校验仍严格',()=>{
 for(const value of [undefined,null,false,[],{}])assert.deepEqual(restoreSearchSettings(value),{loadConcurrency:8,historyLimit:25,hideViewed:false})
 assert.deepEqual(restoreSearchSettings({loadConcurrency:5,historyLimit:30}),{loadConcurrency:5,historyLimit:30,hideViewed:false})
 assert.deepEqual(restoreSearchSettings({loadConcurrency:21,historyLimit:10,hideViewed:true}),{loadConcurrency:8,historyLimit:10,hideViewed:true})
 assert.deepEqual(restoreSearchSettings({loadConcurrency:6,historyLimit:'30',hideViewed:'false'}),{loadConcurrency:6,historyLimit:25,hideViewed:false})
 assert.throws(()=>validateSearchSettings({loadConcurrency:5,historyLimit:30}),/搜索设置/)
 assert.throws(()=>validateSearchSettings({loadConcurrency:21,historyLimit:10,hideViewed:true}),/搜索设置/)
})

test('新搜索等待和取消后切换隐藏已读，不恢复旧页', {timeout:30000}, async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-search-page-'))
 await writeFile(join(profile,'browser.json'),JSON.stringify({viewed:'0,1004'}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
 t.after(async()=>{await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 await app.evaluate(({session,nativeImage})=>{
  const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
  session.fromPartition('persist:moe-site-konachan-g').protocol.handle('https',async request=>{
   const url=new URL(request.url)
   if(url.pathname==='/tag.json')return new Response('[]')
   if(url.pathname==='/post.json'){
    if(url.searchParams.get('tags').startsWith('slow'))await new Promise(resolve=>globalThis.releaseSearch=resolve)
    return new Response(JSON.stringify(Array.from({length:10},(_,i)=>({id:1000+i,width:640,height:360,rating:'s',preview_url:'https://konachan.net/a.png',sample_url:'https://konachan.net/a.png',file_url:'https://konachan.net/a.png'}))))
   }
   return new Response(png,{headers:{'content-type':'image/png'}})
  })
 })
 const page=await app.firstWindow();await page.waitForLoadState('load')
 await page.locator('#keyword').fill('old');await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click();await page.locator('.picture.loaded').nth(9).waitFor()
 await page.locator('#keyword').fill('slow');await page.locator('#search').click()
 await page.waitForFunction(()=>document.querySelectorAll('.picture').length===0)
 await page.locator('#settings-toggle').click();await page.locator('#hide-viewed').check()
 await page.waitForFunction(()=>!document.querySelector('#hide-viewed').disabled)
 assert.equal(await page.locator('.picture').count(),0)
 assert.equal(await page.locator('#pages button').count(),0)
 await page.locator('#settings-toggle').click();await page.locator('#search').click()
 await page.locator('#settings-toggle').click();await page.locator('#hide-viewed').uncheck()
 await page.waitForFunction(()=>!document.querySelector('#hide-viewed').disabled)
 assert.equal(await page.locator('.picture').count(),0)
 assert.equal(await page.locator('#pages button').count(),0)
 await app.evaluate(()=>globalThis.releaseSearch?.())
 await page.locator('#settings-toggle').click();await page.locator('#keyword').fill('fresh');await page.locator('#search').click()
 await page.locator('.picture.loaded').nth(9).waitFor()
 assert.equal(await page.locator('#pages button').count(),1)
})
