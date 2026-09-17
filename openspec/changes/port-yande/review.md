# Yande 验收

## 源对照与实现

按 YandeSite.cs/BooruSite.cs 转写 post.xml 的 page/limit/tags（追加 rating:s）、tag.xml 的 limit=15/order=count/name、post/show/ID 详情、原图/Jpeg图/预览图及 user_id Cookie 账号入口；图标来自源 yande.ico，基线见 source-hashes.json。

为 Yande 保留独立 Session、代理、历史、数量和已读，旧配置缺站点时继承全局代理。原 Safebooru XML 解析抽到 booru-xml.ts，Yande 保留评级过滤，Safebooru 无评级过滤的行为不变。图片白名单来自实站 XML 的 yande.re/files.yande.re/assets.yande.re。

账号入口复用通用 Cookie 验证（检查 user_id，不代表已完成服务端账号验证），Pixiv 仍走专用验证。Yande 搜索栏宽度补为 442px，容纳源 34px 账号按钮而不挤压 68px 获取按钮。

## 实站发现及修复

原图请求在 Chromium 默认 referrerPolicy 下携带跨源完整详情页 Referer，会在发出请求前返回 ERR_BLOCKED_BY_CLIENT。A/B 探测同一 URL：完整 Referer + unsafe-url 返回 200，默认 strict-origin-when-cross-origin 被拦截；首页 Referer 可返回 200，will-download 没有触发。

共享主进程请求明确使用 unsafe-url 策略，保留适配器已经指定的 Referer，不改变登录远程页面的策略。新增本地两个 HTTP 端口的回归，验证跨源缩略图和原图请求收到含路径/查询的 Referer，文件内容完整落盘；保留站点域名限制和 Cookie 分区。

## 验证证据

- 类型检查与生产构建通过。
- Yande 定向 2/2 通过：参数/字段/评级/CDN、提示、匿名搜索、预览、三种质量落盘、任务包、样本登录/注销、重启恢复及站点状态隔离。
- 新跨源 HTTP 用例与会话/代理用例各 1 项通过；共享 XML/Booru、Safebooru、自定义登录和 Pixiv 登录的相关回归也已运行通过。没有跑全功能测试。
- 最终公开实站命令：MOE_ONLINE_SITE=yande MOE_ONLINE_PROXY_MODE=system node tests/online.mjs，退出 0。风景排除标签查询取得 10 张、加载 10 张缩略图、预览及原图下载通过，文件 1,820,227 字节。临时下载目录已清理。
- 证据：artifacts/yande-online-result.json、yande-online.png、yande-online-preview.png、yande-download-online.png；样本布局 yande-fixture.png 已检查。
- openspec validate port-yande --strict、git diff --check 通过。

## 验证过程与剩余边界

首次实站查询 landscape no_humans 是合法空结果，改为已核对有结果的风景查询后暴露上述 Referer 问题，修复后成功。

桌面样本曾在首窗/预览窗口等待处超时；最终串行复验通过，未据此认定独立产品故障。新测试还误用了 waitForFunction 的异步条件，可能在文件写入前继续；已改为等待新任务对应的同步 DOM 成功状态，并显式断言任务状态，未改下载落盘实现。旧测试中存在同类异步等待写法，建议另行审查，本批未扩大修改范围。

缺少 jpeg/sample 时沿用现有 XML 适配的可用图片回退，不保证“Jpeg图”必为 JPEG。XML count/offset 的完整总量提示仍未接入统一 UI。Windows 视觉与真实 Yande 账号未验收；本批使用合成 Cookie，未输入真实凭据。

另核对发现源自定义站点的 DetailLv2ImageDetailUrl/DetailLv3ImageOriginUrl 仅声明字段，没有执行逻辑，本批只记录，不自行补造第三级详情。


## Review 修复（2026-09-17）

内置站点与旧自定义站点短名冲突时，旧自定义历史使用独立集合保存，避免被内置站点同名历史覆盖。普通保存及重启保留两份历史；历史容量和显式清除操作分别作用于两份数据，持久化失败时两份都回滚，已读数据保持。

本轮类型检查、构建与 history-collision/search-settings 共 4 项定向测试全部通过；git diff --check 通过。未跑全量，未提交。
