# 自定义站点

软件设置 → 打开自定义站点文件夹。每个站点一个 JSON，存到应用数据目录的 `CustomSites` 下，修改后重启加载。文件夹按钮沿用原项目；本批不增加配置编辑器或热加载按钮。

[配置示例](examples/custom-site.json) 使用占位域名，不能直接搜索；请替换域名、列表/搜索 API 和 XPath，使其匹配目标站点 HTML。示例对应列表中的 `<article><img src="缩略图"><a href="详情">标题</a></article>` 和详情中的 `<img class="original" src="原图">`。

## 支持内容

- 沿用原字段：`ShortName`、`DisplayName`、`HomeUrl`、`SiteIconUrl`、`SearchApi`、`Categories`、`PagePara`。
- `Categories` 支持 `Name`、`FirstPageApi`、`FollowUpPageApi`、`OverrideSearchApi`、`OverridePagePara`（整份规则替代，并非部分合并）。所有分类都有完整覆盖规则时，顶层 `PagePara` 可省略或留空；存在继承分类时，顶层规则仍须完整。
- API 支持 `{keyword}`（一次 URL 编码）、`{pagenum}`、`{pagenum-1}`；相对地址基于主页。
- XPath 支持 `Node` / `Attribute` / `InnerText`，单值 `PathR2` 回退，以及 `Pre`、`After`、`RegexPattern`、`Replace` / `ReplaceTo`、`GetFileName`、`GetNumFromMatches`（支持负索引）。`IsMultiValues` 本批用于 Node 集合；多值文本配置明确报错。
- 主列表规则与原 `CustomPagePara` 同名；支持标题、日期、图组数量、缩略图和详情地址。
- 图组详情支持直接原图，以及 `DetailImageItemDetailUrlFromDetailImagesList` → `DetailLv2ImageOriginUrl` / `DetailLv2ImagePreviewUrl` 的第二级详情。
- 详情翻页使用 `DetailCurrentPageIndex`、`DetailNextPageIndex`、`DetailNextPageUrl`；只在下一页号为当前页号 + 1 时继续。`Pre: "currentDir"` 按源语义从当前页面所在目录组合下一页地址。
- `Referer` 配置随资源请求发送。域名来自主页、配置的绝对 URL/Pre/Referer。无法从配置推断的 CDN 主机需在可选 `AllowedHosts` 数组声明，例如 `images.example.com`；可包含端口，不包含协议或路径。
- 每站点独立代理、Cookie 分区、关键词历史、数量和已读状态。不会因为与内置站点共用域名而共用 Cookie。

## 动态分类

[动态配置示例](examples/custom-dynamic-site.json) 对应菜单页 `<nav><a href="/gallery">画廊</a></nav>`，同样需要替换占位域名和 XPath。

- 非空 `CustomLv2MenuItems` 会替代静态 `Categories`。每个菜单源包含 `Menus`（Node 模式）、`MenuTitleFromMenus`、`MenuUrlFromMenus`，复用前述 XPath 取值变换。
- `PageUrl` 默认主页；菜单链接后直接拼接 `FirstApi` / `FollowApi`。后续页还可使用 `FollowApiReplaceFrom` / `FollowApiReplaceTo` 作字符串替换；`{pagenum}` 和 `{pagenum-1}` 留到搜索时替换。
- 支持每个菜单源的完整 `OverridePagePara`；没有覆盖规则时继承顶层 `PagePara`。
- 首次选择或搜索该站点时加载分类，跳过主页链接和标题“首页”。成功后本次运行复用；加载失败可点击“获取”或切到别的站点再切回重试，成功后分类控件同步恢复。
- 最多 16 个菜单源、总计 100 分类，加载时限 40 秒。所有请求沿用本站会话和主机限制；任何菜单源失败均不提交半份分类。

## 网页登录

[登录配置示例](examples/custom-login-site.json) 使用占位域名，需要替换实际站点地址和 Cookie 名称。

- 设置 `Config.IsSupportAccount: true` 显示原账号入口；`LoginUrl` 缺省使用主页。
- 在隔离的站点登录页手动操作，再点击工具栏认证按钮；应用不会读取或保存账号密码。
- `CookieLoginAuthKey` 是 Cookie 的名称，不是值。检查忽略名称大小写，且要求 Cookie 对主页有效；没有 Key 时至少需一个非空主页 Cookie。
- 通用认证只确认 Cookie 条件满足，不等同于服务端账号验证；Pixiv 仍使用专用接口认证。
- 验证后 Cookie 只进入该站点的业务 Session；未验证关闭丢弃候选，提交中关闭恢复旧凭据。重启恢复指示，账号按钮右键清除本站登录。
- 第三方登录跳转需要其主机在配置中声明。实际站点验证码/SSO/通行密钥兼容性需实测。

## 本批边界

- 第三级详情以及 NSFW 模式尚未迁移，包含这些能力的配置会显示文件级错误。
- 解析静态 HTML，不执行页面脚本，不支持需要 JavaScript 渲染后才出现的列表。
- RegexPattern 使用 JavaScript 正则；与 .NET 不兼容的语法会报错。
- 最多 64 个配置文件、每个 1 MiB；HTML 2 MiB、每页 5000 节点；图组详情最多 100 页/5000 张，并检测分页循环。
- 图组会先解析完整详情，再进入下载队列；“只下载前 N 张”限制下载文件数量，不会减少详情解析请求。这与源按需展开图组的调度不同。
- 自定义图片原 ID 保持 0，建议使用 `%title` / `%origin` 命名；已读另外使用详情 URL 的稳定标识，保留最近 10000 项，不受所有条目 ID 相同影响。
- 移走或暂时损坏配置不会主动删除其已保存的历史、每页数量与代理；重新放回配置并重启后恢复。

开发环境需要 Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`（HTML 解析库要求）。当前 Electron 内置 Node.js 24.20.0 满足要求。
