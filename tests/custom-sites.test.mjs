import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {_electron as electron} from 'playwright'
import {JSDOM} from 'jsdom'
import {validateCustomSite,customValue,resolveCustom,customVisualPage} from '../src/main/custom-sites.ts'
import {sites} from '../src/shared/network.ts'
import {exportBundle,importSources} from '../src/main/download-bundle.ts'

const rule=(Path,Mode='Attribute',Attribute='href',extra={})=>({Path,Mode,...(Mode==='Attribute'?{Attribute}:{}),...extra})
const config={ShortName:'fixture-custom',DisplayName:'样本站点',HomeUrl:'https://konachan.net',SearchApi:'https://konachan.net/search?q={keyword}&p={pagenum}',Config:{IsSupportKeyword:true},Categories:[{Name:'图组',FirstPageApi:'/gallery?p=1',FollowUpPageApi:'/gallery?p={pagenum}'},{Name:'其他',FirstPageApi:'/other?p=1',FollowUpPageApi:'/other?p={pagenum}',OverrideSearchApi:'/alternate?q={keyword}&p={pagenum}'}],PagePara:{
 MainPageImagesNodes:rule('//article','Node',undefined,{IsMultiValues:true}),
 ImageItemThumbnailUrlFromMainPageSingleImageNode:rule('./img','Attribute','src'),
 ImageItemTitleFromSingleMainPageSingleImageNode:rule('./a','InnerText'),
 ImageItemDetailUrlFromMainPageSingleImageNode:rule('./a'),
 DetailPageImagesNodes:rule('//img[@class="original"]','Node',undefined,{IsMultiValues:true}),
 DetailImageItemOriginUrlFromDetailImagesList:rule('','Attribute','src',{Pre:'https://images.example.test',Referer:'https://konachan.net/custom-ref'}),
 DetailCurrentPageIndex:rule('//span[@id="current"]','InnerText'),
 DetailNextPageIndex:rule('//a[@id="next"]','InnerText'),
 DetailNextPageUrl:rule('//a[@id="next"]','Attribute','href',{Pre:'currentDir'})
}}

test('原 XPath 取值变换、配置校验与详情循环保护',async()=>{
 const dom=new JSDOM('<main><a data-v="/img/a-12-34.jpg"> title &amp; value </a></main>')
 try{
  assert.equal(customValue(dom.window.document,rule('//missing','Attribute','data-v',{PathR2:'//a',Pre:'https://host.test',Replace:'a-',ReplaceTo:'b-',GetFileName:true})),'b-12-34.jpg')
  assert.equal(customValue(dom.window.document,rule('//a','Attribute','data-v',{GetNumFromMatches:-1})),'34')
  assert.equal(customValue(dom.window.document,rule('//a','InnerText',{},{RegexPattern:'title.*value'})),'title & value')
 }finally{dom.window.close()}
 const {definition}=validateCustomSite(config);sites[config.ShortName]=definition
 try{
  for(const bad of [{...config,Config:{IsSupportAccount:true}},{...config,CustomLv2MenuItems:[{}]},{...config,HomeUrl:'file:///tmp/a'},{...config,PagePara:{...config.PagePara,DetailLv3ImageOriginUrl:rule('//img')}},{...config,AllowedHosts:['user:pass@host.test']}])assert.throws(()=>validateCustomSite(bad))
  const item={site:config.ShortName,detail:'https://konachan.net/art/1',customCategory:0}
  await assert.rejects(()=>resolveCustom(config,item,async()=>'<img class="original" src="/f.png"><span id="current">1</span><a id="next" href="1">2</a>',new AbortController().signal),/循环/)
  const level2={...config,PagePara:{...config.PagePara,DetailPageImagesNodes:rule('//a','Node'),DetailImageItemOriginUrlFromDetailImagesList:undefined,DetailImageItemDetailUrlFromDetailImagesList:rule('','Attribute','href'),DetailLv2ImageOriginUrl:rule('//img','Attribute','src'),DetailLv2ImagePreviewUrl:rule('//img','Attribute','data-preview',{Referer:'https://konachan.net/preview-ref'})}}
  const resolved=await resolveCustom(level2,item,async url=>url.endsWith('/art/1')?'<a href="/child">image</a>':'<img src="https://images.example.test/original.png" data-preview="https://images.example.test/preview.jpg">',new AbortController().signal)
  assert.equal(resolved.original,'https://images.example.test/original.png');assert.equal(resolved.preview,'https://images.example.test/preview.jpg');assert.equal(resolved.previewReferer,'https://konachan.net/preview-ref')
  await assert.rejects(()=>resolveCustom({...config,PagePara:{...config.PagePara,DetailImageItemOriginUrlFromDetailImagesList:rule('','Attribute','src')}},item,async()=>'<img class="original" src="file:///etc/passwd">',new AbortController().signal),/主机未声明/)
 }finally{delete sites[config.ShortName]}
})

