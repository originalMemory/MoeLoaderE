import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

test('开发 URL 带尾斜线时登录工具栏仍加载且授权正确', {timeout:30000},async t=>{
 const root=resolve('out/renderer'),profile=await mkdtemp(join(tmpdir(),'moe-login-dev-'));let app
 const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname
  const path=resolve(root,`.${pathname==='/'?'/index.html':pathname}`)
  if(pathname.startsWith('//')||!path.startsWith(root+sep)){res.statusCode=404;res.end();return}
  try{const body=await readFile(path);res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.ttf':'font/ttf'})[extname(path)]||'application/octet-stream');res.end(body)}catch{res.statusCode=404;res.end()}
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 t.after(async()=>{if(app)await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100})})
 const env={...process.env,ELECTRON_RENDERER_URL:`http://127.0.0.1:${server.address().port}/`};delete env.ELECTRON_RUN_AS_NODE
 app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env});const page=await app.firstWindow();await page.waitForLoadState('load')
 await app.evaluate(({app})=>app.on('session-created',ses=>ses.protocol.handle('https',()=>new Response('<html><body>Login fixture</body></html>',{headers:{'content-type':'text/html'}}))))
 await page.evaluate(()=>window.moe.login('pixiv'))
 const toolbar=app.context().pages().find(p=>p.url()===env.ELECTRON_RENDERER_URL+'login.html')
 assert.ok(toolbar)
 assert.equal((await toolbar.evaluate(()=>window.login.init())).state,'idle')
 assert.equal(await toolbar.locator('#login-navigate').textContent(),'转到登陆页面')
 assert.equal(await toolbar.evaluate(()=>typeof window.moe),'undefined')
})
