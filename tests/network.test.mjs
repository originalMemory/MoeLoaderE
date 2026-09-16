import assert from 'node:assert/strict'
import test from 'node:test'
import { networkDefaults, proxyConfig, proxyServer, validateNetwork, allowedSiteUrl } from '../src/shared/network.ts'
import { pixivQuery, parsePixivItems, pixivVisualPage, resolvePixiv } from '../src/shared/pixiv.ts'
import { Viewed, validateSearch } from '../src/shared/booru.ts'

test('代理规则校验、单站点优先级与站点域名隔离',()=>{
 const settings=networkDefaults();assert.deepEqual(proxyConfig(settings,'konachan-g'),{mode:'direct'})
 settings.globalMode='custom';settings.proxyAddress='localhost:8080'
 assert.equal(proxyConfig(settings,'konachan-g').proxyRules,'http://localhost:8080')
 settings.siteModes.pixiv='system';assert.deepEqual(proxyConfig(settings,'pixiv'),{mode:'system'})
 settings.siteModes.pixiv='none';assert.deepEqual(proxyConfig(settings,'pixiv'),{mode:'direct'})
 assert.equal(proxyServer('socks5://[::1]:1080'),'socks5://[::1]:1080')
 for(const address of ['host','host:0','host:99999','http://user:password@host:80','file:///tmp/proxy','https://host:443','host:80/path','host:80;DIRECT','host:80\nDIRECT'])assert.throws(()=>proxyServer(address))
 assert.throws(()=>validateNetwork({...settings,globalMode:'auto_detect'}))
 assert.equal(allowedSiteUrl('https://i.pximg.net/img/a.jpg','pixiv'),true)
 assert.equal(allowedSiteUrl('https://www.pixiv.net.evil.example/a','pixiv'),false)
 assert.equal(allowedSiteUrl('https://konachan.net/a.jpg','pixiv'),false)
 assert.equal(allowedSiteUrl('file:///etc/passwd','pixiv'),false)
})

test('Pixiv 查询编码、字段、分页游标与静态组图',async()=>{
 const input=validateSearch({site:'pixiv',pixivMode:'tag',pixivKind:'illust',keyword:'空 & sky',page:1,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0})
 const q=new URL(pixivQuery(input,2).url)
 assert.equal(q.searchParams.get('word'),'空 & sky');assert.equal(q.searchParams.get('p'),'2');assert.equal(decodeURIComponent(q.pathname),'/ajax/search/illustrations/空 & sky')
 const raw={id:'123',width:800,height:600,url:'https://i.pximg.net/img-master/img/2026/09/01/12/30/45/123_p0.jpg',title:'Title',userName:'artist',userId:'77',tags:['sky'],pageCount:2}
 const [item]=parsePixivItems([raw],input,new Viewed())
 assert.equal(item.site,'pixiv');assert.equal(item.title,'Title');assert.equal(item.detail,'https://www.pixiv.net/artworks/123')
 assert.equal(item.date,'2026-09-01 12:30:45')
 const details=await resolvePixiv(item,async()=>({error:false,body:[{urls:{original:'https://i.pximg.net/123_p0.png',regular:'https://i.pximg.net/123_p0.jpg'}},{urls:{original:'https://i.pximg.net/123_p1.png',regular:'https://i.pximg.net/123_p1.jpg'}}]}))
 assert.equal(details.pages.length,2);assert.match(details.original,/p0.png$/)
 const requests=[]
 const page=await pixivVisualPage({...input,keyword:''},1,1,0,new Viewed(),async url=>{requests.push(new URL(url).searchParams.get('lastId'));return {error:false,body:{illusts:requests.length===1?[raw]:[],lastId:'122'}}},new AbortController().signal)
 assert.deepEqual(requests,['','122']);assert.equal(page.items.length,1);assert.equal(page.complete,true)
 const failed=await pixivVisualPage(input,1,1,0,new Viewed(),async()=>({error:true}),new AbortController().signal)
 assert.match(failed.error,/Pixiv 返回错误/)
 assert.throws(()=>validateSearch({...input,pixivDate:'2026-02-31'}))
 const [animation]=parsePixivItems([{...raw,illustType:2}],input,new Viewed());await assert.rejects(()=>resolvePixiv(animation,async()=>({})),/动图转换尚未迁移/)
})


test('Pixiv 作者作品按请求 ID 降序展示，跨页连续且略过缺失作品',async()=>{
 const input=validateSearch({site:'pixiv',pixivMode:'author',pixivKind:'illust',keyword:'20',page:1,count:10,filterResolution:false,minWidth:1,minHeight:1,orientation:0})
 const ids=Array.from({length:21},(_,i)=>String(701+i))
 const get=async url=>url.endsWith('/all')?{error:false,body:{illusts:Object.fromEntries(ids.map(id=>[id,null]))}}:
  {error:false,body:{works:Object.fromEntries(new URL(url).searchParams.getAll('ids[]').filter(id=>id!=='716').map(id=>[id,{id,width:100,height:100,url:'https://i.pximg.net/a.jpg'}]))}}
 const first=await pixivVisualPage(input,1,1,0,new Viewed(),get,new AbortController().signal)
 const second=await pixivVisualPage(input,first.nextPage,2,first.items.length,new Viewed(),get,new AbortController().signal)
 assert.deepEqual([...first.items,...second.items].map(item=>item.id),ids.map(Number).reverse().filter(id=>id!==716))
 assert.equal(second.complete,true)
})
