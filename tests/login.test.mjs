import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { downloadDefaults } from '../src/main/downloads.ts'

async function waitFor(predicate){for(let i=0;i<500;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,10))}throw Error('等待登录状态超时')}
test('登录/Pixiv闭环：隔离页面、Cookie 提交/回滚、重启与注销', {timeout:90000}, async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-login-')),directory=join(profile,'images')
 await writeFile(join(profile,'downloads.json'),JSON.stringify({...downloadDefaults(directory),fileTemplate:'%site %id',folderTemplate:'%site'}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app){await app.evaluate(({BrowserWindow,dialog})=>{dialog.showMessageBox=async()=>({response:1});for(const w of BrowserWindow.getAllWindows())if(w.getTitle()==='账号登陆窗口')w.close()}).catch(()=>{});await app.close()}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
  await app.evaluate(({app,session,nativeImage})=>{
   globalThis.authRequests=[];globalThis.loginCookie='fixture-signed-in';globalThis.rotateOnVerify=false
   const png=nativeImage.createFromBitmap(Buffer.alloc(4*16*16,200),{width:16,height:16}).toPNG()
   const install=ses=>{
    ses.protocol.handle('https',async request=>{
     const url=new URL(request.url), cookies=await ses.cookies.get({url:'https://www.pixiv.net'})
     const signed=cookies.some(c=>c.name==='PHPSESSID'&&c.value.startsWith('fixture-'))
     globalThis.authRequests.push({path:url.pathname,signed,referer:request.headers.get('referer')})
     if(url.hostname==='accounts.pixiv.net'&&url.pathname==='/fixture-signin'){
      await ses.cookies.set({url:'https://www.pixiv.net',domain:'.pixiv.net',path:'/',name:'PHPSESSID',value:globalThis.loginCookie,secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600})
      return new Response('{}',{headers:{'content-type':'application/json'}})
     }
     if(url.hostname==='accounts.pixiv.net')return new Response(`<html><body><button id="fixture-signin" onclick="fetch('/fixture-signin',{method:'POST'}).then(()=>document.getElementById('state').textContent='signed')">模拟完成登录</button><p id="state">guest</p></body></html>`,{headers:{'content-type':'text/html'}})
     if(url.pathname==='/ajax/user/extra'){if(signed&&globalThis.rotateOnVerify){await ses.cookies.set({url:'https://www.pixiv.net',domain:'.pixiv.net',path:'/',name:'PHPSESSID',value:'fixture-renewed',secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600});globalThis.rotateOnVerify=false}return new Response(JSON.stringify({error:!signed,body:signed?{following:1}:null}),{headers:{'content-type':'application/json'}})}
     if(!signed)return new Response('unauthorized',{status:401})
     if(url.pathname.startsWith('/ajax/search/'))return new Response(JSON.stringify({error:false,body:{illust:{data:url.searchParams.get('p')==='1'?Array.from({length:2},(_,i)=>({id:701+i,width:640,height:360,illustType:0,title:'fixture',userName:'fixture-artist',userId:'20',tags:['sky'],url:`https://i.pximg.net/${701+i}-thumb.png`})):[]}}}))
     if(url.pathname==='/ranking.php')return new Response(JSON.stringify({contents:url.searchParams.get('p')==='1'?[{illust_id:701,width:640,height:360,title:'rank-title',user_name:'artist',user_id:'20',rank:1,yes_rank:0,illust_page_count:2,rating_count:42,tags:['sky'],url:'https://i.pximg.net/701-thumb.png'}]:[]}))
     if(url.pathname.endsWith('/profile/all'))return new Response(JSON.stringify({error:false,body:{illusts:{'702':null,'701':null}}}))
     if(url.pathname.endsWith('/profile/illusts'))return new Response(JSON.stringify({error:false,body:{works:{'702':{id:702,width:640,height:360,title:'author-title',userName:'artist',userId:'20',tags:[],url:'https://i.pximg.net/702-thumb.png'}}}}))
     if(/^\/ajax\/illust\/\d+\/pages$/.test(url.pathname))return new Response(JSON.stringify({error:false,body:[0,1].map(i=>({urls:{original:`https://i.pximg.net/701-p${i}.png`,regular:`https://i.pximg.net/701-preview${i}.png`}}))}))
     if(url.pathname==='/rpc/cps.php')return new Response(JSON.stringify({candidates:[{tag_name:'landscape'}]}))
     return new Response(png,{headers:{'content-type':'image/png','content-length':String(png.length)}})
    })
   }
   install(session.fromPartition('persist:moe-site-pixiv'));app.on('session-created',install)
  })
  const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#settings-toggle').onclick!==null);return page
 }
 let page=await launch()
 await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'Pixiv',exact:true}).click()
 assert.equal(await page.locator('#account').isVisible(),true)
 await assert.rejects(()=>page.evaluate(()=>window.moe.search({site:'pixiv',pixivMode:'tag',pixivKind:'illust',keyword:'sky',page:1,count:10,minWidth:1,minHeight:1,filterResolution:false,orientation:0})),/登录/)
 const openLogin=async()=>{
  await page.evaluate(()=>window.moe.login('pixiv'))
  const toolbar=app.context().pages().find(p=>p.url().endsWith('/login.html'))
  const remote=app.context().pages().find(p=>p.url().startsWith('https://accounts.pixiv.net/'))
  assert.ok(toolbar);assert.ok(remote);return {toolbar,remote}
 }
 let {toolbar,remote}=await openLogin()
 assert.deepEqual(await remote.evaluate(()=>[typeof window.require,typeof window.process,typeof window.moe,typeof window.login]),['undefined','undefined','undefined','undefined'])
 assert.equal(await toolbar.evaluate(()=>typeof window.moe),'undefined')
 const layout=await toolbar.evaluate(()=>({header:document.querySelector('header').getBoundingClientRect().height,left:document.querySelector('#login-navigate').getBoundingClientRect().width,right:document.querySelector('#login-verify').getBoundingClientRect().width}))
 assert.deepEqual(layout,{header:44,left:136,right:292})
 const viewBounds=await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='账号登陆窗口');const view=window.contentView.children.find(view=>view.webContents?.getURL().startsWith('https://accounts.pixiv.net/'));return {window:window.getBounds(),content:window.getContentSize(),view:view.getBounds()}})
 if(process.platform==='darwin')assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='MoeLoaderE').isEnabled()),false)
 assert.equal(viewBounds.window.width,1280);assert.equal(viewBounds.window.height,900);assert.equal(viewBounds.view.y,50);assert.equal(viewBounds.view.height,viewBounds.content[1]-50)
 assert.equal((await page.locator('#account').boundingBox()).width,34)

 const prefs=await app.evaluate(({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://accounts.pixiv.net/')).getLastWebPreferences())
 assert.equal(prefs.nodeIntegration,false);assert.equal(prefs.contextIsolation,true);assert.equal(prefs.sandbox,true);assert.ok(!prefs.preload)
 await toolbar.locator('#login-verify').click();await toolbar.locator('#login-status[data-state=failed]').waitFor()
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.pixiv,false)
 await remote.locator('#fixture-signin').click();await remote.waitForFunction(()=>document.querySelector('#state').textContent==='signed')
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.pixiv,false,'未验证的 Cookie 不进入业务会话')
 const cancelled=toolbar.waitForEvent('close')
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='账号登陆窗口').close())
 await cancelled
 ;({toolbar,remote}=await openLogin())
 assert.equal(await app.evaluate(async({webContents})=>(await webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://accounts.pixiv.net/')).session.cookies.get({url:'https://www.pixiv.net'})).length),0,'关闭未验证窗口丢弃 Cookie')
 await remote.locator('#fixture-signin').click();await remote.waitForFunction(()=>document.querySelector('#state').textContent==='signed')
 const cloned=app.waitForEvent('window')
 await app.evaluate(async({BrowserWindow})=>{const real=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='账号登陆窗口');const fake=new BrowserWindow({show:false,webPreferences:{preload:real.webContents.getLastWebPreferences().preload,sandbox:true,contextIsolation:true,nodeIntegration:false}});await fake.loadURL(real.webContents.getURL())})
 const untrusted=await cloned
 assert.equal(await untrusted.evaluate(async()=>{try{await window.login.init();return false}catch{return true}}),true)
 await untrusted.close()
 await app.evaluate(()=>{globalThis.rotateOnVerify=true})
 const closed=toolbar.waitForEvent('close')
 await toolbar.locator('#login-verify').click();await toolbar.locator('#login-status[data-state=success]').waitFor()
 await toolbar.screenshot({path:'artifacts/login-toolbar.png'})
 await closed
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.pixiv,true)
 assert.equal((await readFile(join(profile,'network.json'),'utf8')).includes('fixture-signed-in'),false)
 await page.locator('#keyword').fill('sky');await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click()
 await page.locator('.picture.loaded').nth(1).waitFor()
 await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('下载',{exact:true}).click()
 await page.locator('.download-row[data-status=success]').waitFor()
 const groupTask=(await page.evaluate(()=>window.moe.downloads())).tasks[0]
 assert.equal(Object.hasOwn(groupTask.children[0].source,'pages'),false,'组图子项不能重复携带整组 URL 列表')
 assert.equal((await readFile(join(directory,'pixiv','pixiv 701 p1.png'))).length>0,true)
 assert.equal((await readFile(join(directory,'pixiv','pixiv 701 p2.png'))).length>0,true)
 await page.screenshot({path:'artifacts/pixiv-fixture.png',animations:'disabled'})
 const requests=await app.evaluate(()=>globalThis.authRequests)
 assert.ok(requests.some(r=>r.path.startsWith('/ajax/search/')&&r.signed))
 assert.ok(requests.some(r=>r.path.endsWith('p1.png')&&r.signed&&r.referer==='https://www.pixiv.net/artworks/701'))
 await page.getByRole('combobox',{name:'Pixiv 分类',exact:true}).click();await page.getByRole('option',{name:'排行',exact:true}).click()
 assert.equal(await page.locator('#keyword').isHidden(),true)
 await page.getByRole('button',{name:'搜索参数',exact:true}).click()
 assert.equal(await page.getByRole('combobox',{name:'单站点代理',exact:true}).isVisible(),true)
 await page.locator('#filter-resolution').check();await page.locator('#min-width').fill('1');await page.locator('#min-height').fill('1')
 await page.locator('#start-page').fill('2');assert.equal(await page.locator('#start-page').inputValue(),'2');await page.locator('#start-page').fill('1')
 await page.locator('#filter-resolution').uncheck()
 await page.screenshot({path:'artifacts/pixiv-rank-parameters.png',animations:'disabled'})
 await page.getByRole('button',{name:'搜索参数',exact:true}).click()
 await page.locator('#search').click();await page.locator('.picture.loaded').first().waitFor()
 assert.equal(await page.locator('.image-rank b').first().textContent(),'1');assert.equal(await page.locator('.image-tip').first().textContent(),'首次登场')
 assert.equal(await page.locator('.image-id').first().textContent(),'rank-title')
 const previewOpened=app.waitForEvent('window');await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('预览图').click()
 const preview=await previewOpened;await preview.locator('#large-image').waitFor({state:'visible'});assert.equal(await preview.locator('#preview-title').textContent(),'rank-title');await preview.close()
 await page.getByRole('combobox',{name:'Pixiv 分类',exact:true}).click();await page.getByRole('option',{name:'作者ID搜索',exact:true}).click()
 await page.locator('#keyword').fill('20');await page.locator('#search').click();await page.locator('.picture.loaded').first().waitFor()
 assert.equal(await page.locator('.image-id').first().textContent(),'author-title')
 await app.close();app=undefined
 page=await launch();assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.pixiv,true,'有效 Cookie 和验证状态重启恢复')
 assert.equal(await page.locator('#count').inputValue(),'60','Pixiv 数量不会污染 Konachan-G')
 await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'Pixiv',exact:true}).click()
 assert.equal(await page.locator('#count').inputValue(),'10','按站点恢复每页数量')
 await app.evaluate(({session})=>{
  globalThis.loginCookie='fixture-replacement'
  const target=session.fromPartition('persist:moe-site-pixiv'),original=target.cookies.set.bind(target.cookies)
  target.cookies.set=async details=>{if(details.value==='fixture-replacement'){globalThis.commitStarted=true;await new Promise(r=>setTimeout(r,200))}return original(details)}
 })
 ;({toolbar,remote}=await openLogin());await remote.locator('#fixture-signin').click();await remote.waitForFunction(()=>document.querySelector('#state').textContent==='signed');await toolbar.locator('#login-verify').click()
 await waitFor(()=>app.evaluate(()=>globalThis.commitStarted===true))
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='账号登陆窗口').close())
 const state=await page.evaluate(()=>window.moe.network());assert.equal(state.loggedIn.pixiv,true)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-pixiv').cookies.get({url:'https://www.pixiv.net'})).find(c=>c.name==='PHPSESSID').value),'fixture-renewed','关闭时回滚旧登录态')
 await app.evaluate(({session})=>{
  const ses=session.fromPartition('persist:moe-site-pixiv');globalThis.retryCalls=0
  ses.fetch=async()=>{globalThis.retryCalls++;if(globalThis.retryCalls===1)return new Promise((_,reject)=>{globalThis.rejectRequest=reject});return new Response('{"candidates":[]}')}
 })
 await page.evaluate(()=>{window.pendingHint=window.moe.hints('logout-race','pixiv').then(()=>'',error=>String(error))})
 await waitFor(()=>app.evaluate(()=>globalThis.retryCalls===1))
 await page.evaluate(()=>window.moe.logout('pixiv'))
 await app.evaluate(()=>globalThis.rejectRequest(new Error('connection closed')))
 assert.match(await page.evaluate(()=>window.pendingHint),/重新登录/)
 assert.equal(await app.evaluate(()=>globalThis.retryCalls),1,'注销后旧请求不能重新发送')
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.pixiv,false)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-pixiv').cookies.get({})).length),0)
})
