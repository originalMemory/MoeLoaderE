import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { query, parsePictures, Viewed } from '../src/shared/booru.ts'
import { parseDanbooruHints } from '../src/main/danbooru.ts'
import { allowedSiteUrl, networkDefaults, validateNetwork } from '../src/shared/network.ts'
import { downloadDefaults, filePath } from '../src/main/downloads.ts'

const input={site:'danbooru',keyword:'sky & clouds',page:2,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0}
const raw={id:12,image_width:800,image_height:600,rating:'g',uploader_id:77,score:9,tag_string:'sky clouds',tag_string_artist:'artist_tag',tag_string_character:'character_tag',tag_string_copyright:'series_tag',created_at:'2026-09-20T02:19:43.720-04:00',source:'https://source.test',preview_file_url:'https://cdn.donmai.us/180x180/t.jpg',large_file_url:'https://cdn.donmai.us/sample/s.jpg',file_url:'https://cdn.donmai.us/original/f.png',file_size:42}

test('Danbooru 查询、当前评级、JSON字段、提示与 CDN',()=>{
 const url=new URL(query(input));assert.equal(url.pathname,'/posts.json');assert.equal(url.searchParams.get('page'),'2');assert.equal(url.searchParams.get('tags'),'sky & clouds rating:general')
 const [item]=parsePictures([raw],input,new Viewed());assert.equal(item.filtered,false);assert.deepEqual([item.width,item.height,item.authorId,item.thumbnail,item.preview,item.original],[800,600,'77',raw.preview_file_url,raw.large_file_url,raw.file_url]);assert.equal(item.detail,'https://danbooru.donmai.us/posts/12');assert.deepEqual([item.artist,item.character,item.copyright],['artist_tag','character_tag','series_tag'])
 for(const rating of ['s','q','e'])assert.equal(parsePictures([{...raw,rating}],input,new Viewed())[0].filtered,true)
 const hints=parseDanbooruHints('<div class="ui-menu-item-wrapper flex"><a><b>foo</b><span> </span><b>bar</b></a><span class="post-count">10k</span></div><div class="ui-menu-item-wrapper"><a>alias → real tag</a><span class="post-count">2</span></div>')
 assert.deepEqual(hints,[{word:'foo_bar',count:'10k'},{word:'real_tag',count:'2'}])
 assert.equal(allowedSiteUrl('https://cdn.donmai.us/original/a.jpg','danbooru'),true);assert.equal(allowedSiteUrl('https://shima.donmai.us/a.jpg','danbooru'),true);assert.equal(allowedSiteUrl('https://donmai.us.evil.test/a.jpg','danbooru'),false)
 const path=filePath({...item,keyword:'',url:item.original,referer:item.detail,detail:item.detail},{...downloadDefaults('/tmp'),fileTemplate:'%artist %character %copyright %id',folderTemplate:'%site'});assert.match(path,/artist_tag character_tag series_tag 12\.png$/)
 const old=networkDefaults();delete old.siteModes.danbooru;assert.equal(validateNetwork(old).siteModes.danbooru,'default')
})

