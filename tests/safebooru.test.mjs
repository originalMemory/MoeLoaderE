import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { parseSafebooruXml } from '../src/shared/safebooru.ts'
import { parsePictures, query, Viewed } from '../src/shared/booru.ts'
import { networkDefaults, validateNetwork, allowedSiteUrl } from '../src/shared/network.ts'
import { importSources, exportBundle } from '../src/main/download-bundle.ts'

const input={site:'safebooru',keyword:'sky & clouds',page:2,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0}
test('Safebooru XML、参数、字段、错误与旧代理配置',()=>{
 const url=new URL(query(input));assert.equal(url.searchParams.get('pid'),'1');assert.equal(url.searchParams.get('tags'),input.keyword)
 const rows=parseSafebooruXml('<posts count="1"><post id="12" width="640" height="360" rating="q" author="A &amp; B" tags="sky clouds" preview_url="https://safebooru.org/t.png?x=1&amp;y=2" sample_url="https://safebooru.org/s.jpg" file_url="https://safebooru.org/f.png"/></posts>','posts')
 const [item]=parsePictures(rows,input,new Viewed());assert.equal(item.author,'A & B');assert.equal(item.filtered,false);assert.equal(item.large,item.preview);assert.equal(item.thumbnail,'https://safebooru.org/t.jpg?x=1&y=2');assert.match(item.detail,/id=12$/)
 assert.deepEqual(parseSafebooruXml('<posts count="0"/>','posts'),[])
 assert.equal(parseSafebooruXml('<tags><tag name="sky" count="3"/></tags>','tags')[0].count,'3')
 for(const xml of ['<html>failure</html>','<posts><post></posts>','<!DOCTYPE posts [<!ENTITY x "boom">]><posts/>','<response success="false" reason="down"/>'])assert.throws(()=>parseSafebooruXml(xml,'posts'))
 const old=networkDefaults();delete old.siteModes.safebooru;assert.equal(validateNetwork(old).siteModes.safebooru,'default')
 assert.equal(allowedSiteUrl('https://safebooru.org/images/a.jpg','safebooru'),true);assert.equal(allowedSiteUrl('https://safebooru.org/images/a.jpg','pixiv'),false)
})

test('Safebooru 桌面：搜索提示、预览、JPEG下载、任务包及独立状态恢复',{timeout:45000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-safebooru-')),directory=join(profile,'images')
 await writeFile(join(profile,'network.json'),JSON.stringify({settings:{globalMode:'none',proxyAddress:'127.0.0.1:1080',siteModes:{'konachan-g':'default',pixiv:'none'}}}))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({directory,concurrency:3,fileTemplate:'%sitedispname %id',folderTemplate:'%site',autoRename:false,tagCount:0,firstOnly:false,firstCount:1}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app)await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
  await app.evaluate(({session,nativeImage})=>{
   globalThis.safeRequests=[]
   const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
   session.fromPartition('persist:moe-site-safebooru').protocol.handle('https',request=>{
    const url=new URL(request.url);globalThis.safeRequests.push({url:request.url,referer:request.headers.get('referer')})
    if(url.searchParams.get('s')==='tag')return new Response('<tags><tag name="landscape" count="42"/></tags>')
    if(url.searchParams.get('s')==='post')return new Response(`<posts>${url.searchParams.get('pid')==='0'?Array.from({length:10},(_,i)=>`<post id="${100+i}" width="640" height="360" rating="s" preview_url="https://safebooru.org/t${i}.png" sample_url="https://safebooru.org/s${i}.png" jpeg_url="https://safebooru.org/j${i}.jpg" file_url="https://safebooru.org/f${i}.png"/>`).join(''):''}</posts>`)
    return new Response(png,{headers:{'content-type':'image/png'}})
   })
  })
  const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#settings-toggle').onclick!==null);return page
 }
 let page=await launch()
 assert.equal((await page.evaluate(()=>window.moe.network())).settings.siteModes.safebooru,'default')
 await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'Safebooru',exact:true}).click()
 assert.equal(await page.locator('#account').isHidden(),true)
 await page.locator('#keyword').fill('landscape');await page.locator('#hints button').first().waitFor();assert.match(await page.locator('#hints').textContent(),/42/)
 await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click();await page.locator('.picture.loaded').nth(9).waitFor()
 assert.match(await page.locator('#site-status').textContent(),/Safebooru/)
 const opened=app.waitForEvent('window');await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('预览图',{exact:true}).click();const preview=await opened;await preview.locator('#large-image').waitFor({state:'visible'});await preview.close()
 await page.getByRole('combobox',{name:'下载图片类型',exact:true}).click();await page.getByRole('option',{name:'Jpeg图',exact:true}).click()
 await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('下载',{exact:true}).click();await page.locator('.download-row[data-status=success]').waitFor()
 const task=(await page.evaluate(()=>window.moe.downloads())).tasks[0];assert.match(task.source.url,/j0.jpg$/);assert.equal(task.source.referer,'https://safebooru.org');assert.equal((await readFile(join(directory,'safebooru','Safebooru 100.jpg'))).length>0,true)
 const bundle=exportBundle([{...task,status:'stopped'}]);assert.equal(bundle.tasks[0].siteShortName,'safebooru');assert.equal(importSources(bundle,()=>true).sources[0].site,'safebooru')
 await page.screenshot({path:'artifacts/safebooru-fixture.png',animations:'disabled'})
 await page.locator('#next').click();await page.locator('#no-results').waitFor({state:'visible'})
 assert.equal((await page.evaluate(()=>window.moe.init())).siteCounts['konachan-g'],60)
 assert.deepEqual(await page.evaluate(()=>window.moe.hints('','konachan-g')),[])
 await app.close();app=undefined;page=await launch()
 const state=await page.evaluate(()=>window.moe.init());assert.equal(state.siteCounts.safebooru,10);assert.equal(state.siteCounts['konachan-g'],60)
 assert.equal((await page.evaluate(()=>window.moe.hints('','safebooru')))[0].word,'landscape')
 const result=await page.evaluate(()=>window.moe.search({site:'safebooru',keyword:'',page:1,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0}));assert.equal(result.items.every(item=>item.viewed),true)
})
