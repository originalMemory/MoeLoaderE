import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {_electron as electron} from 'playwright'
import {validateCustomSite,loadCustomCategories,customVisualPage} from '../src/main/custom-sites.ts'
import {sites} from '../src/shared/network.ts'
const base=JSON.parse(await readFile(new URL('../docs/examples/custom-site.json',import.meta.url),'utf8'))
const menu={Menus:{Path:'//nav/a',Mode:'Node'},MenuTitleFromMenus:{Path:'',Mode:'InnerText'},MenuUrlFromMenus:{Path:'',Mode:'Attribute',Attribute:'href'},FirstApi:'/index.html',FollowApi:'/page/{pagenum}.html',FollowApiReplaceFrom:'/old/',FollowApiReplaceTo:'/new/',OverridePagePara:base.PagePara}
const raw={...base,ShortName:'dynamic-fixture',DisplayName:'动态样本',PagePara:{},Categories:[],CustomLv2MenuItems:[menu]}
const html='<nav><a href="/">Home</a><a href="/skip">首页</a><a href="/old/art">画廊</a><a href="/photo">摄影</a></nav>'

test('动态分类：XPath、主页过滤、占位符/替换与覆盖规则',async()=>{
 const {config,definition}=validateCustomSite(raw);sites[config.ShortName]=definition
 try{
  const categories=await loadCustomCategories(config,async()=>html,new AbortController().signal)
  assert.deepEqual(categories.map(c=>c.Name),['画廊','摄影'])
  assert.equal(categories[0].FirstPageApi,'https://example.com/old/art/index.html')
  assert.equal(categories[0].FollowUpPageApi,'https://example.com/new/art/page/{pagenum}.html')
  config.Categories=categories
  let requested=''
  const page=await customVisualPage(config,{keyword:'',customCategory:0,count:1},3,1,0,{has:()=>false,add:()=>{}},async url=>{requested=url;return '<article><img src="/t.png"><a href="/detail">Title</a></article>'},new AbortController().signal)
  assert.equal(requested,'https://example.com/new/art/page/3.html');assert.equal(page.items.length,1)
  await assert.rejects(()=>loadCustomCategories(config,async()=>'<nav></nav>',new AbortController().signal),/没有找到/)
  await assert.rejects(()=>loadCustomCategories(config,async()=>'<nav><a href="https://undeclared.test/cat">外部</a></nav>',new AbortController().signal),/主机未声明/)
  const controller=new AbortController();controller.abort();await assert.rejects(()=>loadCustomCategories(config,async()=>html,controller.signal))
  assert.throws(()=>validateCustomSite({...raw,CustomLv2MenuItems:[{...menu,OverridePagePara:undefined}]}),/缺少/)
  assert.throws(()=>validateCustomSite({...raw,CustomLv2MenuItems:[{...menu,FollowApiReplaceFrom:''}]}),/不能为空/)
 }finally{delete sites[config.ShortName]}
})

