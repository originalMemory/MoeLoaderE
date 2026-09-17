import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {_electron as electron} from 'playwright'
import {validateCustomSite} from '../src/main/custom-sites.ts'
const base=JSON.parse(await readFile(new URL('../docs/examples/custom-site.json',import.meta.url),'utf8'))
const config={...base,ShortName:'login-fixture',DisplayName:'登录样本',HomeUrl:'https://konachan.net',Config:{IsSupportAccount:true},LoginUrl:'https://login.example.test/sign-in',CookieLoginAuthKey:'auth'}

test('自定义登录配置：原字段与主页默认值',()=>{
 const {definition}=validateCustomSite(config)
 assert.equal(definition.login,config.LoginUrl);assert.equal(definition.cookieAuthKey,'auth');assert.ok(definition.hosts.includes('login.example.test'))
 assert.equal(validateCustomSite({...config,LoginUrl:undefined}).definition.login,'https://konachan.net/')
 assert.equal(validateCustomSite({...config,Config:{IsSupportAccount:false}}).definition.login,'')
 assert.equal(validateCustomSite({...config,CookieLoginAuthKey:undefined}).definition.cookieAuthKey,undefined)
 assert.throws(()=>validateCustomSite({...config,LoginUrl:'file:///tmp/a'}),/HTTP/)
})

