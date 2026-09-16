import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { networkDefaults } from '../src/shared/network.ts'

test('真实 Session：自定义代理、单站点覆盖与 Cookie 发送', {timeout:30000}, async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-proxy-'));let app
 const origin=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({cookie:req.headers.cookie||'',path:req.url}))})
 let proxyRequests=0
 const proxy=http.createServer((req,res)=>{
  proxyRequests++;const url=new URL(req.url)
  const forward=http.request(url,{method:req.method,headers:{...req.headers,host:url.host}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)})
  forward.on('error',()=>{res.statusCode=502;res.end()});req.pipe(forward)
 })
 await new Promise(r=>origin.listen(0,'127.0.0.1',r));await new Promise(r=>proxy.listen(0,'127.0.0.1',r))
 t.after(async()=>{if(app)await app.close();origin.closeAllConnections();proxy.closeAllConnections();await Promise.all([new Promise(r=>origin.close(r)),new Promise(r=>proxy.close(r))]);await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});const page=await app.firstWindow();await page.waitForLoadState('load')
 const settings={...networkDefaults(),globalMode:'custom',proxyAddress:`127.0.0.1:${proxy.address().port}`}
 await page.waitForFunction(()=>document.querySelector('#settings-toggle').onclick!==null)
 await page.locator('#settings-toggle').click()
 await page.locator('#proxy-address').fill(settings.proxyAddress);await page.locator('#proxy-address').press('Tab')
 await page.getByRole('combobox',{name:'全局代理设置',exact:true}).click();await page.getByRole('option',{name:'自定义',exact:true}).click()
 await page.locator('#settings-toggle').click()
 assert.equal((await page.evaluate(()=>window.moe.network())).settings.globalMode,'custom')
 const endpoint=`http://127.0.0.1:${origin.address().port}/private`
 const result=await app.evaluate(async({session},endpoint)=>{
  const ses=session.fromPartition('persist:moe-site-konachan-g')
  await ses.cookies.set({url:endpoint,name:'fixture',value:'synthetic-session',httpOnly:true,expirationDate:Date.now()/1000+3600})
  return {route:await ses.resolveProxy(endpoint),body:await(await ses.fetch(endpoint,{credentials:'include'})).json()}
 },endpoint)
 assert.match(result.route,/PROXY/);assert.equal(proxyRequests,1);assert.match(result.body.cookie,/fixture=synthetic-session/)
 settings.siteModes['konachan-g']='none'
 await page.locator('#parameters-toggle').click()
 await page.getByRole('combobox',{name:'单站点代理',exact:true}).click();await page.locator('[data-select=proxy]').getByRole('option',{name:'不使用代理',exact:true}).click()
 await page.keyboard.press('Escape')
 assert.equal((await page.evaluate(()=>window.moe.network())).settings.siteModes['konachan-g'],'none')
 const direct=await app.evaluate(async({session},endpoint)=>{const ses=session.fromPartition('persist:moe-site-konachan-g');return {route:await ses.resolveProxy(endpoint),body:await(await ses.fetch(endpoint,{credentials:'include'})).json()}},endpoint)
 assert.equal(direct.route,'DIRECT');assert.equal(proxyRequests,1);assert.match(direct.body.cookie,/fixture=/)
 const before=await readFile(join(profile,'network.json'),'utf8')
 assert.equal(await page.evaluate(async value=>{try{await window.moe.setNetwork(value);return false}catch{return true}},{...settings,proxyAddress:'http://secret:password@host:80'}),true)
 assert.equal(await readFile(join(profile,'network.json'),'utf8'),before)
 assert.equal(before.includes('synthetic-session'),false)
 assert.equal(await app.evaluate(async({session},endpoint)=>(await session.fromPartition('persist:moe-site-pixiv').cookies.get({url:endpoint})).length,endpoint),0,'站点 Cookie 分区互不共享')
 await app.evaluate(({session})=>{
  globalThis.crossSiteRequests=0
  session.fromPartition('persist:moe-site-pixiv').protocol.handle('https',()=>{globalThis.crossSiteRequests++;return new Response('image',{headers:{'content-type':'image/png'}})})
  session.fromPartition('persist:moe-site-konachan-g').protocol.handle('https',request=>new Response(JSON.stringify(new URL(request.url).searchParams.get('page')==='1'?[{id:123,width:100,height:100,rating:'s',preview_url:'https://www.pixiv.net/private.png',sample_url:'https://www.pixiv.net/private.png',file_url:'https://konachan.net/test.jpg'}]:[])))
 })
 const foreign=await page.evaluate(()=>window.moe.search({keyword:'',count:10,page:1,minWidth:1,minHeight:1,filterResolution:false,orientation:0}))
 assert.equal(await app.evaluate(async({net},key)=>(await net.fetch(`moe-image://picture/${key}/thumbnail`)).status,foreign.items[0].key),400)
 assert.equal(await app.evaluate(()=>globalThis.crossSiteRequests),0,'不能借另一站的图片地址调用登录会话')
 await app.evaluate(({session})=>{
  const ses=session.fromPartition('persist:moe-site-konachan-g');globalThis.retryCalls=0
  ses.fetch=async()=>{globalThis.retryCalls++;if(globalThis.retryCalls===1)return new Promise((_,reject)=>{globalThis.rejectRequest=reject});return new Response('[]')}
  ses.setProxy=async()=>{throw new Error('simulated proxy apply/rollback failure')}
 })
 await page.evaluate(()=>{window.pendingHint=window.moe.hints('proxy-race','konachan-g').then(()=>'',error=>String(error))})
 await page.waitForFunction(()=>!!window.pendingHint)
 // Wait for the first request to be in flight before changing the proxy.
 for(let i=0;i<100&&!(await app.evaluate(()=>globalThis.retryCalls===1));i++)await new Promise(resolve=>setTimeout(resolve,10))
 assert.equal(await app.evaluate(()=>globalThis.retryCalls),1)
 await assert.rejects(()=>page.evaluate(value=>window.moe.setNetwork(value),{...settings,globalMode:'system'}),/simulated proxy/)
 await app.evaluate(()=>globalThis.rejectRequest(new Error('connection closed')))
 assert.match(await page.evaluate(()=>window.pendingHint),/代理恢复失败/)
 assert.equal(await app.evaluate(()=>globalThis.retryCalls),1,'代理恢复失败后不能重新发送旧请求')


})
