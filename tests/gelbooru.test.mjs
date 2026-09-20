import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { query, parsePictures, Viewed } from '../src/shared/booru.ts'
import { parseBooruXml } from '../src/shared/booru-xml.ts'
import { allowedSiteUrl, networkDefaults, validateNetwork } from '../src/shared/network.ts'
import { resolveGelbooru } from '../src/main/gelbooru.ts'
import { downloadDefaults, filePath } from '../src/main/downloads.ts'

const input={site:'gelbooru',keyword:'sky & clouds',page:2,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0}

test('Gelbooru XML2 查询、评级、CDN、详情分类与命名',()=>{
 const url=new URL(query(input));assert.equal(url.searchParams.get('pid'),'1');assert.equal(url.searchParams.get('tags'),'sky & clouds rating:general')
 const rows=parseBooruXml('<posts><post><id>12</id><width>800</width><height>600</height><rating>general</rating><author>uploader</author><preview-url>https://img3.gelbooru.com/t.jpg</preview-url><sample-url>https://img3.gelbooru.com/s.jpg</sample-url><jpeg-url>https://img3.gelbooru.com/j.jpg</jpeg-url><file-url>https://img3.gelbooru.com/f.png</file-url><file-size>42</file-size></post></posts>','posts','Gelbooru')
 const [item]=parsePictures(rows,input,new Viewed());assert.equal(item.filtered,false);assert.equal(item.large,'https://img3.gelbooru.com/j.jpg');assert.equal(item.detail,'https://gelbooru.com/index.php?page=post&s=view&id=12')
 assert.equal(parsePictures([{...rows[0],rating:'questionable'}],input,new Viewed())[0].filtered,true)
 assert.equal(allowedSiteUrl('https://img3.gelbooru.com/a.jpg','gelbooru'),true);assert.equal(allowedSiteUrl('https://video-cdn4.gelbooru.com/a.mp4','gelbooru'),true);assert.equal(allowedSiteUrl('https://gelbooru.com.evil.test/a.jpg','gelbooru'),false)
 const resolved=resolveGelbooru(item,'<ul><li class="tag-type-artist"><a>x</a><a> artist_tag </a></li><li class="tag-type-character"><a>x</a><a>character_tag</a></li><li class="tag-type-copyright"><a>x</a><a>series_tag</a></li></ul>')
 assert.deepEqual([resolved.artist,resolved.character,resolved.copyright,resolved.detailsLoaded],['artist_tag','character_tag','series_tag',true])
 const path=filePath({...resolved,keyword:'',url:resolved.original,referer:resolved.detail,detail:resolved.detail},{...downloadDefaults('/tmp'),fileTemplate:'%artist %character %copyright %id',folderTemplate:'%site'})
 assert.match(path,/artist_tag character_tag series_tag 12\.png$/)
 const old=networkDefaults();delete old.siteModes.gelbooru;assert.equal(validateNetwork(old).siteModes.gelbooru,'default')
})