test('自定义登录：隔离、Cookie作用域、提交取消、重启、401与注销',{timeout:60000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-custom-login-'))
 await mkdir(join(profile,'CustomSites'));await writeFile(join(profile,'CustomSites','login.json'),JSON.stringify(config))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({directory:join(profile,'images'),concurrency:1,fileTemplate:'%title',folderTemplate:'%site',autoRename:false,tagCount:0,firstOnly:false,firstCount:1}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app){await app.evaluate(({BrowserWindow,dialog})=>{dialog.showMessageBox=async()=>({response:1});for(const w of BrowserWindow.getAllWindows())if(w.getTitle()==='账号登陆窗口')w.close()}).catch(()=>{});await app.close()}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
  await app.evaluate(async({app,session,nativeImage})=>{
   globalThis.fixturePath='/';globalThis.fixtureToken='synthetic-login';globalThis.expired=false
   const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
   const install=ses=>ses.protocol.handle('https',async request=>{
    const u=new URL(request.url)
    if(u.hostname==='login.example.test'){
     if(u.pathname==='/signin'){
      await ses.cookies.set({url:'https://konachan.net',name:'AUTH',value:globalThis.fixtureToken,path:globalThis.fixturePath,secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600})
      await ses.cookies.set({url:'https://unrelated.test',name:'unrelated',value:'not-exported'})
      return new Response('{}')
     }
     return new Response('<button id="sign" onclick="fetch(\'/signin\').then(()=>document.body.dataset.signed=\'true\')">模拟登录</button>',{headers:{'content-type':'text/html'}})
    }
    if(u.pathname==='/search'&&u.searchParams.get('q')==='stale'){await new Promise(resolve=>globalThis.releaseStale=resolve);return new Response('old unauthorized',{status:401})}
    const signed=(await ses.cookies.get({url:'https://konachan.net'})).some(c=>c.name==='AUTH')
    if(!signed||globalThis.expired)return new Response('unauthorized',{status:401})
    if(u.pathname==='/gallery')return new Response(Array.from({length:10},(_,i)=>`<article><img src="/t${i}.png"><a href="/detail">Title${i}</a></article>`).join(''))
    if(u.pathname==='/detail')return new Response('<img class="original" src="/original.png">')
    return new Response(png,{headers:{'content-type':'image/png'}})
   })
   install(session.fromPartition('persist:moe-site-login-fixture'));app.on('session-created',install)
   await session.fromPartition('persist:moe-site-konachan-g').cookies.set({url:'https://konachan.net',name:'builtin',value:'preserve'})
  })
  const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#custom-directory').onclick!==null)
  await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'登录样本',exact:true}).click();return page
 }
 let page=await launch();assert.equal(await page.locator('#account').isVisible(),true)
 const openLogin=async()=>{await page.locator('#account').click();for(let i=0;i<100;i++){const pages=app.context().pages(),toolbar=pages.find(p=>p.url().endsWith('/login.html')),remote=pages.find(p=>p.url().startsWith('https://login.example.test/'));if(toolbar&&remote){await remote.locator('#sign').waitFor();return {toolbar,remote}}await new Promise(resolve=>setTimeout(resolve,20))}throw Error('登录窗口未就绪')}
 let {toolbar,remote}=await openLogin()
 assert.deepEqual(await remote.evaluate(()=>[typeof window.require,typeof window.moe,typeof window.login]),['undefined','undefined','undefined'])
 assert.equal((await toolbar.evaluate(()=>window.login.init())).site,'login-fixture')
 await assert.rejects(()=>page.evaluate(()=>window.moe.login('pixiv')),/关闭当前登录窗口/)
 await toolbar.locator('#login-verify').click();await toolbar.locator('#login-status[data-state=failed]').waitFor()
 await app.evaluate(()=>{globalThis.fixturePath='/private'})
 await remote.locator('#sign').click();await remote.waitForFunction(()=>document.body.dataset.signed==='true')
 await toolbar.locator('#login-verify').click();await toolbar.locator('#login-status[data-state=failed]').waitFor()
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn['login-fixture'],false,'子路径 Cookie 不能认证主页')
 const closed=toolbar.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='账号登陆窗口').close());await closed
 await app.evaluate(()=>{globalThis.fixturePath='/'})
 ;({toolbar,remote}=await openLogin())
 assert.equal(await app.evaluate(async({webContents})=>(await webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://login.example.test/')).session.cookies.get({url:'https://konachan.net'})).length),0)
 await remote.locator('#sign').click();await remote.waitForFunction(()=>document.body.dataset.signed==='true')
 const successClosed=toolbar.waitForEvent('close');await toolbar.locator('#login-verify').click();await successClosed
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn['login-fixture'],true)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-login-fixture').cookies.get({name:'unrelated'})).length),0)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-konachan-g').cookies.get({name:'AUTH'})).length),0)
 assert.equal((await readFile(join(profile,'network.json'),'utf8')).includes('synthetic-login'),false)
 await page.locator('#parameters-toggle').click();await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click();await page.locator('.picture.loaded').nth(9).waitFor();await page.waitForFunction(()=>!document.querySelector('.picture button[title="下载"]').disabled)
 await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('下载',{exact:true}).click();await page.locator('.download-row[data-status=success]').waitFor()
 await app.close();app=undefined;page=await launch()
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn['login-fixture'],true)
 // Cancel midway through committing replacement cookies and preserve the old session.
 await app.evaluate(({session})=>{
  globalThis.fixtureToken='replacement'
  const ses=session.fromPartition('persist:moe-site-login-fixture'),set=ses.cookies.set.bind(ses.cookies)
  ses.cookies.set=async cookie=>{if(cookie.value==='replacement'){globalThis.commitStarted=true;await new Promise(resolve=>setTimeout(resolve,200))}return set(cookie)}
 })
 ;({toolbar,remote}=await openLogin());await remote.locator('#sign').click();await remote.waitForFunction(()=>document.body.dataset.signed==='true');await toolbar.locator('#login-verify').click()
 for(let i=0;i<100&&!(await app.evaluate(()=>globalThis.commitStarted));i++)await new Promise(resolve=>setTimeout(resolve,10))
 assert.equal(await app.evaluate(()=>globalThis.commitStarted),true)
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.getTitle()==='账号登陆窗口').close())
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn['login-fixture'],true)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-login-fixture').cookies.get({name:'AUTH'}))[0].value),'synthetic-login')
 await page.evaluate(()=>{window.staleSearch=window.moe.search({site:'login-fixture',customCategory:0,keyword:'stale',page:1,count:10,minWidth:1,minHeight:1,filterResolution:false,orientation:0})})
 for(let i=0;i<100&&!(await app.evaluate(()=>!!globalThis.releaseStale));i++)await new Promise(resolve=>setTimeout(resolve,10))
 assert.equal(await app.evaluate(()=>typeof globalThis.releaseStale),'function')
 await app.evaluate(()=>{globalThis.fixtureToken='fresh-login'})
 ;({toolbar,remote}=await openLogin());await remote.locator('#sign').click();await remote.waitForFunction(()=>document.body.dataset.signed==='true')
 const freshClosed=toolbar.waitForEvent('close');await toolbar.locator('#login-verify').click();await toolbar.locator('#login-status[data-state=success]').waitFor()
 await app.evaluate(()=>globalThis.releaseStale())
 assert.match((await page.evaluate(()=>window.staleSearch)).error,/401/)
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn['login-fixture'],true,'旧会话 401 不得撤销新登录')
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-login-fixture').cookies.get({name:'AUTH'}))[0].value),'fresh-login')
 assert.ok(JSON.parse(await readFile(join(profile,'network.json'),'utf8')).customVerified.includes('login-fixture'))
 await freshClosed
 await app.evaluate(()=>{globalThis.expired=true})
 const failed=await page.evaluate(()=>window.moe.search({site:'login-fixture',customCategory:0,keyword:'',page:1,count:10,minWidth:1,minHeight:1,filterResolution:false,orientation:0}))
 assert.match(failed.error,/401/);assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn['login-fixture'],false)
 await page.locator('#account').click({button:'right'})
 await page.waitForFunction(()=>document.querySelector('#toast').textContent==='已清除登录信息！')
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-login-fixture').cookies.get({})).length),0)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-konachan-g').cookies.get({name:'builtin'}))[0].value),'preserve')
})
