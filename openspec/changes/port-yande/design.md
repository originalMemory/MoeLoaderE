# 设计

- 对照 YandeSite.cs/BooruSite.cs：post.xml 的 page/limit/tags，默认追加 rating:s；tag.xml 的 limit=15/order=count/name；详情 post/show/ID。
- 复用 Safebooru 的 XML 解析，抽为按站点标注错误的解析函数；Yande 保持评级过滤，不沿用 Safebooru 的无评级过滤例外。
- 独立会话、代理、历史、数量和已读；域名白名单来自实际 XML 响应中的 yande.re/files.yande.re/assets.yande.re。
- 原账号入口复用非 Pixiv 的 Cookie 验证流程，key=user_id；Pixiv 专用服务端验证保留。
- 验证范围仅 Yande、XML/Booru 解析及受影响的登录/站点链路，不跑全量。实站仅做公开搜索/预览/下载，真实登录另验。