test('Gelbooru 桌面：提示、详情、三种下载、Cookie 登录及状态恢复',{timeout:45000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-gelbooru-')),directory=join(profile,'images')
 await writeFile(join(profile,'network.json'),JSON.stringify({settings:{globalMode:'none',proxyAddress:'127.0.0.1:1080',siteModes:{'konachan-g':'default',pixiv:'none'}}}))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({...downloadDefaults(directory),concurrency:1,fileTemplate:'%artist %character %copyright %id %origin',folderTemplate:'%site'}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})}).catch(()=>{});await app.close()}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});const page=await app.firstWindow();await page.waitForLoadState('load')
  await app.evaluate(({app,session,nativeImage})=>{
   globalThis.gelRequests=[]
   const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
   const install=ses=>ses.protocol.handle('https',async request=>{
    const url=new URL(request.url);globalThis.gelRequests.push({url:request.url,referer:request.headers.get('referer')})
    if(url.pathname==='/fixture-signin'){await ses.cookies.set({url:'https://gelbooru.com',domain:'.gelbooru.com',name:'user_id',value:'fixture-user',secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600});await ses.cookies.set({url:'https://gelbooru.com',domain:'.gelbooru.com',name:'pass_hash',value:'fixture-hash',secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600});return new Response('{}')}
    if(url.searchParams.get('page')==='account')return new Response('<button id="sign" onclick="fetch(\'/fixture-signin\').then(()=>document.body.dataset.signed=\'true\')">模拟登录</button>',{headers:{'content-type':'text/html'}})
    if(url.searchParams.get('page')==='autocomplete2')return new Response('[{"value":"landscape","post_count":"321"}]',{headers:{'content-type':'application/json'}})
    if(url.searchParams.get('page')==='dapi')return new Response(`<posts>${url.searchParams.get('pid')==='0'?Array.from({length:11},(_,i)=>`<post><id>${100+i}</id><width>640</width><height>360</height><rating>${i===10?'questionable':'general'}</rating><author>uploader</author><preview-url>https://img3.gelbooru.com/t${i}.png</preview-url><sample-url>https://img3.gelbooru.com/s${i}.jpg</sample-url><jpeg-url>https://img3.gelbooru.com/j${i}.jpg</jpeg-url><file-url>https://img3.gelbooru.com/f${i}.png</file-url></post>`).join(''):''}</posts>`)
    if(url.searchParams.get('page')==='post')return new Response('<li class="tag-type-artist"><a>x</a><a>artist_tag</a></li><li class="tag-type-character"><a>x</a><a>character_tag</a></li><li class="tag-type-copyright"><a>x</a><a>series_tag</a></li>',{headers:{'content-type':'text/html'}})
    return new Response(png,{headers:{'content-type':'image/png','content-length':String(png.length)}})
   })
   install(session.fromPartition('persist:moe-site-gelbooru'));app.on('session-created',install)
  })
  await page.waitForFunction(()=>document.querySelector('#settings-toggle').onclick!==null)
  await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'Gelbooru',exact:true}).click();return page
 }
 let page=await launch()
 assert.equal(await page.locator('#account').isVisible(),true);assert.equal(await page.locator('#search').evaluate(el=>el.getBoundingClientRect().width),68)
 assert.equal((await page.evaluate(()=>window.moe.network())).settings.siteModes.gelbooru,'default')
 await page.locator('#keyword').fill('landscape');await page.locator('#hints button').first().waitFor();assert.match(await page.locator('#hints').textContent(),/321/)
 await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click();await page.waitForFunction(()=>document.querySelector('#search span').textContent==='获取')
 assert.equal(await page.locator('.picture').count(),10,await page.locator('#status').textContent());await page.waitForFunction(()=>document.querySelectorAll('.picture.loading').length===0)
 const imageFailures=await page.locator('.picture.failed').count()
 if(imageFailures)assert.fail(JSON.stringify({requests:await app.evaluate(()=>globalThis.gelRequests),item:await page.evaluate(()=>window.moe.detail('1-1-0')),imageStatus:await app.evaluate(async({net})=>(await net.fetch('moe-image://picture/1-1-0/thumbnail')).status)}))
 await page.waitForFunction(()=>[...document.querySelectorAll('.picture button[title="下载"]')].every(button=>!button.disabled))
 assert.equal(await page.locator('.picture[data-id="110"]').count(),0)
 const requests=await app.evaluate(()=>globalThis.gelRequests),search=new URL(requests.find(r=>r.url.includes('page=dapi')).url);assert.equal(search.searchParams.get('tags'),'landscape rating:general')
 assert.ok(requests.some(r=>r.url.includes('page=post')&&r.referer==='https://gelbooru.com'))
 for(const [quality,suffix,extension] of [['原图','f0.png','png'],['Jpeg图','j0.jpg','jpg'],['预览图','s0.jpg','jpg']]){
  await page.getByRole('combobox',{name:'下载图片类型',exact:true}).click();await page.getByRole('option',{name:quality,exact:true}).click()
  assert.equal(await page.locator('.picture .file-info').first().textContent(),extension)
  const expected=(await page.evaluate(()=>window.moe.downloads())).tasks.length+1
  await page.locator('.picture').first().getByTitle('下载',{exact:true}).evaluate(button=>button.click())
  await page.waitForFunction(expected=>document.querySelectorAll('.download-row[data-status=success]').length===expected,expected)
  const task=(await page.evaluate(()=>window.moe.downloads())).tasks[expected-1];assert.ok(task.source.url.endsWith(suffix));assert.deepEqual([task.source.artist,task.source.character,task.source.copyright],['artist_tag','character_tag','series_tag']);assert.ok((await readFile(task.path)).length)
 }
 await page.locator('#account').click()
 let toolbar,remote;for(let i=0;i<100;i++){toolbar=app.context().pages().find(p=>p.url().endsWith('/login.html'));remote=app.context().pages().find(p=>p.url().includes('page=account'));if(toolbar&&remote)break;await new Promise(r=>setTimeout(r,20))}
 await remote.locator('#sign').click();await remote.waitForFunction(()=>document.body.dataset.signed==='true')
 const closed=toolbar.waitForEvent('close');await toolbar.locator('#login-verify').click();await closed
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.gelbooru,true)
 assert.equal(await app.evaluate(async({session})=>(await session.fromPartition('persist:moe-site-gelbooru').cookies.get({name:'pass_hash'}))[0].value),'fixture-hash')
 await page.screenshot({path:'artifacts/gelbooru-fixture.png',animations:'disabled'})
 await app.close();app=undefined;page=await launch()
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.gelbooru,true)
 const state=await page.evaluate(()=>window.moe.init());assert.equal(state.siteCounts.gelbooru,10);assert.equal(state.siteCounts['konachan-g'],60)
 assert.equal((await page.evaluate(()=>window.moe.hints('','gelbooru')))[0].word,'landscape')
 const result=await page.evaluate(()=>window.moe.search({site:'gelbooru',keyword:'',page:1,count:10,minWidth:1,minHeight:1,filterResolution:false,orientation:0}));assert.ok(result.items.every(item=>item.viewed))
 await page.locator('#account').click({button:'right'});await page.waitForFunction(()=>document.querySelector('#toast').textContent==='已清除登录信息！')
 assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.gelbooru,false)
})
