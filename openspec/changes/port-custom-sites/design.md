# 设计

- 启动读取 userData/CustomSites 下的 JSON 常规文件，1 MiB/文件、最多 64 个；坏配置隔离并展示读取错误，内置站点优先且短名不可覆盖。更改配置后重启生效，沿用参考行为。
- jsdom 提供 HTML 容错解析和 XPath；不执行脚本、不加载子资源，只通过站点 Session 请求页面/图片。兼容原 Path/PathR2/Mode/Attribute/Pre/After/RegexPattern/Replace/ReplaceTo/GetFileName/GetNumFromMatches。
- 请求明确携带站点 ID，不能根据共享域名误用另一个站点 Cookie。自定义域名只允许 HomeUrl、配置中绝对 URL 和可选 AllowedHosts 中的主机；跨域 CDN 如无法从配置推断，需声明 AllowedHosts。不允许 file/data/javascript URL。
- 页面占用与翻页有界：2 MiB HTML、每页最多 5000 个节点，详情最多 100 页/5000 张，循环下一页报错。静态原图解析后复用下载队列。
- 原自定义图片 ID 默认为 0，本批保留显示/命名语义；已读用详情 URL 的稳定摘要作为内部标识，避免全部图片共享 ID 0。
- 主进程只把目录摘要和分类名称送到 renderer；每站点保存独立代理、历史、数量和已读。继续兼容现有内置站点配置。
