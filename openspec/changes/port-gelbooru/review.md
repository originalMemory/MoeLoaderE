# Gelbooru 验收

## 源对照与实现

按 GelbooruSite.cs/BooruSite.cs 转写：帖子 DAPI 的 pid=页码-1、limit、tags 追加 rating:general；autocomplete2 的 term/type/limit；详情 index.php?page=post&s=view&id=ID；原图/Jpeg图/预览图和 user_id Cookie 登录。源代码和图标摘要见 source-hashes.json。

XML2 的 `<preview-url>` 等连字符元素在共享解析层规范化成下划线字段；Safebooru 属性 XML 的字段保持不变。Gelbooru 的 general 为安全评级，questionable/explicit 继续过滤。

详情页解析 artist/character/copyright，下载命名的 `%artist`、`%character`、`%copyright` 使用真实详情值；详情解析失败时与参考行为一致，下载按钮保持禁用并允许重试。

站点使用独立 Session、代理、历史、数量、已读和 Cookie。资源白名单允许 gelbooru.com 及其子域 CDN，不接受相似后缀域名；登录候选会话提交 user_id、pass_hash 等 Gelbooru 域 Cookie，不影响其他站点。

## 验证

- `npm run build`：类型检查和生产构建通过。
- Gelbooru 定向 2/2：查询编码、XML2 字段、评级、CDN 白名单、详情分类与命名；桌面提示、十张可见图片、详情、三种质量实际落盘、Cookie 登录/重启/注销、站点状态隔离。
- 共享 XML 与下载命名定向 9/9 通过，覆盖 Safebooru 桌面链路及最新下载队列行为。自定义 Cookie 登录 2/2 在本批首次定向运行中通过。
- artifacts/gelbooru-fixture.png 已检查原账号入口、站点选择、结果布局、三种完成任务和搜索栏宽度。
- 匿名实站：登录页 HTTP 200，autocomplete2 HTTP 200 并返回标签建议，帖子 DAPI HTTP 401。未将 401 当作空结果。
- `openspec validate port-gelbooru --strict` 与 `git diff --check` 通过。按用户偏好未跑全量测试。

## 当前边界

Gelbooru 官方文档说明 API 会阶段性要求认证，可使用 api_key + user_id；参考项目只实现网页登录 Cookie，因此本批没有自创 API key 设置。真实账号登录后的 DAPI、验证码/风控及 Windows 真机留待用户验收。

缺失 jpeg/sample 时沿用已有 XML 站点回退到可用图片，不能保证“Jpeg图”最终格式。

## Review 修复（2026-09-20）

- 下载队列在原图片白名单基础上接受 `video/mp4` 和 `video/webm`，Gelbooru 视频原图可流式落盘；HTML 等非媒体响应仍被拒绝。
- 卡片文件类型及原图大小随当前下载质量即时更新，原图/自动显示原图扩展名与大小，Jpeg图/预览图显示实际所选 URL 扩展名；地址收集复用相同质量选择函数。
- 新增视频成功/非媒体拒绝及三种质量 UI 扩展名断言；只运行下载与 Gelbooru 定向验证，不跑全量。

接口依据：[Gelbooru API 文档](https://gelbooru.com/index.php?id=18780&page=wiki&s=view)。
