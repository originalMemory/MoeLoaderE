# 设计

- 对照 DanbooruSite.cs/BooruSite.cs：posts.json 的 page/limit/tags及站点专用 `User-Agent: gdl/1.24.5`；当前站点评级已变为 g/s/q/e，为保持“安全模式”语义使用 rating:general，而非旧版 rating:safe。
- 直接解析当前 JSON 的 image_width/image_height、tag_string、分类 tag_string_*、preview/large/file URL 和 uploader_id；无额外详情请求。
- autocomplete HTML 使用现有 jsdom 静态解析，兼容当前 wrapper 多 class，并沿用箭头别名与空格转下划线规则。
- 独立 Session、代理、历史、数量、已读及 `_danbooru2_session` Cookie；允许 donmai.us 官方 CDN 子域。
- 只运行 Danbooru、JSON/Booru、下载媒体和 Cookie 登录相关定向验证，不跑全量；公开实站验证不登录账号。
