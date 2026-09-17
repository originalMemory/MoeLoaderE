import { JSDOM } from 'jsdom'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, lstatSync } from 'node:fs'
import { join, basename } from 'node:path'
import { sites, allowedSiteUrl } from '../shared/network.ts'
import type { Picture, SearchInput, VisualPage, SiteDefinition } from '../shared/types'
import type { Viewed } from '../shared/booru'

interface XPathRule { Path?: string; PathR2?: string; Mode: 'Node' | 'Attribute' | 'InnerText'; Attribute?: string; Pre?: string; After?: string; IsMultiValues?: boolean; RegexPattern?: string; Replace?: string; ReplaceTo?: string; Referer?: string; GetFileName?: boolean; GetNumFromMatches?: number }
type PageRules = Record<string, XPathRule | undefined>
interface Category { Name: string; FirstPageApi: string; FollowUpPageApi: string; OverrideSearchApi?: string; OverridePagePara?: PageRules }
export interface CustomSite { ShortName: string; DisplayName: string; HomeUrl: string; SearchApi?: string; Categories: Category[]; PagePara: PageRules; Config?: { IsSupportKeyword?: boolean; IsSupportAccount?: boolean; IsR18Site?: boolean }; AllowedHosts?: string[] }
const ruleNames = ['MainPageImagesNodes','ImageItemThumbnailUrlFromMainPageSingleImageNode','ImageItemTitleFromSingleMainPageSingleImageNode','ImageItemDetailUrlFromMainPageSingleImageNode','ImageItemDateTimeFromMainPageSingleImageNode','ImagesCountFromMainPageSingleImageNode','DetailPageImagesNodes','DetailPageImageItemThumbnailUrlFromSingleDetailPageImageNodes','DetailImageItemOriginUrlFromDetailImagesList','DetailImageItemDetailUrlFromDetailImagesList','DetailCurrentPageIndex','DetailNextPageIndex','DetailNextPageUrl','DetailMaxPageIndex','DetailImagesCount','DetailLv2ImageOriginUrl','DetailLv2ImagePreviewUrl']
const document = (): Document => new JSDOM('').window.document
function select(root: Node, rule?: XPathRule): Node[] {
  if (!rule) return []
  const doc = root.nodeType === 9 ? root as Document : root.ownerDocument!
  const evaluate = (path?: string): Node[] => {
    if (!path) return [root]
    const result = doc.evaluate(path, root, null, 7, null)
    if (result.snapshotLength > 5000) throw new Error('XPath 节点超过 5000 个')
    return Array.from({length:result.snapshotLength},(_,index)=>result.snapshotItem(index)!)
  }
  let nodes = evaluate(rule.Path)
  if (!nodes.length && !rule.IsMultiValues && rule.PathR2) nodes = evaluate(rule.PathR2)
  return rule.IsMultiValues ? nodes : nodes.slice(0,1)
}
export function customValue(root: Node, rule?: XPathRule): string {
  if (!rule) return ''
  const node=select(root,rule)[0];if(!node)return ''
  let value=rule.Mode==='Attribute'?(node as Element).getAttribute?.(rule.Attribute || '') || '':node.textContent || ''
  if(rule.Pre && rule.Pre!=='currentDir')value=rule.Pre+value
  if(rule.After)value+=rule.After
  if(rule.RegexPattern)value=value.match(new RegExp(rule.RegexPattern))?.[0] ?? value
  if(rule.Replace && rule.ReplaceTo!==undefined)value=value.split(rule.Replace).join(rule.ReplaceTo)
  if(rule.GetFileName)value=value.split(/[\\/]/).at(-1) || ''
  if(rule.GetNumFromMatches!==undefined)value=value.match(/[0-9]+/g)?.at(rule.GetNumFromMatches) ?? value
  return value
}
function validateRules(value: unknown): PageRules {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('PagePara 无效')
  const rules:PageRules={};const doc=document()
  try {
    for(const [key,rule] of Object.entries(value)){
      if(rule==null)continue
      if(!ruleNames.includes(key))throw new Error(`尚不支持 PagePara.${key}`)
      if(typeof rule!=='object'||!['Node','Attribute','InnerText'].includes(rule.Mode))throw new Error(`${key} 的 XPath Mode 无效`)
      for(const field of ['Path','PathR2','Attribute','Pre','After','RegexPattern','Replace','ReplaceTo','Referer'])if(rule[field]!=null&&(typeof rule[field]!=='string'||rule[field].length>4096))throw new Error(`${key}.${field} 无效`)
      if(rule.IsMultiValues && rule.Mode!=='Node')throw new Error(`${key} 的多值文本尚不支持，请使用 Node 集合逐项提取`)
      if(rule.Mode==='Attribute'&&!rule.Attribute)throw new Error(`${key} 缺少 Attribute`)
      for(const field of ['IsMultiValues','GetFileName'])if(rule[field]!=null&&typeof rule[field]!=='boolean')throw new Error(`${key}.${field} 无效`)
      if(rule.GetNumFromMatches!=null&&!Number.isInteger(rule.GetNumFromMatches))throw new Error('GetNumFromMatches 无效')
      for(const path of [rule.Path,rule.PathR2])if(path)doc.evaluate(path,doc,null,7,null)
      if(rule.RegexPattern)new RegExp(rule.RegexPattern)
      rules[key]=Object.fromEntries(Object.entries(rule).filter(([,v])=>v!=null)) as unknown as XPathRule
    }
  } finally { doc.defaultView?.close() }
  for(const key of ['MainPageImagesNodes','ImageItemThumbnailUrlFromMainPageSingleImageNode','ImageItemDetailUrlFromMainPageSingleImageNode','DetailPageImagesNodes'])if(!rules[key])throw new Error(`缺少 ${key}`)
  for(const key of ['MainPageImagesNodes','DetailPageImagesNodes'])if(rules[key]?.Mode!=='Node')throw new Error(`${key} 必须使用 Node 模式`)
  if(!rules.DetailImageItemOriginUrlFromDetailImagesList && !(rules.DetailImageItemDetailUrlFromDetailImagesList&&rules.DetailLv2ImageOriginUrl))throw new Error('缺少原图或第二级详情规则')
  return rules
}
export function validateCustomSite(raw: any): { config: CustomSite; definition: SiteDefinition } {
  if(!raw||typeof raw!=='object'||typeof raw.ShortName!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(raw.ShortName))throw new Error('ShortName 无效')
  if(typeof raw.DisplayName!=='string'||!raw.DisplayName.trim()||raw.DisplayName.length>100)throw new Error('DisplayName 无效')
  const home=new URL(raw.HomeUrl)
  if(!['https:','http:'].includes(home.protocol)||home.username||home.password)throw new Error('HomeUrl 必须为 HTTP(S) 地址')
  if(raw.Config!==undefined&&(!raw.Config||typeof raw.Config!=='object'||Array.isArray(raw.Config)))throw new Error('Config 无效')
  for(const key of ['IsSupportKeyword','IsSupportAccount','IsR18Site'])if(raw.Config?.[key]!=null&&typeof raw.Config[key]!=='boolean')throw new Error(`Config.${key} 必须为布尔值`)
  if(raw.Config?.IsSupportAccount || raw.LoginUrl || raw.CookieLoginAuthKey)throw new Error('自定义站点网页登录尚未迁移')
  if(raw.Config?.IsR18Site)throw new Error('自定义站点 NSFW 模式尚未迁移')
  if(raw.CustomLv2MenuItems?.length)throw new Error('动态分类尚未迁移，请使用静态 Categories')
  if(!Array.isArray(raw.Categories)||!raw.Categories.length||raw.Categories.length>100)throw new Error('需要 1–100 个静态 Categories')
  const page=raw.Categories.some((category:any)=>category?.OverridePagePara==null)?validateRules(raw.PagePara):{}
  const hosts=new Set<string>([home.host])
  const checkUrl=(value: unknown):string=>{
    if(typeof value!=='string'||value.length>4096)throw new Error('分类/API 地址无效')
    const url=new URL(value.replaceAll('{keyword}','sample').replaceAll('{pagenum-1}','0').replaceAll('{pagenum}','1'),home)
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('配置包含非 HTTP(S) 地址')
    hosts.add(url.host);return value
  }
  const categories=raw.Categories.map((category:any)=>{
    if(typeof category?.Name!=='string'||!category.Name||category.Name.length>100)throw new Error('分类 Name 无效')
    return {Name:category.Name,FirstPageApi:checkUrl(category.FirstPageApi),FollowUpPageApi:checkUrl(category.FollowUpPageApi),...(category.OverrideSearchApi?{OverrideSearchApi:checkUrl(category.OverrideSearchApi)}:{}),...(category.OverridePagePara!=null?{OverridePagePara:validateRules(category.OverridePagePara)}:{})}
  })
  const search=raw.SearchApi?checkUrl(raw.SearchApi):undefined
  for(const rules of [page,...categories.map((cat:Category)=>cat.OverridePagePara).filter(Boolean)])for(const rule of Object.values(rules as PageRules))if(rule){if(rule.Pre?.startsWith('http'))checkUrl(rule.Pre);if(rule.Referer)checkUrl(rule.Referer)}
  if(raw.AllowedHosts!==undefined){if(!Array.isArray(raw.AllowedHosts)||raw.AllowedHosts.length>50)throw new Error('AllowedHosts 无效');for(const host of raw.AllowedHosts){if(typeof host!=='string'||new URL(`https://${host}`).host!==host)throw new Error('AllowedHosts 必须为主机名（可含端口）');hosts.add(host)}}
  const icon=raw.SiteIconUrl?new URL(checkUrl(raw.SiteIconUrl),home).href:undefined
  const config={ShortName:raw.ShortName,DisplayName:raw.DisplayName,HomeUrl:home.href,SearchApi:search,PagePara:page,Categories:categories,Config:raw.Config}
  return {config,definition:{name:config.DisplayName,home:home.href,login:'',hosts:[...hosts],custom:true,icon,categories:categories.map((cat:Category)=>cat.Name),keyword:raw.Config?.IsSupportKeyword!==false&&!!(search||categories.some((cat:Category)=>cat.OverrideSearchApi))}}
}
export function loadCustomSites(directory: string): { configs: Map<string,CustomSite>; errors: string[] } {
  const configs=new Map<string,CustomSite>(),errors:string[]=[]
  let files: string[]
  try { files=readdirSync(directory) } catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {configs,errors};return {configs,errors:['无法读取自定义站点目录']}}
  const names=files.filter(name=>name.toLowerCase().endsWith('.json')).sort()
  if(names.length>64)errors.push('自定义站点超过 64 个，仅加载前 64 个')
  for(const name of names.slice(0,64))try{
    const file=join(directory,name),stat=lstatSync(file);if(!stat.isFile()||stat.size>1024*1024)throw new Error('仅支持 1 MiB 内的 JSON 常规文件')
    const {config,definition}=validateCustomSite(JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,'')))
    if(Object.keys(sites).some(id=>id.toLowerCase()===config.ShortName.toLowerCase())||['__proto__','constructor','prototype'].includes(config.ShortName.toLowerCase()))throw new Error('站点短名重复或保留')
    sites[config.ShortName]=definition;configs.set(config.ShortName,config)
  }catch(error){errors.push(`读取 ${basename(name)} 失败：${error instanceof Error?error.message:String(error)}`)}
  return {configs,errors}
}
type Get = (url:string,referer?:string)=>Promise<string>
function urlValue(root:Node,rule:XPathRule|undefined,base:string,site:string):string {
  const text=customValue(root,rule);if(!text)return ''
  const url=new URL(text,rule?.Pre==='currentDir'?new URL('.',base):base).href;if(!allowedSiteUrl(url,site))throw new Error('自定义资源主机未声明，请检查 HomeUrl / Pre / AllowedHosts')
  return url
}
function referer(rule:XPathRule|undefined,base:string,site:string):string { const value=new URL(rule?.Referer||base,base).href;if(!allowedSiteUrl(value,site))throw new Error('Referer 主机未声明');return value }
export async function customVisualPage(config:CustomSite,input:SearchInput,page:number,index:number,offset:number,viewed:Pick<Viewed, 'has' | 'add'>,get:Get,signal:AbortSignal):Promise<VisualPage>{
  const category=config.Categories[input.customCategory??0];if(!category)throw new Error('自定义分类无效')
  const rules=category.OverridePagePara||config.PagePara,result:VisualPage={index,firstPage:page,nextPage:page,complete:false,items:[],realPages:[]}
  while(result.items.length<input.count){
    signal.throwIfAborted()
    try{
      const template=input.keyword?(category.OverrideSearchApi||config.SearchApi):(result.nextPage===1?category.FirstPageApi:category.FollowUpPageApi)
      if(!template)throw new Error('该分类不支持关键词搜索')
      const url=new URL(template.replaceAll('{keyword}',encodeURIComponent(input.keyword)).replaceAll('{pagenum-1}',String(result.nextPage-1)).replaceAll('{pagenum}',String(result.nextPage)),config.HomeUrl).href
      const html=await get(url);signal.throwIfAborted();const dom=new JSDOM(html,{url})
      const records:Picture[]=[], viewedIds:number[]=[]
      try{for(const node of select(dom.window.document,rules.MainPageImagesNodes)){
        const thumbnail=urlValue(node,rules.ImageItemThumbnailUrlFromMainPageSingleImageNode,url,config.ShortName);if(!thumbnail)continue
        const detail=urlValue(node,rules.ImageItemDetailUrlFromMainPageSingleImageNode,url,config.ShortName);if(!detail)throw new Error('自定义条目缺少详情链接')
        const viewedId=parseInt(createHash('sha256').update(detail).digest('hex').slice(0,12),16)
        records.push({key:'',id:0,site:config.ShortName,customCategory:input.customCategory??0,title:customValue(node,rules.ImageItemTitleFromSingleMainPageSingleImageNode),date:customValue(node,rules.ImageItemDateTimeFromMainPageSingleImageNode),pageCount:Number(customValue(node,rules.ImagesCountFromMainPageSingleImageNode))||undefined,thumbnail,thumbnailReferer:referer(rules.ImageItemThumbnailUrlFromMainPageSingleImageNode,url,config.ShortName),detail,preview:thumbnail,original:'',width:0,height:0,score:0,author:'',authorId:'',tags:[],bytes:0,source:'',nsfw:false,filtered:false,viewed:viewed.has(viewedId)});viewedIds.push(viewedId)
      }}finally{dom.window.close()}
      signal.throwIfAborted()
      for(const id of viewedIds)viewed.add(id)
      result.items.push(...records);result.realPages.push({page:result.nextPage,count:records.length,output:records.length,start:offset+1,end:offset+records.length});offset+=records.length;result.nextPage++
      if(!records.length){result.complete=true;break}
    }catch(error){signal.throwIfAborted();result.error=error instanceof Error?error.message:String(error);result.complete=true;break}
  }
  return result
}
export async function resolveCustom(config:CustomSite,item:Picture,get:Get,signal:AbortSignal):Promise<Picture>{
  const rules=config.Categories[item.customCategory??0]?.OverridePagePara||config.PagePara
  const pages:NonNullable<Picture['pages']>=[],visited=new Set<string>();let url=item.detail
  while(url){
    signal.throwIfAborted();if(visited.has(url)||visited.size>=100)throw new Error('详情分页循环或超过 100 页');visited.add(url)
    const dom=new JSDOM(await get(url),{url})
    try{
      signal.throwIfAborted()
      for(const node of select(dom.window.document,rules.DetailPageImagesNodes)){
        let original=urlValue(node,rules.DetailImageItemOriginUrlFromDetailImagesList,url,config.ShortName),preview='',previewReferer='',originalReferer=referer(rules.DetailImageItemOriginUrlFromDetailImagesList,url,config.ShortName)
        if(!original&&rules.DetailImageItemDetailUrlFromDetailImagesList){
          const detail=urlValue(node,rules.DetailImageItemDetailUrlFromDetailImagesList,url,config.ShortName);if(!detail)throw new Error('第二级详情地址为空')
          const child=new JSDOM(await get(detail),{url:detail})
          try{original=urlValue(child.window.document,rules.DetailLv2ImageOriginUrl,detail,config.ShortName);preview=urlValue(child.window.document,rules.DetailLv2ImagePreviewUrl,detail,config.ShortName);originalReferer=referer(rules.DetailLv2ImageOriginUrl,detail,config.ShortName);previewReferer=referer(rules.DetailLv2ImagePreviewUrl,detail,config.ShortName)}finally{child.window.close()}
        }
        if(!original)throw new Error('自定义详情没有原图')
        pages.push({original,preview:preview||original,referer:originalReferer,previewReferer:preview?previewReferer:originalReferer});if(pages.length>5000)throw new Error('图组超过 5000 张')
      }
      const current=Number(customValue(dom.window.document,rules.DetailCurrentPageIndex)),next=Number(customValue(dom.window.document,rules.DetailNextPageIndex))
      url=next===current+1?urlValue(dom.window.document,rules.DetailNextPageUrl,url,config.ShortName):''
    }finally{dom.window.close()}
  }
  if(!pages.length)throw new Error('自定义详情没有图片')
  return {...item,pages,pageCount:pages.length,original:pages[0].original,preview:pages[0].preview,previewReferer:pages[0].previewReferer}
}
