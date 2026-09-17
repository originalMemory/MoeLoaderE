import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {_electron as electron} from 'playwright'

test('主进程跨源图片请求保留明确配置的完整 Referer',{timeout:30000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-referer-')),received=[]
 let app,png=Buffer.alloc(0)
 const images=http.createServer((req,res)=>{received.push({url:req.url,referer:req.headers.referer});res.setHeader('content-type','image/png');res.setHeader('content-length',png.length);res.end(png)})
 await new Promise(resolve=>images.listen(0,'127.0.0.1',resolve))
 const cdn=`http://127.0.0.1:${images.address().port}`
 const origin=http.createServer((req,res)=>{
  res.setHeader('content-type','text/html')
  res.end(req.url==='/list?p=1'?`<article><img src="${cdn}/thumb.png"><a href="/detail?id=42">Image</a></article>`:req.url==='/detail?id=42'?`<img class="original" src="${cdn}/original.png">`:'')
 })
 await new Promise(resolve=>origin.listen(0,'127.0.0.1',resolve))
 const home=`http://127.0.0.1:${origin.address().port}`
 t.after(async()=>{if(app){await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})});await app.close()}origin.closeAllConnections();images.closeAllConnections();await Promise.all([new Promise(r=>origin.close(r)),new Promise(r=>images.close(r))]);await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const config=JSON.parse(await readFile(new URL('../docs/examples/custom-site.json',import.meta.url),'utf8'))
 Object.assign(config,{ShortName:'referrer-fixture',DisplayName:'Referer fixture',HomeUrl:home,AllowedHosts:[new URL(cdn).host],Categories:[{Name:'Images',FirstPageApi:'/list?p=1',FollowUpPageApi:'/list?p={pagenum}'}],Config:{IsSupportKeyword:false}})
 await mkdir(join(profile,'CustomSites'));await writeFile(join(profile,'CustomSites','site.json'),JSON.stringify(config))
 await writeFile(join(profile,'downloads.json'),JSON.stringify({directory:join(profile,'images'),concurrency:1,fileTemplate:'%title',folderTemplate:'%site',autoRename:false,tagCount:0,firstOnly:false,firstCount:1}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});const page=await app.firstWindow();await page.waitForLoadState('load')
 png=Buffer.from(await app.evaluate(({nativeImage})=>[...nativeImage.createFromBitmap(Buffer.alloc(16*16*4,200),{width:16,height:16}).toPNG()]))
 await page.waitForFunction(()=>document.querySelector('#custom-directory').onclick!==null)
 await page.getByRole('combobox',{name:'站点',exact:true}).click();await page.getByRole('option',{name:'Referer fixture',exact:true}).click();await page.locator('#search').click()
 await page.locator('.picture.loaded').waitFor();await page.waitForFunction(()=>!document.querySelector('.picture button[title="下载"]').disabled)
 await page.locator('.picture').hover();await page.getByTitle('下载',{exact:true}).click();await page.locator('.download-row[data-status=success]').waitFor()
 assert.ok(received.some(r=>r.url==='/thumb.png'&&r.referer===home+'/list?p=1'))
 assert.ok(received.some(r=>r.url==='/original.png'&&r.referer===home+'/detail?id=42'))
 const task=(await page.evaluate(()=>window.moe.downloads())).tasks[0];assert.deepEqual(await readFile(task.path),png)
})
