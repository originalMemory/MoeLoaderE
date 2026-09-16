import type { NetworkSnapshot, SearchInput, SiteId } from '../../shared/types'
import { networkDefaults } from '../../shared/network'

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
    const next={...snapshot.settings,globalMode:globalProxy.value as NetworkSnapshot['settings']['globalMode'],proxyAddress:address.value,siteModes:{...snapshot.settings.siteModes,[site.value]:proxy.value}}
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
  const showSite = (): void => {
    const pixiv=site.value==='pixiv'
    count.value=String(counts[site.value as SiteId])
    account.hidden=!pixiv;document.querySelector<HTMLElement>('#pixiv-controls')!.hidden=!pixiv;document.body.dataset.site=site.value
    document.querySelector<HTMLInputElement>('#keyword')!.value='';date.value='';document.querySelector<HTMLInputElement>('#start-page')!.value='1'
    mode.value='tag';refresh(mode);showMode();document.querySelector<HTMLInputElement>('#keyword')!.disabled=false
    document.body.classList.remove('pixiv-rank');apply(snapshot)
  }
  site.addEventListener('change',showSite);mode.onchange=showMode
  account.onclick=()=>{void window.moe.login(site.value as SiteId).then(()=>window.moe.network()).then(apply).catch(error=>report(String(error)))}
  account.oncontextmenu=event=>{event.preventDefault();void window.moe.logout(site.value as SiteId).then(()=>{report('已清除登录信息！');return window.moe.network()}).then(apply).catch(error=>report(String(error)))}
  const unsubscribe=window.moe.onNetwork(apply);window.addEventListener('unload',unsubscribe,{once:true})
  void window.moe.network().then(apply).catch(error=>report(String(error)))
  return ()=>site.value==='pixiv'?{site:'pixiv',pixivMode:mode.value as SearchInput['pixivMode'],pixivKind:(mode.value==='rank'?kind.value:subcategory.value) as SearchInput['pixivKind'],pixivPeriod:(mode.value==='rank'?subcategory.value:'daily') as SearchInput['pixivPeriod'],pixivDate:date.value}:{site:site.value as SiteId}
}
