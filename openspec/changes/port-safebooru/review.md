# Safebooru 迁移验收

## 源与范围

参考 MoeLoaderP 的 SafebooruSite.cs、BooruSite.cs 和 safebooru.ico；摘要见 source-hashes.json。本批实现单个新站点的搜索、提示、预览、下载质量、任务包以及独立会话/代理/历史/已读/数量，不扩展登录或自定义站点。

## 实现与差异

- 沿用 XML DAPI，pid=页码-1，关键词只编码一次；提示 order=name、limit=8；详情 index.php?page=post&s=view&id=ID。
- 沿用源 Safebooru 对评级的处理：该站点不依评级过滤；当前站点 XML/JSON 对同一作品返回的评级表示不同，不用 Konachan 规则过滤。
- 采用 fast-xml-parser 5.11.1（MIT），避免主进程自写 XML 解析器；8 MiB 响应上限、拒绝 DTD/实体声明、错误页和非法 XML 不视为空列表。
- 缩略图 png/jpeg 后缀归一到 jpg，沿用原站点图标和下载类型。当前接口可能没有 jpeg_url，Jpeg图回退到 sample_url，再回退 file_url；预览缺 sample 时回退原图。回退行为是兼容性补齐，不能据此保证 JPEG 文件格式。
- 下载命名及任务包保存 safebooru；资源和 Referer 受站点域名约束。旧配置缺 Safebooru 时默认继承全局代理，不覆盖原站点设置。

## 验证

- npm test：类型检查、构建和 26/26 测试通过，无跳过。
- 样本验证 XML 属性/实体/空结果/错误响应、查询页码/编码、旧配置、新站点历史及已读重启恢复、不污染 Konachan 数量、JPEG URL 与 Referer、预览和任务包。
- 真实网络：MOE_ONLINE_SITE=safebooru MOE_ONLINE_PROXY_MODE=none node tests/online.mjs，退出 0；landscape 搜索 10 张、缩略图 10 张、预览及原图下载通过，文件 1,351,476 字节。临时下载目录在结束后清理。
- artifacts/safebooru-online-result.json 保存在线结果；artifacts/safebooru-fixture.png 已检查原界面布局；在线界面见 browser-online.png、browser-online-preview.png 和 download-online.png。
- openspec validate port-safebooru --strict、git diff --check 通过。

## 后续

本批 review 未发现必须修复的问题，定向 6/6 回归通过；用户已授权提交推送并继续。Windows 运行与 Pixiv 真实登录验收仍待 Windows；其他站点、自定义站点和剩余外观设置继续分批迁移。

接口依据：[Safebooru DAPI](https://safebooru.org/index.php?page=help&topic=dapi)。XML 库依据：[fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)。
