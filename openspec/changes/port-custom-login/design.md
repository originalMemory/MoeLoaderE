# 设计

- 登录能力由 Config.IsSupportAccount 控制，LoginUrl 缺省使用主页；登录跳转限于配置允许的 HTTP(S) 主机。远程页面无应用 preload、Node 或权限。
- 按源 CookieLoginAuthKey 检查适用于 HomeUrl 的非空 Cookie（名称忽略大小写）；未指定 Key 时至少要求一个非空主页 Cookie，避免空会话显示成功。此检查不等价于通用服务端账号验证，Pixiv 仍保留专用接口验证。
- 候选会话隔离，验证后只向对应站点业务 Session 提交配置域内 Cookie；提交共享原回滚/取消逻辑。保存各站点验证标记但不把 Cookie 写入 JSON。
- 自定义站点仍允许匿名浏览（沿用源行为），Cookie 过期/清理及 HTTP 401 清除登录指示；注销只清该站点。
- 只跑自定义登录、原 Pixiv 登录/开发登录、会话与自定义配置定向验证，不跑全功能测试。
