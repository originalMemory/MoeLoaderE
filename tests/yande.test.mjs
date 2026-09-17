import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {_electron as electron} from 'playwright'
import {query,parsePictures,Viewed} from '../src/shared/booru.ts'
import {parseBooruXml} from '../src/shared/booru-xml.ts'
import {allowedSiteUrl,validateNetwork,networkDefaults} from '../src/shared/network.ts'
import {exportBundle,importSources} from '../src/main/download-bundle.ts'
const input={site:'yande',keyword:'空 & sky',page:2,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0}

test('Yande 查询、XML字段、评级和资源域名',()=>{
 const url=new URL(query(input));assert.equal(url.pathname,'/post.xml');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.get('tags'),'空 & sky rating:s')
 const rows=parseBooruXml('<posts><post id="12" width="800" height="600" author="artist" rating="s" preview_url="https://assets.yande.re/t.png" sample_url="https://files.yande.re/sample.jpg" jpeg_url="https://files.yande.re/jpeg.jpg" file_url="https://files.yande.re/original.png" file_size="42"/></posts>','posts','Yande')
 const [item]=parsePictures(rows,input,new Viewed());assert.equal(item.filtered,false);assert.equal(item.large,'https://files.yande.re/jpeg.jpg');assert.equal(item.thumbnail,'https://assets.yande.re/t.png');assert.equal(item.detail,'https://yande.re/post/show/12');assert.equal(item.bytes,42)
 assert.equal(parsePictures([{...rows[0],rating:'q'}],input,new Viewed())[0].filtered,true)
 assert.equal(parsePictures([{...rows[0],rating:'e'}],input,new Viewed())[0].filtered,true)
 assert.equal(allowedSiteUrl(item.large,'yande'),true);assert.equal(allowedSiteUrl(item.large,'pixiv'),false)
 const old=networkDefaults();delete old.siteModes.yande;assert.equal(validateNetwork(old).siteModes.yande,'default')
 assert.throws(()=>parseBooruXml('<html>login</html>','posts','Yande'),/Yande 未返回/)
})

