import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { DownloadQueue, downloadDefaults, filePath, taskbarProgress } from '../src/main/downloads.ts'
import { exportBundle, importSources, parseBundle } from '../src/main/download-bundle.ts'
const source = (id = 1, extra = {}) => ({ id, url: `https://konachan.net/${id}.png`, referer: `https://konachan.net/post/show/${id}`, detail: '', keyword: 'landscape', tags: ['sky','blue'], ...extra })
const wait = async predicate => { for (let n=0;n<500;n++) { if(await predicate())return;await new Promise(r=>setTimeout(r,10)) } throw Error('等待下载状态超时') }
const body = Buffer.from('verified image bytes')
const response = () => new Response(body, { headers: { 'content-type':'image/png', 'content-length': String(body.length) } })

test('下载文件：命名、并发、独占落盘与同名策略', async t => {
  const root = await mkdtemp(join(tmpdir(),'moe-download-')); t.after(()=>rm(root,{recursive:true,force:true}))
  const settings=downloadDefaults(root);settings.fileTemplate='%site %id';settings.folderTemplate='%site'
  let live=0,peak=0
  const queue=new DownloadQueue(settings, async()=>{live++;peak=Math.max(peak,live);await new Promise(r=>setTimeout(r,20));live--;return response()},()=>{})
  const tasks=queue.add([source(1),source(2),source(3),source(4)])
  await wait(()=>tasks.every(t=>t.status==='success')); assert.equal(peak,3)
  assert.deepEqual(await readFile(tasks[0].path),body)
  const [skip]=queue.add([source(1)]);await wait(()=>skip.status==='skip')
  settings.autoRename=true
  const duplicates=queue.add([source(1),source(1)])
  await wait(()=>duplicates.every(t=>t.status==='success'))
  assert.deepEqual(duplicates.map(t=>t.name).sort(),['konachan-g 1-2.png','konachan-g 1-3.png'])
  const names=await readdir(join(root,'konachan-g'));assert.equal(names.some(n=>n.endsWith('.part')),false)
  const path=filePath(source(9,{authorId:'42',title:'../escape',keyword:'x/y'}),{...settings,fileTemplate:'%sitedispname %upid %keyword',folderTemplate:'%site\\%title'})
  assert.ok(path.startsWith(root));assert.match(path,/Konachan-G 42 x_y\.png$/)
  assert.equal(path.includes('/escape/'),false)
  const long=filePath(source(10,{title:'汉😀'.repeat(400)}),{...settings,fileTemplate:'%title'});assert.ok(Buffer.byteLength(long.split('/').at(-1))<=240)
})

test('清除成功并重试失败，同时更新系统任务栏进度语义', async t => {
  const root=await mkdtemp(join(tmpdir(),'moe-clean-retry-'));t.after(()=>rm(root,{recursive:true,force:true}))
  let online=false
  const queue=new DownloadQueue({...downloadDefaults(root),concurrency:1},async()=>{if(!online)throw Error('offline');return response()},()=>{})
  const [failed]=queue.add([source(1)]);await wait(()=>failed.status==='failed')
  online=true;const [success]=queue.add([source(2)]);await wait(()=>success.status==='success')
  const [stopped]=queue.add([source(3)]);queue.action('stop',[stopped.id]);await queue.stopAll()
  assert.deepEqual(taskbarProgress(queue.tasks),{value:1,mode:'error'})
  queue.action('clear-success-retry-failed',queue.tasks.map(task=>task.id))
  assert.equal(queue.tasks.includes(success),false);assert.equal(queue.tasks.includes(stopped),true)
  await wait(()=>failed.status==='success')
  assert.deepEqual(taskbarProgress(queue.tasks),{value:-1,mode:'none'})
  queue.action('retry',[stopped.id]);await wait(()=>stopped.status==='success')
  assert.deepEqual(taskbarProgress(queue.tasks),{value:1,mode:'normal'})
  assert.deepEqual(taskbarProgress([{...success,status:'downloading',progress:50},{...success,progress:100}]),{value:.75,mode:'normal'})
  assert.deepEqual(taskbarProgress([]),{value:-1,mode:'none'})
})