test('自定义站点桌面：目录/错误隔离/同域会话/分类搜索/详情图组/重启',{timeout:60000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-custom-')),directory=join(profile,'CustomSites'),images=join(profile,'images')
 await mkdir(directory)
 await writeFile(join(directory,'good.json'),JSON.stringify(config));await writeFile(join(directory,'bad.json'),'{bad')
 await writeFile(join(directory,'duplicate.json'),JSON.stringify({...config,ShortName:'pixiv'}))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({directory:images,concurrency:3,fileTemplate:'%title',folderTemplate:'%site',autoRename:false,tagCount:0,firstOnly:false,firstCount:1}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})});await app.close()}await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{
  app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env})
  await app.evaluate(async({session,nativeImage,shell})=>{
   globalThis.requests=[];globalThis.builtinRequests=0;shell.openPath=async path=>{globalThis.customPath=path;return ''}
   const png=nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()
   session.fromPartition('persist:moe-site-konachan-g').protocol.handle('https',()=>{globalThis.builtinRequests++;return new Response('[]')})
   const custom=session.fromPartition('persist:moe-site-fixture-custom');await custom.cookies.set({url:'https://konachan.net',name:'fixture',value:'custom-only'})
   custom.protocol.handle('https',request=>{
    const url=new URL(request.url);globalThis.requests.push({url:request.url,referer:request.headers.get('referer')})
    if(['/gallery','/search','/other','/alternate'].includes(url.pathname))return new Response(`<script>globalThis.untrustedRan=true</script><img src="https://unconfigured.test/unwanted.png">${url.searchParams.get('p')==='1'?Array.from({length:10},(_,i)=>`<article><img src="/thumb${i}.png"><a href="/art/${i}">Title${i}</a></article>`).join(''):''}`)
    if(url.pathname.startsWith('/art/')){
     const second=url.searchParams.has('page');return new Response(`<img class="original" src="/file${second?'3':'1'}.png">${second?'':'<img class="original" src="/file2.png"><span id="current">1</span><a id="next" href="?page=2">2</a>'}`)
    }
    return new Response(png,{headers:{'content-type':'image/png'}})
   })
  })
  const page=await app.firstWindow();await page.waitForLoadState('load');await page.waitForFunction(()=>document.querySelector('#custom-directory').onclick!==null);return page
 }
 let page=await launch()
 const initial=await page.evaluate(()=>window.moe.init());assert.equal(initial.customErrors.length,2);assert.equal(initial.sites.pixiv.custom,undefined)
 await page.locator('#settings-toggle').click();await page.locator('#custom-directory').click();await page.locator('#settings-toggle').click()
 assert.match(await app.evaluate(()=>globalThis.customPath),/CustomSites$/)
 await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'样本站点',exact:true}).click()
 await page.getByRole('combobox',{name:'自定义站点分类',exact:true}).click();await page.getByRole('option',{name:'其他',exact:true}).click()
 await page.locator('#keyword').fill('sky & 云');await page.locator('#count').fill('10');await page.locator('#count').press('Tab');await page.locator('#search').click()
 await page.locator('.picture.loaded').nth(9).waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.picture button[title="下载"]')].every(button=>!button.disabled))
 assert.equal(await page.locator('.resolution').first().isHidden(),true,'自定义站点没有分辨率时不显示 0×0')
 const requests=await app.evaluate(()=>globalThis.requests);const search=new URL(requests.find(r=>r.url.includes('/alternate?')).url);assert.equal(search.searchParams.get('q'),'sky & 云')
 assert.equal(await app.evaluate(()=>globalThis.builtinRequests),0,'与内置站点共用域名也必须使用独立会话')
 assert.equal(requests.some(r=>r.url.includes('unconfigured.test')),false,'HTML 子资源不自动加载')
 const opened=app.waitForEvent('window');await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('预览图',{exact:true}).click();const preview=await opened;await preview.locator('#large-image').waitFor({state:'visible'});await preview.close()
 await page.locator('.picture').first().hover();await page.locator('.picture').first().getByTitle('下载',{exact:true}).click();await page.locator('.download-row[data-status=success]').waitFor()
 const task=(await page.evaluate(()=>window.moe.downloads())).tasks[0];assert.equal(task.children.length,3)
 for(const child of task.children){assert.equal(child.source.site,config.ShortName);assert.equal(child.source.referer,'https://konachan.net/custom-ref');assert.ok((await readFile(child.path)).length)}
 const {definition}=validateCustomSite(config);sites[config.ShortName]=definition
 try{const bundle=exportBundle([{...task,status:'failed',children:task.children.map(child=>({...child,status:'failed'}))}]);assert.equal(importSources(bundle,()=>true).sources.length,3)}finally{delete sites[config.ShortName]}
 await page.screenshot({path:'artifacts/custom-sites-fixture.png',animations:'disabled'})
 await app.close();app=undefined;page=await launch()
 assert.equal((await page.evaluate(()=>window.moe.init())).siteCounts[config.ShortName],10)
 assert.equal((await page.evaluate(site=>window.moe.hints('',site),config.ShortName))[0].word,'sky & 云')
 const result=await page.evaluate(site=>window.moe.search({site,customCategory:0,keyword:'',page:1,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0}),config.ShortName)
 assert.equal(result.items.every(item=>item.viewed),true)
 assert.equal((await page.evaluate(()=>window.moe.network())).settings.siteModes[config.ShortName],'default')
})