test('Danbooru 桌面：HTML提示、公开搜索、两种质量、Cookie登录及状态恢复',{timeout:45000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-danbooru-')),directory=join(profile,'images')
 await writeFile(join(profile,'network.json'),JSON.stringify({settings:{globalMode:'none',proxyAddress:'127.0.0.1:1080',siteModes:{'konachan-g':'default',pixiv:'none'}}}))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({...downloadDefaults(directory),concurrency:1,fileTemplate:'%artist %character %copyright %id %origin',folderTemplate:'%site'}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})}).catch(()=>{});await app.close()}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});const page=await app.firstWindow();await page.waitForLoadState('load')
  await app.evaluate(({app,session,nativeImage})=>{
   globalThis.danRequests=[]
   const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
   const install=ses=>ses.protocol.handle('https',async request=>{
    const url=new URL(request.url);globalThis.danRequests.push({url:request.url,referer:request.headers.get('referer'),userAgent:request.headers.get('user-agent')})
    if(url.pathname==='/fixture-signin'){await ses.cookies.set({url:'https://danbooru.donmai.us',domain:'.donmai.us',name:'_danbooru2_session',value:'fixture-session',secure:true,httpOnly:true,expirationDate:Date.now()/1000+3600});return new Response('{}')}
    if(url.pathname==='/login')return new Response('<button id="sign" onclick="fetch(\'/fixture-signin\').then(()=>document.body.dataset.signed=\'true\')">模拟登录</button>',{headers:{'content-type':'text/html'}})
    if(url.pathname==='/autocomplete')return new Response('<ul><li><div class="ui-menu-item-wrapper flex"><a><b>landscape</b></a><span class="post-count">10k</span></div></li></ul>',{headers:{'content-type':'text/html'}})
    if(url.pathname==='/posts.json')return new Response(JSON.stringify(url.searchParams.get('page')==='1'?[...Array.from({length:10},(_,i)=>({...globalThis.raw,id:100+i,preview_file_url:`https://cdn.donmai.us/t${i}.png`,large_file_url:`https://cdn.donmai.us/s${i}.jpg`,file_url:`https://cdn.donmai.us/f${i}.png`})),{...globalThis.raw,id:110,rating:'s'}]:[]),{headers:{'content-type':'application/json'}})
    return new Response(png,{headers:{'content-type':'image/png','content-length':String(png.length)}})
   })
   globalThis.raw={id:0,image_width:640,image_height:360,rating:'g',uploader_id:77,score:5,tag_string:'landscape sky',tag_string_artist:'artist_tag',tag_string_character:'character_tag',tag_string_copyright:'series_tag',created_at:'2026-09-20T00:00:00Z',source:'',preview_file_url:'',large_file_url:'',file_url:'',file_size:0}
   install(session.fromPartition('persist:moe-site-danbooru'));app.on('session-created',install)
  })
  await page.waitForFunction(()=>document.querySelector('#settings-toggle').onclick!==null)
  await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'Danbooru',exact:true}).click();return page
 }
 let page=await launch();assert.equal(await page.locator('#account').isVisible(),true);assert.equal(await page.locator('#search').evaluate(el=>el.getBoundingClientRect().width),68);assert.equal((await page.evaluate(()=>window.moe.network())).settings.siteModes.danbooru,'default')
 await page.locator('#keyword').fill('landscape');await page.locator('#hints button').first().waitFor();assert.match(await page.locator('#hints').textContent(),/10k/)
 await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click();await page.waitForFunction(()=>document.querySelector('#search span').textContent==='获取');assert.equal(await page.locator('.picture').count(),10);await page.locator('.picture.loaded').nth(9).waitFor();assert.equal(await page.locator('.picture[data-id="110"]').count(),0)
 const requests=await app.evaluate(()=>globalThis.danRequests),searchRequest=requests.find(r=>r.url.includes('/posts.json')),search=new URL(searchRequest.url);assert.equal(search.searchParams.get('tags'),'landscape rating:general');assert.equal(searchRequest.userAgent,'gdl/1.24.5')
 for(const [quality,suffix,extension] of [['原图','f0.png','png'],['预览图','s0.jpg','jpg']]){
  await page.getByRole('combobox',{name:'下载图片类型',exact:true}).click();await page.getByRole('option',{name:quality,exact:true}).click();assert.equal(await page.locator('.picture .file-info').first().textContent(),extension)
  const expected=(await page.evaluate(()=>window.moe.downloads())).tasks.length+1;await page.locator('.picture').first().getByTitle('下载',{exact:true}).evaluate(button=>button.click());await page.waitForFunction(expected=>document.querySelectorAll('.download-row[data-status=success]').length===expected,expected)
  const task=(await page.evaluate(()=>window.moe.downloads())).tasks[expected-1];assert.ok(task.source.url.endsWith(suffix));assert.deepEqual([task.source.artist,task.source.character,task.source.copyright],['artist_tag','character_tag','series_tag']);assert.ok((await readFile(task.path)).length)
 }
 await page.locator('#account').click();let toolbar,remote;for(let i=0;i<100;i++){toolbar=app.context().pages().find(p=>p.url().endsWith('/login.html'));remote=app.context().pages().find(p=>p.url()==='https://danbooru.donmai.us/login');if(toolbar&&remote)break;await new Promise(r=>setTimeout(r,20))}
 await remote.locator('#sign').click();await remote.waitForFunction(()=>document.body.dataset.signed==='true');const closed=toolbar.waitForEvent('close');await toolbar.locator('#login-verify').click();await closed;assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.danbooru,true)
 await page.screenshot({path:'artifacts/danbooru-fixture.png',animations:'disabled'});await app.close();app=undefined;page=await launch();assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.danbooru,true)
 const state=await page.evaluate(()=>window.moe.init());assert.equal(state.siteCounts.danbooru,10);assert.equal(state.siteCounts['konachan-g'],60);assert.equal((await page.evaluate(()=>window.moe.hints('','danbooru')))[0].word,'landscape')
 const result=await page.evaluate(()=>window.moe.search({site:'danbooru',keyword:'',page:1,count:10,minWidth:1,minHeight:1,filterResolution:false,orientation:0}));assert.ok(result.items.every(item=>item.viewed))
 await page.locator('#account').click({button:'right'});await page.waitForFunction(()=>document.querySelector('#toast').textContent==='已清除登录信息！');assert.equal((await page.evaluate(()=>window.moe.network())).loggedIn.danbooru,false)
})