test('断流、停止/重试和删除不留下半成品；组图失败如实汇总', async t => {
  const root=await mkdtemp(join(tmpdir(),'moe-cancel-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const settings={...downloadDefaults(root),folderTemplate:'%site',fileTemplate:'%id',concurrency:1}
  let slow=true, broken=false, attempts=0
  const queue=new DownloadQueue(settings, async(_url,signal)=>{
    attempts++
    if(broken)return new Response(new ReadableStream({start(c){c.enqueue(body);c.error(Error('断流'))}}),{headers:{'content-type':'image/png'}})
    if(!slow)return response()
    return new Response(new ReadableStream({start(c){c.enqueue(body);signal.addEventListener('abort',()=>c.error(signal.reason),{once:true})}}),{headers:{'content-type':'image/png'}})
  },()=>{})
  const [task]=queue.add([source()]);await wait(()=>task.loaded>0)
  queue.action('stop',[task.id]);assert.equal(task.status,'stopped');await queue.stopAll()
  assert.deepEqual(await readdir(join(root,'konachan-g')),[])
  slow=false;queue.action('retry',[task.id]);await wait(()=>task.status==='success');assert.deepEqual(await readFile(task.path),body)
  slow=true;const [removed]=queue.add([source(2)]);await wait(()=>removed.loaded>0);queue.action('remove',[removed.id]);await queue.stopAll()
  assert.equal(queue.tasks.includes(removed),false);assert.deepEqual(await readdir(join(root,'konachan-g')),['1.png'])
  slow=false;broken=true;const before=attempts;const [failed]=queue.add([source(3)]);await wait(()=>failed.status==='failed');assert.equal(attempts-before,3)
  assert.deepEqual(await readdir(join(root,'konachan-g')),['1.png'])
  const [group]=queue.add([source(4,{children:[source(5),source(6)]})]);await wait(()=>group.status==='failed');assert.match(group.text,/失败2张/)
  broken=false;queue.action('retry',[group.id]);await wait(()=>group.status==='success');assert.equal(group.children.length,2)
  assert.deepEqual(await readFile(group.children[0].path),body)
  settings.firstOnly=true;settings.firstCount=1;const [limited]=queue.add([source(7,{children:[source(8),source(9)]})]);await wait(()=>limited.status==='success');assert.equal(limited.children.length,1)
})

test('任务包 round-trip、合并去重、恶意路径与目录外符号链接', async t => {
  const root=await mkdtemp(join(tmpdir(),'moe-bundle-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const queue=new DownloadQueue(downloadDefaults(root),async()=>{throw Error('offline')},()=>{})
  const [task]=queue.add([source()]);await wait(()=>task.status==='failed')
  const bundle=exportBundle(queue.tasks);assert.equal(bundle.tasks.length,1)
  assert.equal(exportBundle(queue.tasks,parseBundle(JSON.stringify(bundle))).tasks.length,1)
  const parsed=importSources(parseBundle(JSON.stringify(bundle)),u=>u.startsWith('https://konachan.net/'))
  assert.equal(parsed.sources.length,1);assert.equal(parsed.sources[0].url,task.source.url)
  bundle.tasks.push({...bundle.tasks[0],downloadUrl:'file:///etc/passwd'})
  assert.equal(importSources(bundle,u=>u.startsWith('https://konachan.net/')).errors.length,1)
  assert.throws(()=>parseBundle('{"schema":"bad","version":1,"tasks":[]}'))
  const safe=filePath(source(2,{name:'../../escape'}),downloadDefaults(root));assert.ok(safe.startsWith(root));assert.equal(safe.endsWith('/escape.png'),false)
  const outside=join(root,'outside');await mkdir(outside)
  const inside=join(root,'inside');await mkdir(inside);await symlink(outside,join(inside,'linked'),'dir')
  const blocked=new DownloadQueue({...downloadDefaults(inside),folderTemplate:'linked'},async()=>response(),()=>{})
  const [bad]=blocked.add([source(3)]);await wait(()=>bad.status==='failed');assert.deepEqual(await readdir(outside),[])
})

test('命名 token 支持下划线、相邻 token 和字面量后缀，不误跳过其他作品', async t => {
  const root=await mkdtemp(join(tmpdir(),'moe-naming-review-'));t.after(()=>rm(root,{recursive:true,force:true}))
  const settings={...downloadDefaults(root),fileTemplate:'%id_%uploader',folderTemplate:'%site'}
  assert.equal(filePath(source(42,{author:'alice'}),settings),join(root,'konachan-g','42_alice.png'))
  assert.match(filePath(source(42,{authorId:'7'}),{...settings,fileTemplate:'%sitedispname_%uploader_id_%id%id_suffix'}),/Konachan-G_7_4242_suffix\.png$/)
  const queue=new DownloadQueue(settings,async()=>response(),()=>{})
  const tasks=queue.add([source(42,{author:'alice'}),source(43,{author:'alice'})])
  await wait(()=>tasks.every(t=>['success','skip'].includes(t.status)))
  assert.deepEqual(tasks.map(t=>t.status),['success','success'])
  for(const task of tasks)assert.deepEqual(await readFile(task.path),body)
})

test('目录准备期间立即停止或重试，旧任务不能覆盖新状态', async t => {
  const root=await mkdtemp(join(tmpdir(),'moe-early-cancel-'));t.after(()=>rm(root,{recursive:true,force:true}))
  let requests=0
  const queue=new DownloadQueue(downloadDefaults(root),async()=>{requests++;return response()},()=>{})
  const [stopped]=queue.add([source(1)])
  queue.action('stop',[stopped.id]);await queue.stopAll()
  assert.equal(stopped.status,'stopped');assert.equal(requests,0)
  const [retried]=queue.add([source(2)])
  queue.action('retry',[retried.id])
  await wait(()=>retried.status==='success')
  assert.equal(requests,1);assert.deepEqual(await readFile(retried.path),body)
})

test('任务包导出和合并必须满足回读限制，失败不改动原包', () => {
  const tasks=Array.from({length:10001},(_,id)=>({status:'failed',name:`${id}.png`,source:source(id)}))
  const valid=exportBundle(tasks.slice(0,10000))
  assert.equal(parseBundle(JSON.stringify(valid)).tasks.length,10000)
  assert.throws(()=>exportBundle(tasks),/10000/)
  const original=JSON.stringify(valid)
  assert.throws(()=>exportBundle(tasks.slice(10000),valid),/10000/)
  assert.equal(JSON.stringify(valid),original)
  const big=tasks.slice(0,900).map(task=>({...task,source:{...task.source,title:'汉'.repeat(4000)}}))
  assert.throws(()=>exportBundle(big),/8 MiB/)
})
