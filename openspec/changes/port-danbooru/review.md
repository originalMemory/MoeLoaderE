# Danbooru 验收

## 源对照与适配

按 DanbooruSite.cs/BooruSite.cs 转写 posts.json、autocomplete HTML、posts/ID 详情、原图/预览图和 `_danbooru2_session` 登录。源文件和 danbooru.ico 摘要见 source-hashes.json。

参考项目使用 `rating:safe` 并把响应 `s` 当安全；当前 Danbooru 评级已经是 g/s/q/e，`rating:safe` 实测返回 Sensitive。为保持源“安全模式”产品语义，本批改用 `rating:general`，并只接受 `rating === g`。

当前 JSON 仍提供 preview_file_url、large_file_url、file_url、image_width/height、uploader_id 和 tag_string_*。分类标签直接进入 artist/character/copyright 命名 token，无额外详情请求。资源限制在 donmai.us 官方子域。

参考 NetOperator 对 Danbooru 专门发送 `User-Agent: gdl/1.24.5`；初次实站系统代理请求缺少该 UA 返回 403。迁移该站点级 UA 后，样本断言请求头，实站恢复 200。其他站点请求头不变。

## 验证

- `npm run build`：类型检查和生产构建通过。
- Danbooru 定向 2/2：查询/评级/JSON字段、当前多 class 提示 HTML、CDN 白名单、分类命名；桌面提示、十张可见结果、原图/预览图落盘、Cookie 登录/重启/注销及独立状态。
- 同批 JSON Booru 与下载队列相关验证合计 12/12 通过，无跳过；未跑全量。
- 公开实站：`MOE_ONLINE_SITE=danbooru MOE_ONLINE_PROXY_MODE=system node tests/online.mjs` 退出 0；`landscape no_humans` 搜索 10 张、加载 10 张缩略图、预览及原图下载通过，文件 1,265,697 字节。临时目录已清理。
- artifacts/danbooru-fixture.png、danbooru-online.png、danbooru-online-preview.png、danbooru-download-online.png 已生成；样本 UI 已检查账号入口、卡片扩展名、搜索栏宽度和完成任务。
- `openspec validate port-danbooru --strict` 与 `git diff --check` 通过。

## 当前边界

真实 Danbooru 账号、登录风控和 Windows 真机未验收；本批登录使用合成 Cookie。参考项目声明“最热”排序但查询代码未使用该参数，当前排序控件仍留在后续统一搜索设置范围，没有为单站点补一个无效选项。

当前 API 字段依据：[Danbooru Posts API](https://safebooru.donmai.us/wiki_pages/api%3Aposts)。
