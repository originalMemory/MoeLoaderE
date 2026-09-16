import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { downloadDefaults } from '../src/main/downloads.ts'

test('下载桌面闭环：入队、文件、类型、任务包、IPC 与关闭保护', {timeout:45000}, async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-download-ui-'))
 const directory=join(profile,'images'), bundlePath=join(profile,'unfinished.mlpub')
 await writeFile(join(profile,'downloads.json'),JSON.stringify({...downloadDefaults(directory),fileTemplate:'%id',folderTemplate:'%site'}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})}).catch(()=>{});await app.close().catch(()=>{})}await rm(profile,{recursive:true,force:true})})
 app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
 const bytes=await app.evaluate(({session,nativeImage,dialog},bundlePath)=>{
  globalThis.requests=[];globalThis.closeAnswer=2;globalThis.saveCancelled=false;globalThis.prompts=0
  dialog.showMessageBox=async()=>{globalThis.prompts++;return {response:globalThis.closeAnswer}}
  dialog.showSaveDialog=async()=>({canceled:globalThis.saveCancelled,filePath:bundlePath})
  dialog.showErrorBox=(_title,message)=>{globalThis.dialogError=message}
  const picture=nativeImage.createFromBitmap(Buffer.alloc(64*36*4,200),{width:64,height:36}), png=picture.toPNG(), jpg=picture.toJPEG(85)
  session.defaultSession.protocol.handle('https',async request=>{
   const u=new URL(request.url);globalThis.requests.push({url:request.url,referer:request.headers.get('referer')})
   if(u.pathname==='/tag.json')return new Response('[]')
   if(u.pathname==='/post.json')return new Response(JSON.stringify(Array.from({length:10},(_,i)=>({id:500+i,width:640,height:360,rating:'s',tags:'test landscape',preview_url:`https://konachan.net/${i}-thumb.png`,sample_url:`https://konachan.net/${i}-sample.png`,file_url:`https://konachan.net/${i}-original.jpg` }))))
   if(u.pathname==='/broken.jpg')return new Response('<html>not an image</html>',{headers:{'content-type':'text/html'}})
   if(u.pathname.endsWith('.jpg')){await new Promise(r=>setTimeout(r,100));return new Response(jpg,{headers:{'content-type':'image/jpeg','content-length':String(jpg.length)}})}
   return new Response(png,{headers:{'content-type':'image/png'}})
  })
  return {png:png.toString('base64'),jpg:jpg.toString('base64')}
 },bundlePath)
 const page=await app.firstWindow();await page.waitForLoadState('load')
 await page.locator('#keyword').fill('download');await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click()
 await page.locator('.picture.loaded').nth(9).waitFor()
 await page.locator('#search-form').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)))
 await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('下载',{exact:true}).click()
 await page.locator('.download-row[data-status=success]').waitFor()
 assert.deepEqual(await readFile(join(directory,'konachan-g','500.jpg')),Buffer.from(bytes.jpg,'base64'))
 const requests=await app.evaluate(()=>globalThis.requests)
 assert.ok(requests.some(r=>r.url.endsWith('0-original.jpg')&&r.referer==='https://konachan.net/post/show/500'))
 await page.locator('#quality-toggle').click();await page.getByRole('option',{name:'预览图',exact:true}).click()
 await page.locator('.picture input').nth(1).click();await page.locator('#download-selected').click()
 await page.locator('.download-row[data-status=success]').nth(1).waitFor()
 assert.deepEqual(await readFile(join(directory,'konachan-g','501.png')),Buffer.from(bytes.png,'base64'))
 assert.equal(await page.locator('.picture.selected').count(),0)
 await page.locator('#quality-toggle').click();await page.getByRole('option',{name:'自动',exact:true}).click()
 await page.locator('.picture input').nth(2).click();await page.locator('#download-selected').click()
 await page.locator('#keyword').fill('new-search');await page.locator('#search').click()
 await page.locator('.download-row[data-status=success]').nth(2).waitFor()
 assert.deepEqual(await readFile(join(directory,'konachan-g','502.jpg')),Buffer.from(bytes.jpg,'base64'))
 await page.screenshot({path:'artifacts/download-results.png',animations:'disabled'})
 const invalid=await page.evaluate(async()=>{
  const checks=[()=>window.moe.enqueue(['unknown'],'原图'),()=>window.moe.enqueue(['1-1-0'],'bad'),()=>window.moe.downloadAction('remove',['unknown']),()=>window.moe.downloadSettings({concurrency:0})]
  return Promise.all(checks.map(async check=>{try{await check();return false}catch{return true}}))
 });assert.deepEqual(invalid,[true,true,true,true])
 await page.locator('#settings-toggle').click()
 await page.locator('#download-settings [name=autoRename]').check()
 await page.screenshot({path:'artifacts/download-settings.png',animations:'disabled'})
 await page.locator('#settings-toggle').click()
 await page.locator('#settings-popup').waitFor({state:'hidden'})
 const current=await page.evaluate(()=>window.moe.downloads())
 assert.equal(current.settings.autoRename,true)
 await page.evaluate(async settings=>{await window.moe.downloadSettings({...settings,directory:'/must-not-be-used',autoRename:true})},current.settings)
 assert.equal((await page.evaluate(()=>window.moe.downloads())).settings.directory,directory)
 const bundle={schema:'MoeLoaderP.UnfinishedDownloadTasks',version:1,exportedAt:new Date().toISOString(),tasks:[{siteShortName:'konachan-g',id:'999',downloadUrl:'https://konachan.net/broken.jpg',localFileShortNameWithoutExt:'broken'}]}
 await writeFile(join(profile,'input.mlpub'),JSON.stringify(bundle))
 await page.evaluate(text => { const transfer = new DataTransfer(); transfer.items.add(new File([text], 'input.mlpub')); document.querySelector('#downloads').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer })) }, JSON.stringify(bundle))
 await page.locator('.download-row[data-status=failed]').waitFor()
 await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('已加入 1 个下载任务'))
 assert.equal(await page.evaluate(()=>window.moe.exportDownloads()),true)
 assert.equal(JSON.parse(await readFile(bundlePath,'utf8')).tasks.length,1)
 assert.equal(await page.evaluate(()=>window.moe.exportDownloads()),true)
 assert.equal(JSON.parse(await readFile(bundlePath,'utf8')).tasks.length,1)
 assert.equal((await readdir(join(directory,'konachan-g'))).some(n=>n.endsWith('.part')),false)
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close())
 await page.waitForTimeout(100);assert.equal(page.isClosed(),false);assert.equal(await app.evaluate(()=>globalThis.prompts),1)
 await app.evaluate(({BrowserWindow})=>{globalThis.closeAnswer=0;globalThis.saveCancelled=true;BrowserWindow.getAllWindows()[0].close()})
 await page.waitForTimeout(100);assert.equal(page.isClosed(),false)
 const largeBundle={...bundle,tasks:Array.from({length:10000},(_,id)=>({...bundle.tasks[0],id:String(id),downloadUrl:`https://konachan.net/existing-${id}.jpg`}))}
 const beforeFailedExport=JSON.stringify(largeBundle)
 await writeFile(bundlePath,beforeFailedExport)
 await app.evaluate(({BrowserWindow})=>{globalThis.closeAnswer=0;globalThis.saveCancelled=false;BrowserWindow.getAllWindows()[0].close()})
 for(let n=0;n<200&&!await app.evaluate(()=>!!globalThis.dialogError);n++)await page.waitForTimeout(10)
 assert.equal(page.isClosed(),false,'导出超限时不得关闭窗口')
 assert.match(await app.evaluate(()=>globalThis.dialogError),/10000/)
 assert.equal(await readFile(bundlePath,'utf8'),beforeFailedExport,'超限合并不得覆盖旧包')
 await page.locator('.download-row[data-status=failed]').click({button:'right'})
 await page.locator('#download-menu').getByRole('button',{name:'删除',exact:true}).click()
 await page.locator('.download-row[data-status=failed]').waitFor({state:'hidden'})
 const settingsOnDisk=JSON.parse(await readFile(join(profile,'downloads.json'),'utf8'));assert.equal(settingsOnDisk.autoRename,true)
})
