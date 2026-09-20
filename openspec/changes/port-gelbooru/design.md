# 设计

- 对照 GelbooruSite.cs/BooruSite.cs：帖子 pid 从 0 开始，默认追加 rating:general；提示使用 autocomplete2 JSON。
- 复用 Booru XML 属性解析；列表提供缩略图、sample、jpeg 和原图，详情 URL 使用 index.php?page=post&s=view&id=ID。
- 详情页解析 artist/character/copyright 分类，继续支撑原下载命名 token；详情失败按参考行为禁止下载并显示重试。
- Gelbooru 资源允许 gelbooru.com 的子域 CDN，仍拒绝其他域；会话、代理、历史、数量、已读和登录 Cookie 独立。
- 登录检查 user_id Cookie，并复制同域 pass_hash 等 Cookie；不添加参考项目没有的 API key 设置。
- 仅运行 Gelbooru、共享 XML/命名/登录定向验证，不跑全量。实站只检查匿名边界、登录页和提示接口，不操作账号。