test('动态分类桌面：失败重试、同任务加载、切站与搜索下载',{timeout:45000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-menus-')),dir=join(profile,'CustomSites')
 await mkdir(dir);await writeFile(join(dir,'dynamic.json'),JSON.stringify(raw))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({directory:join(profile,'images'),concurrency:1,fileTemplate:'%title',folderTemplate:'%site',autoRename:false,tagCount:0,firstOnly:false,firstCount:1}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
 t.after(async()=>{await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})}).catch(()=>{});await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 await app.evaluate(({session,nativeImage},menuHtml)=>{
  globalThis.menuLoads=0;globalThis.failMenus=true;globalThis.holdMenus=false;globalThis.urls=[]
  const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
  session.fromPartition('persist:moe-site-dynamic-fixture').protocol.handle('https',async request=>{
   const u=new URL(request.url);globalThis.urls.push(request.url)
   if(u.pathname==='/'){
    globalThis.menuLoads++;if(globalThis.failMenus)return new Response('failed',{status:503})
    if(globalThis.holdMenus)await new Promise(resolve=>globalThis.releaseMenu=resolve)
    return new Response(menuHtml)
   }
   if(u.pathname.endsWith('/index.html'))return new Response(Array.from({length:10},(_,i)=>`<article><img src="/t${i}.png"><a href="/detail">Title${i}</a></article>`).join(''))
   if(u.pathname==='/detail')return new Response('<img class="original" src="/original.png">')
   if(u.pathname.endsWith('.html'))return new Response('')
   return new Response(png,{headers:{'content-type':'image/png'}})
  })
 },html)
 const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#custom-directory').onclick!==null)
 const selectSite=async name=>{await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name,exact:true}).click()}
 await selectSite('动态样本');await page.waitForFunction(()=>document.querySelector('#custom-category').selectedOptions[0]?.textContent==='加载失败')
 assert.equal(await app.evaluate(()=>globalThis.menuLoads),1)
 await app.evaluate(()=>{globalThis.failMenus=false;globalThis.holdMenus=true})
 await selectSite('Konachan-G');await selectSite('动态样本')
 await page.waitForFunction(()=>document.querySelector('#custom-category').disabled)
 // Main-process callers and the selector share one in-flight menu load.
 await page.evaluate(()=>{window.categoryCheck=window.moe.customCategories('dynamic-fixture')})
 await selectSite('Konachan-G')
 for(let i=0;i<100&&!(await app.evaluate(()=>!!globalThis.releaseMenu));i++)await new Promise(resolve=>setTimeout(resolve,10))
 await app.evaluate(()=>globalThis.releaseMenu())
 assert.deepEqual(await page.evaluate(()=>window.categoryCheck),['画廊','摄影'])
 assert.equal(await page.locator('#custom-controls').isHidden(),true)
 assert.equal(await page.locator('#custom-category option').count(),0,'迟到结果不能覆盖当前站点')
 assert.equal(await app.evaluate(()=>globalThis.menuLoads),2)
 await selectSite('动态样本');await page.waitForFunction(()=>!document.querySelector('#custom-category').disabled)
 assert.equal(await app.evaluate(()=>globalThis.menuLoads),2,'成功后重选不重复请求')
 await page.getByRole('combobox',{name:'自定义站点分类',exact:true}).click();await page.getByRole('option',{name:'摄影',exact:true}).click()
 await page.locator('#parameters-toggle').click();await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click()
 await page.locator('.picture.loaded').nth(9).waitFor();await page.waitForFunction(()=>!document.querySelector('.picture button[title="下载"]').disabled)
 assert.ok((await app.evaluate(()=>globalThis.urls)).includes('https://example.com/photo/index.html'))
 await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('下载',{exact:true}).click();await page.locator('.download-row[data-status=success]').waitFor()
 const task=(await page.evaluate(()=>window.moe.downloads())).tasks[0];assert.ok((await readFile(task.path)).length)
 await page.screenshot({path:'artifacts/custom-menus-fixture.png',animations:'disabled'})
})


test('菜单首次失败后点击获取重试，成功时恢复分类控件',{timeout:20000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-menu-retry-'))
 await mkdir(join(profile,'CustomSites'));await writeFile(join(profile,'CustomSites','site.json'),JSON.stringify(raw))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
 t.after(async()=>{await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 await app.evaluate(({session,nativeImage},menuHtml)=>{
  globalThis.menuFails=true;globalThis.requestedPages=[]
  const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
  session.fromPartition('persist:moe-site-dynamic-fixture').protocol.handle('https',request=>{
   const url=new URL(request.url)
   if(url.pathname==='/')return globalThis.menuFails?new Response('failed',{status:503}):new Response(menuHtml)
   if(url.pathname.endsWith('index.html')){globalThis.requestedPages.push(url.pathname);return new Response(Array.from({length:10},(_,i)=>`<article><img src="/t${i}.png"><a href="/detail">Title</a></article>`).join(''))}
   if(url.pathname==='/detail')return new Response('<img class="original" src="/f.png">')
   return new Response(png,{headers:{'content-type':'image/png'}})
  })
 },html)
 const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#custom-directory').onclick!==null)
 await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'动态样本',exact:true}).click()
 await page.waitForFunction(()=>document.querySelector('#custom-category').textContent==='加载失败')
 await app.evaluate(()=>{globalThis.menuFails=false})
 await page.locator('#parameters-toggle').click();await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click()
 await page.locator('.picture.loaded').nth(9).waitFor();await page.waitForFunction(()=>!document.querySelector('#custom-category').disabled)
 assert.deepEqual(await page.locator('#custom-category option').allTextContents(),['画廊','摄影'])
 await page.getByRole('combobox',{name:'自定义站点分类',exact:true}).click();await page.getByRole('option',{name:'摄影',exact:true}).click();await page.locator('#search').click()
 await page.locator('.picture.loaded').nth(9).waitFor()
 assert.deepEqual(await app.evaluate(()=>globalThis.requestedPages),['/old/art/index.html','/photo/index.html'])
 assert.equal(await page.locator('#custom-category').inputValue(),'1')
})