test('Yande 桌面：提示/筛选/三种下载/登录/状态恢复',{timeout:45000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-yande-'))
 await writeFile(join(profile,'network.json'),JSON.stringify({settings:{globalMode:'none',proxyAddress:'127.0.0.1:1080',siteModes:{'konachan-g':'default',pixiv:'none'}}}))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({directory:join(profile,'images'),concurrency:1,fileTemplate:'%site %id %origin',folderTemplate:'%site',autoRename:false,tagCount:0,firstOnly:false,firstCount:1}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app){const timer=setTimeout(()=>app.process().kill('SIGKILL'),5000);try{await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})});await app.close()}finally{clearTimeout(timer)}}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
  const page=await app.firstWindow();await page.waitForLoadState('load')
  await app.evaluate(({app,session,nativeImage})=>{
   globalThis.yandeRequests=[]
   const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
   const install=ses=>ses.protocol.handle('https',async request=>{
    const url=new URL(request.url);globalThis.yandeRequests.push({url:request.url,referer:request.headers.get('referer')})
    if(url.pathname==='/fixture-signin'){await ses.cookies.set({url:'https://yande.re',name:'user_id',value:'fixture-user',secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600});return new Response('{}')}
    if(url.pathname==='/user/login')return new Response('<button id="sign" onclick="fetch(\'/fixture-signin\').then(()=>document.body.dataset.signed=\'true\')">模拟登录</button>',{headers:{'content-type':'text/html'}})
    if(url.pathname==='/tag.xml')return new Response('<tags><tag name="landscape" count="123"/></tags>')
    if(url.pathname==='/post.xml')return new Response(`<posts>${url.searchParams.get('page')==='1'?Array.from({length:11},(_,i)=>`<post id="${100+i}" width="640" height="360" rating="${i===10?'e':'s'}" preview_url="https://assets.yande.re/t${i}.png" sample_url="https://files.yande.re/s${i}.jpg" jpeg_url="https://files.yande.re/j${i}.jpg" file_url="https://files.yande.re/f${i}.png"/>`).join(''):''}</posts>`)
    return new Response(png,{headers:{'content-type':'image/png'}})
   })
   install(session.fromPartition('persist:moe-site-yande'));app.on('session-created',install)
  })
  await page.waitForFunction(()=>document.querySelector('#settings-toggle').onclick!==null)
  await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'Yande',exact:true}).click();return page
 }
 let page=await launch()
 assert.equal(await page.locator('#account').isVisible(),true)
 assert.equal(await page.locator('#search').evaluate(el=>el.getBoundingClientRect().width),68,'账号入口不应挤压获取按钮')
 assert.equal((await page.evaluate(()=>window.moe.network())).settings.siteModes.yande,'default')
 await page.locator('#keyword').fill('landscape');await page.locator('#hints button').first().waitFor();assert.match(await page.locator('#hints').textContent(),/123/)
 await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click();await page.locator('.picture.loaded').nth(9).waitFor()
 assert.equal(await page.locator('.picture').count(),10);assert.equal(await page.locator('.picture[data-id="110"]').count(),0)
 const requests=await app.evaluate(()=>globalThis.yandeRequests),search=new URL(requests.find(r=>r.url.includes('/post.xml')).url);assert.equal(search.searchParams.get('tags'),'landscape rating:s')
 const opened=app.waitForEvent('window');await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('预览图',{exact:true}).evaluate(button=>button.click());const preview=await opened;await preview.locator('#large-image').waitFor({state:'visible'});await preview.close()
 for(const [quality,suffix] of [['原图','f0.png'],['Jpeg图','j0.jpg'],['预览图','s0.jpg']]){
  await page.getByRole('combobox',{name:'下载图片类型',exact:true}).click();await page.getByRole('option',{name:quality,exact:true}).click()
  const expected=(await page.evaluate(()=>window.moe.downloads())).tasks.length+1
  await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('下载',{exact:true}).evaluate(button=>button.click())
  await page.waitForFunction(expected=>document.querySelectorAll('.download-row[data-status=success]').length===expected,expected)
  const task=(await page.evaluate(()=>window.moe.downloads())).tasks[expected-1];assert.equal(task.status,'success');assert.ok(task.source.url.endsWith(suffix));assert.equal(task.source.referer,quality==='原图'?'https://yande.re/post/show/100':'https://yande.re');assert.ok((await readFile(task.path)).length)
  const bundle=exportBundle([{...task,status:'stopped'}]);assert.equal(importSources(bundle,()=>true).sources[0].site,'yande')
 }
 await page.locator('#account').click()
 let toolbar,remote;for(let i=0;i<100;i++){toolbar=app.context().pages().find(p=>p.url().endsWith('/login.html'));remote=app.context().pages().find(p=>p.url()==='https://yande.re/user/login');if(toolbar&&remote)break;await new Promise(r=>setTimeout(r,20))}
 await remote.locator('#sign').click();await remote.waitForFunction(()=>document.body.dataset.signed==='true')
 const closed=toolbar.waitForEvent('close');await toolbar.locator('#login-verify').click();await closed
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.yande,true)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-konachan-g').cookies.get({name:'user_id'})).length),0)
 await page.screenshot({path:'artifacts/yande-fixture.png',animations:'disabled'})
 await page.locator('#next').click();await page.locator('#no-results').waitFor({state:'visible'})
 await app.close();app=undefined;page=await launch()
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.yande,true)
 const state=await page.evaluate(()=>window.moe.init());assert.equal(state.siteCounts.yande,10);assert.equal(state.siteCounts['konachan-g'],60)
 assert.equal((await page.evaluate(()=>window.moe.hints('','yande')))[0].word,'landscape')
 const result=await page.evaluate(()=>window.moe.search({site:'yande',keyword:'',page:1,count:10,minWidth:1,minHeight:1,filterResolution:false,orientation:0}));assert.ok(result.items.every(item=>item.viewed))
 await page.locator('#account').click({button:'right'});await page.waitForFunction(()=>document.querySelector('#toast').textContent==='已清除登录信息！')
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.yande,false)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-yande').cookies.get({})).length),0)
})
