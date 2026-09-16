# 阶段 4 验收记录

## 状态

- 阶段 3 与 Mac 毛玻璃优化已提交为 `1e059fb`。
- 阶段 4 代码已实现并完成样本/代理/匿名在线验证，review 的 3 项问题已修复；真实 Pixiv 账号的完整登录、搜索和下载尚未验收。用户于 2026-09-16 授权继续阶段 5，真实账号验收留到 Windows。
- 本阶段未提交或推送；未输入真实账号、密码，未操作验证码或注册流程。

## 已实现

- Konachan-G / Pixiv 独立 Chromium 持久 Session；搜索、提示、图片、预览、下载共用对应站点的 Cookie 与代理。图片地址必须属于条目本身的站点，不能借 Konachan 条目调用 Pixiv 登录会话。
- 全局不使用/自定义/系统代理，单站点优先级覆盖；沿用原设置浮层和搜索参数下拉框。地址校验，切换后释放旧连接，失败不偷偷直连；配置保存在 network.json，不含 Cookie/密码。
- Pixiv 隔离内存登录 Session 与 WebContentsView，远程网页没有应用 preload / Node；本地工具栏的 IPC 只接受自身主 frame。关闭时销毁远程内容并清理候选会话。
- PHPSESSID + 受保护接口认证；保存验证后最新 Cookie（含服务端轮换），提交期间关闭会回滚旧登录态。有效持久 Cookie 可重启恢复；右键账号按钮注销。
- 账号窗口按源 1280×900、44px 顶栏、6px 页面间距、136/292px 两按钮及原文案；认证成功倒计时 4 秒。Mac 使用独立居中窗口并暂时禁用父窗口，避免默认 sheet 改变尺寸/标题栏。已检查真实登录页及样本布局。
- Pixiv 静态最新/标签、作者、排行与日期，列表字段、作品标题、排名/提示和组图数量，详情、预览及静态组图下载。详情与缩略图按 8 个条目并发加载，详情失败保留重试入口。
- 两站点的已读、历史关键词和每页数量隔离；保留旧 Konachan-G 记录兼容。

## 与源行为的明确差异 / 后续范围

- 原版 VerifyCookie 只检查 device_token；这里要求有效会话 Cookie 和服务端验证，不能把匿名设备 Cookie 当作已登录。
- Cookie 使用 Chromium 站点存储而非原版配置 JSON；第三方身份提供方 Cookie 不复制到业务会话。没有自动导入浏览器或 MoeLoaderP 的账号信息。
- 不使用代理明确设置 direct；源 .NET 的 None 分支未显式关闭系统代理。本机需要系统代理时，必须在应用中明确选择，避免 UI 与实际路由矛盾。
- 额外支持地址字段里的 socks5://host:port；不新增 UI 控件，不接受带账号密码的代理 URL 或任意 PAC/规则文本。
- Pixiv 动图转换、镜像、书签/其他站点的完整迁移仍在后续阶段；动图保留标识并明确提示未迁移，不创建虚假成功下载。
- 第三方 SSO 和通行密钥未验收；实际登录页明确提示当前环境无法使用通行密钥。受限制的跳转不开放任意外部协议。
- 日期弹出控件采用当前平台控件；布局按源尺寸，未宣称 Mac 与 WPF 原生日历或系统标题栏逐像素一致。
- Windows 本阶段未实机运行。原生登录窗不调用仅适用于自绘标题栏的 overlay API。

## 验证

- `npm test`：最终类型检查、构建和 21 项测试通过，无跳过。覆盖原浏览/下载/材质，以及以下新路径。
- 真实本地 HTTP 服务验证 Chromium Session.fetch 发送 Cookie、自定义代理实际转发、单站点直连覆盖、两站 Cookie 隔离、非法代理不修改配置。
- 登录样本：远程 Node/应用 API 不可访问；伪造本地工具栏窗口被拒绝；未验证 Cookie 不进入业务会话；关闭丢弃候选会话；服务端 Cookie 轮换后保存新值；提交中关闭回滚旧 Cookie；重启恢复及注销清理。
- Pixiv 样本：标签/作者/排行、原图组图落盘、标题/排名/首登提示、预览、Cookie 与 Referer、站点数量恢复；不把该结果当作真实 Pixiv 账号验收。
- 开发 URL 使用带尾斜线的 HTTP 页面进行登录入口检查，避免 //login.html 导致工具栏无法授权。
- 一轮毛玻璃重启测试超时并遗留进程，停止该次测试后独立检查关闭/重启通过，后续整套通过；未稳定复现，不声称已定位或修复该偶发现象。

## 真实网络结果（本机）

- 匿名 Pixiv：直连请求超时；系统代理下登录页 HTTP 200，受保护接口未登录时 HTTP 401 / error=true。
- 实际 WebContentsView 已显示 `https://accounts.pixiv.net/login` 登录页面，标题“登录 | pixiv”；Node 与应用桥均 undefined。仅检查匿名页面，没有提交登录信息。
- Konachan-G：直连在线检查 HTTP 403；显式使用系统代理后，搜索 10 张、10 张缩略图、预览和原图下载通过，落盘 1,786,700 字节。
- 复现命令：`MOE_ONLINE_PROXY_MODE=system npm run test:online`（默认 none，不自动切换代理）。
- 本地证据：`artifacts/session-online-result.json`、`pixiv-login-page.png`、`login-toolbar.png`、`pixiv-fixture.png`、`online-result.json`。

## 仍需用户验收

- [ ] 在 Pixiv 真实网页登录，并点击原验证按钮保存。
- [ ] 使用真实账号搜索、预览和下载静态作品/组图，确认账号站点策略与权限。
- [ ] Windows 真机运行，以及第三方登录/通行密钥的另行验证。

API 依据：Electron [Session](https://www.electronjs.org/docs/latest/api/session) 与 [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)；同时按当前安装的 Electron 44.3.0 类型定义核对接口。


## 整体 review 修复（2026-09-16）

- 请求首次发送和重试统一校验代理错误、注销状态及取消信号；模拟代理应用/回滚双重失败、请求途中注销，均确认没有发出第二次请求。
- Pixiv 排行保留源版 160px「搜索参数」入口；桌面验证参数弹层、站点代理控件、过滤和起始页可操作，截图 `artifacts/pixiv-rank-parameters.png` 已检查。
- 作者作品按请求 ID 顺序读取响应，避免数字对象键自动升序；补充跨页降序与响应缺失作品的回归检查。
- 本轮 `npm test`：类型检查、构建和 21/21 测试通过，无跳过；真实账号验证仍待用户操作。
