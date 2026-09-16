import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'

test('Mac 毛玻璃：开关、主预览同步、系统限制、失焦与持久化', { skip: process.platform !== 'darwin', timeout: 45000 }, async t => {
 const profile = await mkdtemp(join(tmpdir(), 'moe-appearance-'))
 const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
 let application
 t.after(async () => { if (application) await application.close(); await rm(profile, {recursive:true,force:true,maxRetries:3,retryDelay:100}) })
 application = await electron.launch({ args:['.',`--user-data-dir=${profile}`], env })
 const page = await application.firstWindow(); await page.waitForLoadState('load')
 await page.waitForFunction(()=>document.querySelector('#settings-toggle').onclick!==null)
 await application.evaluate(({BrowserWindow,nativeTheme,session,nativeImage})=>{
   nativeTheme.themeSource='dark'
   globalThis.vibrancyCalls=[]
   const original=BrowserWindow.prototype.setVibrancy
   BrowserWindow.prototype.setVibrancy=function(value,...args){globalThis.vibrancyCalls.push({id:this.id,value});return original.call(this,value,...args)}
   const png=nativeImage.createFromBitmap(Buffer.alloc(4,255),{width:1,height:1}).toPNG()
   session.defaultSession.protocol.handle('https',request=>{
     const url=new URL(request.url)
     if(url.pathname==='/post.json')return new Response(JSON.stringify(url.searchParams.get('page')==='1'?[{id:1,width:10,height:10,rating:'s',preview_url:'https://konachan.net/a.png',sample_url:'https://konachan.net/a.png',file_url:'https://konachan.net/a.png'}]:[]))
     return new Response(png,{headers:{'content-type':'image/png'}})
   })
 })
 await page.locator('#settings-toggle').click()
 const checkbox=page.locator('#acrylic-enabled')
 await checkbox.uncheck()
 await page.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='false')
 assert.equal((await page.evaluate(()=>window.moe.appearance())).acrylicEnabled,false)
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').opacity),'1')
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::after').opacity),'0')
 assert.equal((await application.evaluate(()=>globalThis.vibrancyCalls)).at(-1).value,null)
 const data=await page.evaluate(()=>window.moe.search({keyword:'',page:1,count:10,minWidth:1,minHeight:1,filterResolution:false,orientation:0}))
 const opened=application.waitForEvent('window')
 await page.evaluate(key=>window.moe.preview(key),data.items[0].key)
 const preview=await opened;await preview.waitForLoadState('load')
 await preview.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='false')
 assert.equal(await preview.evaluate(async()=>{try{await window.moe.setAcrylic(true);return false}catch{return true}}),true)
 await checkbox.check()
 await application.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows().find(window=>window.getTitle()==='MoeLoaderE').focus()})
 await page.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='true'&&document.documentElement.dataset.active==='true')
 await preview.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='true')
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').opacity),'0.12')
 const calls=await application.evaluate(()=>globalThis.vibrancyCalls)
 assert.equal(new Set(calls.filter(c=>c.value==='under-window').map(c=>c.id)).size,2)
 assert.equal(await page.evaluate(async()=>{try{await window.moe.setAcrylic('yes');return false}catch{return true}}),true)
 await application.evaluate(({nativeTheme})=>{
   globalThis.transparencyDescriptor=Object.getOwnPropertyDescriptor(nativeTheme,'prefersReducedTransparency')
   Object.defineProperty(nativeTheme,'prefersReducedTransparency',{configurable:true,get:()=>true})
   nativeTheme.emit('updated')
 })
 await page.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='false')
 await preview.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='false')
 assert.equal(await checkbox.isChecked(),true,'系统限制不改变用户的启用偏好')
 assert.match(await checkbox.getAttribute('title'),/降低透明度/)
 await application.evaluate(({nativeTheme})=>{
   if(globalThis.transparencyDescriptor)Object.defineProperty(nativeTheme,'prefersReducedTransparency',globalThis.transparencyDescriptor)
   else delete nativeTheme.prefersReducedTransparency
   nativeTheme.emit('updated')
 })
 await page.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='true')
 await application.evaluate(({BrowserWindow})=>{const probe=new BrowserWindow({width:100,height:100,show:true,title:'Appearance focus probe'});probe.focus()})
 await page.waitForFunction(()=>document.documentElement.dataset.active==='false')
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').opacity),'1')
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundColor),'rgb(31, 31, 31)')
 await page.evaluate(()=>window.moe.setAcrylic(false))
 await application.close();application=undefined
 assert.equal(JSON.parse(await readFile(join(profile,'browser.json'),'utf8')).acrylicEnabled,false)
 application=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
 const reopened=await application.firstWindow();await reopened.waitForLoadState('load')
 await reopened.waitForFunction(()=>document.documentElement.dataset.nativeBlur==='false')
 assert.equal((await reopened.evaluate(()=>window.moe.appearance())).acrylicEnabled,false)
})
