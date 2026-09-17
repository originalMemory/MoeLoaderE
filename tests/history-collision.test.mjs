import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {_electron as electron} from 'playwright'

test('内置与旧自定义站点重名时历史独立保存、恢复及清理',{timeout:30000},async t=>{
 const profile=await mkdtemp(join(tmpdir(),'moe-history-collision-'))
 const legacy=JSON.parse(await readFile(new URL('../docs/examples/custom-site.json',import.meta.url),'utf8'));legacy.ShortName='yande'
 await mkdir(join(profile,'CustomSites'));await writeFile(join(profile,'CustomSites','legacy.json'),JSON.stringify(legacy))
 const original=Array.from({length:8},(_,i)=>`legacy-${i}`),builtin=['builtin-query']
 await writeFile(join(profile,'browser.json'),JSON.stringify({customStates:{yande:{history:original,viewed:[123]},missing:{history:['inactive'],viewed:[456]}},yandeHistory:builtin}))
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.ELECTRON_RENDERER_URL
 let app
 t.after(async()=>{if(app)await app.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const launch=async()=>{app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});const page=await app.firstWindow();await page.waitForLoadState('load');return page}
 const saved=async()=>JSON.parse(await readFile(join(profile,'browser.json'),'utf8'))
 let page=await launch()
 assert.match((await page.evaluate(()=>window.moe.init())).customErrors[0],/重复/)
 assert.deepEqual((await page.evaluate(()=>window.moe.hints('','yande'))).map(h=>h.word),builtin)
 await page.evaluate(()=>window.moe.setDisplaySettings({showBackground:false,lowPerformance:false}))
 assert.deepEqual((await saved()).customStates.yande,{history:original,viewed:[123]})
 assert.deepEqual((await saved()).yandeHistory,builtin)
 await app.close();app=undefined;page=await launch()
 await page.evaluate(()=>window.moe.setSearchSettings({loadConcurrency:8,historyLimit:5,hideViewed:false}))
 assert.deepEqual((await saved()).customStates.yande.history,original.slice(0,5),'容量限制分别作用于两份历史')
 assert.deepEqual((await saved()).yandeHistory,builtin)
 // Failed persistence must roll back both namespaces in memory.
 await mkdir(join(profile,'browser.json.tmp'))
 await assert.rejects(()=>page.evaluate(()=>window.moe.clearHistory()))
 await rm(join(profile,'browser.json.tmp'),{recursive:true})
 await page.evaluate(()=>window.moe.setDisplaySettings({showBackground:true,lowPerformance:false}))
 assert.deepEqual((await saved()).customStates.yande.history,original.slice(0,5))
 assert.deepEqual((await saved()).yandeHistory,builtin)
 await page.evaluate(()=>window.moe.clearHistory())
 assert.deepEqual((await saved()).customStates.yande,{history:[],viewed:[123]})
 assert.deepEqual((await saved()).customStates.missing,{history:[],viewed:[456]})
 assert.deepEqual((await saved()).yandeHistory,[])
 await app.close();app=undefined;page=await launch()
 assert.deepEqual(await page.evaluate(()=>window.moe.hints('','yande')),[])
 await page.evaluate(()=>window.moe.setDisplaySettings({showBackground:false,lowPerformance:false}))
 assert.deepEqual((await saved()).customStates.yande.history,[],'重启后不能复活已清除的旧历史')
})
