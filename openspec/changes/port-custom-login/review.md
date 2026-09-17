# 自定义登录验收

## 已实现

Config.IsSupportAccount 控制原账号按钮，LoginUrl 缺省为 HomeUrl；CookieLoginAuthKey 用于忽略大小写匹配适用于主页的非空 Cookie。复用原登录窗口、工具栏和认证倒计时，远程视图没有 Node/应用 preload，导航限于配置主机。

Cookie 在随机候选 Session 中隔离，确认后只复制配置域内的 Cookie 到对应业务 Session。自定义站点与 Pixiv 共用事务提交、关闭取消和旧 Cookie 回滚；仍保留 Pixiv 专用服务端验证。

network.json 仅保存各站点验证标记，Cookie 保存在 Chromium 存储。重启恢复指示、右键注销、主页 Cookie 丢失/过期或业务 HTTP 401 后不显示已登录；不影响同域名的其他站点分区。自定义站点沿用匿名浏览能力，不把账号配置强制解释为所有页面必须登录。

## 定向验证

npm run build：类型检查与构建通过。

运行 custom-login、custom-menus、custom-sites、login、login-dev、session 共 12 项定向用例，12/12 通过，无跳过。覆盖账号入口/默认 URL、错误/子路径 Cookie 拒绝、取消登录不保留候选、远程无应用 API、窗口不能错配站点、Cookie 域过滤、同域名分区隔离、搜索和原图落盘、提交途中取消回滚、重启、401 和注销；并回归原 Pixiv 登录/开发 URL 及代理会话。

openspec validate port-custom-login --strict、git diff --check 通过。本批没有跑全功能测试，也没有操作真实账号。

## 边界与差异

通用自定义站点没有统一服务端验证接口，因此“认证成功”表示 Cookie 条件满足，不能据此断言账号在服务端有效。未配置 CookieLoginAuthKey 时至少要求一个非空主页 Cookie；源实现无 Key 时无条件通过，本批避免空候选会话显示成功。建议配置明确的登录 Cookie 名称。

HTTP 登录地址由用户的站点配置决定；第三方登录所需导航主机必须在配置中声明，验证码、SSO、通行密钥等实际站点流程未验收。服务端返回 200 登录页而非 401 时不能通用识别凭据失效。

Windows 与真实账号仍待用户操作，Pixiv 实账验收按之前约定留到 Windows。动态分类和本批登录改动均未提交。


## Review 修复（2026-09-17）

登录提交成功和注销后递增站点会话版本，请求在每次实际发送时记录版本；401 通过同一串行修改队列检查版本，仅清除对应会话标记。回归证明新 Cookie 提交后的旧 401 不会撤销新登录，同版本的有效 401 仍能清除登录指示。

本轮类型检查、构建及 custom-login/custom-menus/login/session 共 7 项定向测试全部通过，无跳过；git diff --check 通过。未跑全量，仍未提交。
