import type { LoginStatus } from '../../shared/types'
declare global { interface Window { login: { init(): Promise<LoginStatus>; navigate(): Promise<void>; verify(): Promise<void>; onStatus(callback: (value: LoginStatus) => void): () => void } } }
const status = document.querySelector<HTMLElement>('#login-status')!
const verify = document.querySelector<HTMLButtonElement>('#login-verify')!
const navigate = document.querySelector<HTMLButtonElement>('#login-navigate')!
let currentSite = ''
const apply = (value: LoginStatus): void => {
  currentSite = value.site
  status.hidden = value.state === 'idle'; status.dataset.state = value.state; status.textContent = value.text
  verify.disabled = navigate.disabled = value.state === 'verifying' || value.state === 'success'
}
const fail = (): void => apply({ site:currentSite,state:'failed',text:'登录操作失败，请重新打开登录窗口' })
const unsubscribe = window.login.onStatus(apply)
window.addEventListener('unload',unsubscribe,{once:true})
void window.login.init().then(apply).catch(fail)
navigate.onclick=()=>{void window.login.navigate().catch(fail)}
verify.onclick=()=>{void window.login.verify().catch(fail)}
