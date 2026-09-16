import type { Picture, SearchInput, VisualPage } from './types'
import type { Viewed } from './booru'
export const pixivHome = 'https://www.pixiv.net'
const integer = (value: unknown): number => Number.isSafeInteger(Number(value)) ? Number(value) : 0
type Get = (url: string, referer?: string) => Promise<any>
function check(value: any): any {
  if (!value || typeof value !== 'object' || value.error === true) throw new Error('Pixiv 返回错误，请检查登录状态或搜索条件')
  return value
}
export function pixivQuery(input: SearchInput, page: number, cursor = ''): { url: string; referer: string } {
  const kind = input.pixivKind === 'manga' ? 'manga' : 'illustrations'
  if (input.pixivMode === 'rank') {
    const query = new URLSearchParams({mode:input.pixivPeriod || 'daily',content:input.pixivKind || 'all',date:(input.pixivDate || '').replaceAll('-',''),p:String(page),format:'json'})
    return {url:`${pixivHome}/ranking.php?${query}`,referer:`${pixivHome}/ranking.php`}
  }
  if (!input.keyword) return {url:`${pixivHome}/ajax/illust/new?${new URLSearchParams({lastId:cursor,limit:String(input.count),type:kind==='manga'?'manga':'illust',r18:'false'})}`,referer:`${pixivHome}/new_illust.php`}
  return {url:`${pixivHome}/ajax/search/${kind}/${encodeURIComponent(input.keyword)}?${new URLSearchParams({word:input.keyword,order:'date',mode:'safe',p:String(page),s_mode:'s_tag',type:kind==='manga'?'manga':'illust_and_ugoira'})}`,referer:`${pixivHome}/tags/${encodeURIComponent(input.keyword)}/${kind}`}
}
export function parsePixivItems(values: any[], input: SearchInput, viewed: Viewed): Picture[] {
  if (!Array.isArray(values) || values.length > 5000) throw new Error('Pixiv 图片列表格式无效')
  return values.map(raw => {
    const id = Number(raw.id ?? raw.illust_id), width = integer(raw.width), height=integer(raw.height)
    if (!Number.isSafeInteger(id)||id<=0) throw new Error('Pixiv 图片 ID 无效')
    const thumbnail=String(raw.url||''), nsfw=Number(raw.xRestrict ?? raw.x_restrict ?? 0)>0
    const date=thumbnail.match(/\/img\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})/)
    const item: Picture={key:'',site:'pixiv',id,width,height,score:integer(raw.rating_count),pageCount:integer(raw.pageCount??raw.illust_page_count),rank:integer(raw.rank),title:String(raw.title||''),author:String(raw.userName??raw.user_name??''),authorId:String(raw.userId??raw.user_id??''),
      tags:Array.isArray(raw.tags)?raw.tags.map(String):[],date:date?`${date[1]}-${date[2]}-${date[3]} ${date[4]}:${date[5]}:${date[6]}`:'',source:'',detail:`${pixivHome}/artworks/${id}`,thumbnail,preview:thumbnail,original:'',bytes:0,nsfw,viewed:viewed.has(id),
      filtered:nsfw||(input.filterResolution&&(width<input.minWidth||height<input.minHeight))||(input.orientation===1&&height>=width)||(input.orientation===2&&height<=width)}
    if (item.rank && item.rank > 0) { const previous = integer(raw.yes_rank); item.tip = previous ? `之前#${previous}` : '首次登场'; item.tipHighlight = previous === 0 }
    if(Number(raw.illustType??raw.illust_type)===2) { item.unsupported='Pixiv 动图转换尚未迁移，将在后续站点阶段实现。'; item.tip ||= '动图' }
    viewed.add(id);return item
  })
}
export async function pixivVisualPage(input: SearchInput, page: number, index: number, offset: number, viewed: Viewed, get: Get, signal: AbortSignal, cursor = ''): Promise<VisualPage> {
  const result: VisualPage={index,firstPage:page,nextPage:page,complete:false,items:[],realPages:[],cursor}
  let shown=0
  while(shown<input.count){
    signal.throwIfAborted()
    try{
      let records:any[],nextCursor=cursor
      if(input.pixivMode==='author'){
        if(!/^\d+$/.test(input.keyword))throw new Error('参数错误，必须在关键词中指定画师 id（纯数字）')
        const category=input.pixivKind==='manga'?'manga':'illusts', base=`${pixivHome}/ajax/user/${input.keyword}/profile`
        const all=check(await get(`${base}/all`,`${pixivHome}/users/${input.keyword}`)).body?.[category] || {}
        const ids=Object.keys(all).sort((a,b)=>Number(b)-Number(a)).slice((result.nextPage-1)*input.count,result.nextPage*input.count)
        if(!ids.length)records=[]
        else{
          const query=new URLSearchParams({work_category:category,is_first_page:'1'});ids.forEach(id=>query.append('ids[]',id))
          const works=check(await get(`${base}/illusts?${query}`,`${pixivHome}/users/${input.keyword}`)).body?.works||{}
          records=ids.map(id=>works[id]).filter(Boolean)
        }
      }else{
        const q=pixivQuery(input,result.nextPage,cursor),data=check(await get(q.url,q.referer))
        records=input.pixivMode==='rank'?data.contents:!input.keyword?data.body?.illusts:input.pixivKind==='manga'?data.body?.manga?.data:data.body?.illust?.data
        nextCursor=String(data.body?.lastId||'')
      }
      signal.throwIfAborted()
      const items=parsePixivItems(records,input,viewed),output=items.filter(item=>!item.filtered).length
      result.items.push(...items);result.realPages.push({page:result.nextPage,count:items.length,output,start:offset+1,end:offset+items.length})
      result.nextPage++;offset+=items.length;shown+=output
      if(!items.length || input.pixivMode==='tag'&&!input.keyword&&(!nextCursor||nextCursor===cursor))result.complete=true
      cursor=nextCursor;result.cursor=cursor
      if(result.complete)break
    }catch(error){signal.throwIfAborted();result.error=error instanceof Error?error.message:String(error);result.complete=true;break}
  }
  return result
}
export async function resolvePixiv(item: Picture, get: Get): Promise<Picture> {
  if(item.unsupported)throw new Error(item.unsupported)
  const result=check(await get(`${pixivHome}/ajax/illust/${item.id}/pages`,item.detail))
  if(!Array.isArray(result.body)||!result.body.length||result.body.length>5000)throw new Error('Pixiv 作品详情格式无效')
  const pages=result.body.map((page:any)=>({original:String(page.urls?.original||''),preview:String(page.urls?.regular||'')}))
  return {...item,preview:pages[0].preview,original:pages[0].original,pageCount:pages.length,pages}
}
