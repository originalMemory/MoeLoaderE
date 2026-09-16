# 设计

- 对照 SafebooruSite.cs 和 BooruSite.cs，使用源 XML DAPI、pid 从 0 开始，复用现有真实页聚合。
- 使用 fast-xml-parser 处理 XML 属性及实体；主进程没有原生 DOMParser，避免自写 XML 解析器。限制响应大小、禁止 DTD，错误响应不能当空结果。
- 为 Safebooru 增加独立 Session、代理、历史、数量、已读记录及域名白名单；旧网络配置缺新站点时继承全局设置。
- 确认当前接口提供完整 URL，JSON 与 XML 的 rating 值不同；依源站点不做 rating 过滤；缩略图后缀归一到 jpg。缺失 jpeg/sample 时使用可用图片回退并记录差异。
- 真实网络与样本验证分开记录，不触碰 Pixiv 账号。