test('分类覆盖规则独立于未使用的顶层规则，继承分类仍严格校验',async()=>{
 const overrides=config.Categories.map(category=>({...category,OverridePagePara:config.PagePara}))
 for(const top of [undefined,{},null]){
  const {config:loaded,definition}=validateCustomSite({...config,PagePara:top,Categories:overrides})
  sites[loaded.ShortName]=definition
  try{
   const page=await customVisualPage(loaded,{keyword:'',customCategory:0,count:1},1,1,0,{has:()=>false,add:()=>{}},async()=>'<article><img src="/t.png"><a href="/art/1">Title</a></article>',new AbortController().signal)
   assert.equal(page.items.length,1);assert.equal(page.error,undefined)
   const item=await resolveCustom(loaded,page.items[0],async()=>'<img class="original" src="/f.png">',new AbortController().signal)
   assert.equal(item.original,'https://images.example.test/f.png')
  }finally{delete sites[loaded.ShortName]}
 }
 assert.throws(()=>validateCustomSite({...config,PagePara:{},Categories:[overrides[0],config.Categories[1]]}),/缺少 MainPageImagesNodes/)
 assert.throws(()=>validateCustomSite({...config,Categories:[{...overrides[0],OverridePagePara:{}}]}),/缺少 MainPageImagesNodes/)
 assert.throws(()=>validateCustomSite({...config,Categories:[{...overrides[0],OverridePagePara:false}]}),/PagePara 无效/)
})

test('列表失败不标记丢弃条目已读，保留前面成功页的记录',async()=>{
 const {definition}=validateCustomSite(config);sites[config.ShortName]=definition
 const marked=new Set(),viewed={has:id=>marked.has(id),add:id=>marked.add(id)}
 const valid=id=>`<article><img src="/t.png"><a href="/art/${id}">Title</a></article>`
 const invalid='<article><img src="https://undeclared.test/t.png"><a href="/art/bad">bad</a></article>'
 const input={keyword:'',customCategory:0,count:10}
 try{
  const failed=await customVisualPage(config,input,1,1,0,viewed,async()=>valid('first')+invalid,new AbortController().signal)
  assert.equal(failed.items.length,0);assert.match(failed.error,/主机未声明/);assert.equal(marked.size,0)
  const repaired=await customVisualPage(config,{...input,count:1},1,1,0,viewed,async()=>valid('first'),new AbortController().signal)
  assert.equal(repaired.items[0].viewed,false);assert.equal(marked.size,1)
  marked.clear();let requests=0
  const partial=await customVisualPage(config,input,1,1,0,viewed,async()=>++requests===1?valid('first'):valid('second')+invalid,new AbortController().signal)
  assert.equal(partial.items.length,1);assert.match(partial.error,/主机未声明/);assert.equal(marked.size,1)
 }finally{delete sites[config.ShortName]}
})

test('自定义配置损坏或移走后保存，修复重启仍恢复每页数量',{timeout:30000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-custom-count-')),dir=join(profile,'CustomSites'),file=join(dir,'site.json')
 await mkdir(dir);await writeFile(file,JSON.stringify(config));await writeFile(join(profile,'browser.json'),JSON.stringify({siteCounts:{[config.ShortName]:17}}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app)await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});const page=await app.firstWindow();await page.waitForLoadState('load');return page}
 let page=await launch();assert.equal((await page.evaluate(()=>window.moe.init())).siteCounts[config.ShortName],17)
 // A changed active setting must override the value read at startup.
 await page.evaluate(site=>window.moe.count(23,site),config.ShortName);await app.close();app=undefined
 for(const broken of [true,false]){
  if(broken)await writeFile(file,'{bad');else await rm(file)
  page=await launch();if(broken)assert.equal((await page.evaluate(()=>window.moe.init())).customErrors.length,1)
  await page.evaluate(()=>window.moe.setDisplaySettings({showBackground:false,lowPerformance:false}))
  assert.equal(JSON.parse(await readFile(join(profile,'browser.json'),'utf8')).siteCounts[config.ShortName],23)
  await app.close();app=undefined
  await writeFile(file,JSON.stringify(config));page=await launch()
  assert.equal((await page.evaluate(()=>window.moe.init())).siteCounts[config.ShortName],23)
  await app.close();app=undefined
 }
})
