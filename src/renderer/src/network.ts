import type { NetworkSnapshot, SearchInput, SiteId } from '../../shared/types'
import { networkDefaults, sites } from '../../shared/network'

export function installNetworkUi(report: (text: string) => void, counts: Record<SiteId, number>): () => Partial<SearchInput> {
  const site = document.querySelector<HTMLSelectElement>('#site')!, proxy = document.querySelector<HTMLSelectElement>('#proxy')!
  const globalProxy = document.querySelector<HTMLSelectElement>('#global-proxy')!, address = document.querySelector<HTMLInputElement>('#proxy-address')!
  const account = document.querySelector<HTMLButtonElement>('#account')!
  const mode = document.querySelector<HTMLSelectElement>('#pixiv-mode')!, subcategory = document.querySelector<HTMLSelectElement>('#pixiv-subcategory')!
  const kind = document.querySelector<HTMLSelectElement>('#pixiv-kind')!, date = document.querySelector<HTMLInputElement>('#pixiv-date')!
  const count = document.querySelector<HTMLInputElement>('#count')!
  count.addEventListener('change', () => { if (count.checkValidity()) counts[site.value as SiteId] = Number(count.value) })
  let snapshot: NetworkSnapshot = {settings:networkDefaults(),loggedIn:{'konachan-g':false,pixiv:false,safebooru:false}}
  const refresh = (select: HTMLSelectElement): void => { select.dispatchEvent(new Event('moe:refresh')) }
  const apply = (value: NetworkSnapshot): void => {
    snapshot=value;globalProxy.value=value.settings.globalMode;if(document.activeElement!==address)address.value=value.settings.proxyAddress;proxy.value=value.settings.siteModes[site.value as SiteId]
    for(const select of [globalProxy,proxy])refresh(select)
    account.querySelector<HTMLElement>('.account-check')!.hidden=!snapshot.loggedIn[site.value as SiteId]
  }
  let updating = false
  const update = async (): Promise<void> => {
    if (updating) return
    updating = true
    for (const field of [globalProxy, proxy, address]) field.disabled = true
    const next={...snapshot.settings,globalMode:globalProxy.value as NetworkSnapshot['settings']['globalMode'],proxyAddress:address.value,siteModes:{...snapshot.settings.siteModes,[site.value]:proxy.value as NetworkSnapshot['settings']['siteModes'][string]}}
    try{await window.moe.setNetwork(next);apply(await window.moe.network())}
    catch(error){apply(snapshot);report(String(error))}
    finally { updating = false; for (const field of [globalProxy, proxy, address]) field.disabled = false }
  }
  globalProxy.onchange=()=>{void update()};proxy.onchange=()=>{void update()};address.onblur=()=>{if(address.value!==snapshot.settings.proxyAddress)void update()}
  const showMode = (): void => {
    const rank=mode.value==='rank'
    const choices=rank?[['daily','今日'],['weekly','本周'],['monthly','本月'],['rookie','新人'],['original','原创'],['male','最受男性欢迎'],['female','最受女性欢迎']]:[['illust','插画+动图'],['manga','漫画']]
    subcategory.replaceChildren(...choices.map(([value,label])=>new Option(label,value)));refresh(subcategory)
    document.querySelector<HTMLElement>('#pixiv-rank-kind')!.hidden=!rank;date.hidden=!rank
    document.querySelector<HTMLInputElement>('#keyword')!.disabled=rank
    document.body.classList.toggle('pixiv-rank',rank&&site.value==='pixiv')
  }
  const applyCategories = (selectedSite: string, names: string[]): void => {
    sites[selectedSite].categories=names
    if(site.value!==selectedSite)return
    const category=document.querySelector<HTMLSelectElement>('#custom-category')!
    const index=category.disabled?0:Math.max(0,category.selectedIndex)
    category.replaceChildren(...names.map((name,index)=>new Option(name,String(index))))
    category.selectedIndex=Math.min(index,names.length-1);category.disabled=false;refresh(category)
  }
  const unsubscribeCategories=window.moe.onCustomCategories(applyCategories)
  window.addEventListener('unload',unsubscribeCategories,{once:true})
  let siteEpoch = 0
  const showSite = (): void => {
    const epoch=++siteEpoch, selectedSite=site.value
    const pixiv=site.value==='pixiv', definition=sites[site.value], custom=!!definition.custom
    const category=document.querySelector<HTMLSelectElement>('#custom-category')!
    category.replaceChildren(...(definition.categories ?? []).map((name,index)=>new Option(name,String(index))));refresh(category)
    category.disabled=false
    if(definition.dynamicCategories){
      category.replaceChildren(new Option('加载中…',''));category.disabled=true;refresh(category)
      void window.moe.customCategories(selectedSite).then(names=>{
        definition.categories=names
        if(epoch!==siteEpoch)return
        applyCategories(selectedSite,names)
      }).catch(error=>{
        if(epoch!==siteEpoch)return
        category.replaceChildren(new Option('加载失败',''));refresh(category);report(String(error))
      })
    }
    document.querySelector<HTMLElement>('#custom-controls')!.hidden=!custom
    document.body.dataset.customSite=String(custom)
    document.body.classList.toggle('custom-no-keyword',custom&&!definition.keyword)
    const toggle=document.querySelector<HTMLElement>('[data-select=site] .select-toggle')!
    if(custom)toggle.style.backgroundImage=`url("${definition.icon ? `moe-image://site-icon/${encodeURIComponent(site.value)}` : '/assets/custom-site.png'}"),linear-gradient(#f1f1f1,#fff)`
    else toggle.style.removeProperty('background-image')
    count.value=String(counts[site.value as SiteId])
    account.hidden=!definition.login;document.querySelector<HTMLElement>('#pixiv-controls')!.hidden=!pixiv;document.body.dataset.site=site.value
    document.querySelector<HTMLInputElement>('#keyword')!.value='';date.value='';document.querySelector<HTMLInputElement>('#start-page')!.value='1'
    mode.value='tag';refresh(mode);showMode();document.querySelector<HTMLInputElement>('#keyword')!.disabled=custom&&!definition.keyword
    document.body.classList.remove('pixiv-rank');apply(snapshot)
  }
  site.addEventListener('change',showSite);mode.onchange=showMode
  account.onclick=()=>{void window.moe.login(site.value as SiteId).then(()=>window.moe.network()).then(apply).catch(error=>report(String(error)))}
  account.oncontextmenu=event=>{event.preventDefault();void window.moe.logout(site.value as SiteId).then(()=>{report('已清除登录信息！');return window.moe.network()}).then(apply).catch(error=>report(String(error)))}
  const unsubscribe=window.moe.onNetwork(apply);window.addEventListener('unload',unsubscribe,{once:true})
  void window.moe.network().then(apply).catch(error=>report(String(error)))
  return ()=>site.value==='pixiv'?{site:'pixiv',pixivMode:mode.value as SearchInput['pixivMode'],pixivKind:(mode.value==='rank'?kind.value:subcategory.value) as SearchInput['pixivKind'],pixivPeriod:(mode.value==='rank'?subcategory.value:'daily') as SearchInput['pixivPeriod'],pixivDate:date.value}:{site:site.value as SiteId,...(sites[site.value].custom?{customCategory:Number(document.querySelector<HTMLSelectElement>('#custom-category')!.value)}:{})}
}
