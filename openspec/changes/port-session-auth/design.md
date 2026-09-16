# 约束

- 每站点使用 Chromium 独立持久 Session；搜索、提示、图片、预览和下载全部经对应 Session.fetch，统一 Cookie/Referer/代理。Cookie 只在主进程与 Chromium 存储中处理，不写入配置 JSON、渲染 IPC、日志或截图。
- 登录用独立内存 Session + WebContentsView；远程网页没有应用 preload、Node 和应用 IPC，保留 sandbox/contextIsolation/webSecurity，拒绝文件导航、系统权限和网页直接下载。
- 原版 1280×900 登录窗口、44px 顶栏、6px 页面间距、左右按钮及验证提示文案；认证按钮由本地工具栏发送有限 IPC，远程视图不能冒充工具栏。
- 用户关闭登录窗口即取消，未验证 Cookie 不进入业务会话。提交 Cookie 和代理更新排队执行；更新失败回滚，避免后续业务请求使用半完成配置。
- 代理模式沿用不使用/自定义/系统，单站点可继承全局。自定义地址接受 ip/host:port（HTTP），额外兼容明确 socks5://，不支持凭据、PAC/任意规则串。切换后关闭旧连接，正在进行的请求可能按原重试机制重连；不得回落直连来掩盖代理错误。
- 登录不是“存在 device_token 就成功”：需 PHPSESSID 且 Pixiv 受保护端点验证通过。网络错误与验证失败不冒充登录成功。真实站点账号/API可用性单列验收，不以模拟成功代替。
- Pixiv 图片域名仅 i.pximg.net/s.pximg.net，业务/登录域名按明确允许列表；不同站点间不跟随重定向。动图不伪装为静态原图下载。
- 不进入阶段 5 的其他站点、完整设置和 GIF 转换。本阶段也不自动注册账号、提交表单或解决验证码。
