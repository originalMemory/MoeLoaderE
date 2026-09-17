# 来源与许可证

MoeLoaderE 的站点解析、搜索分页、已读记录、下载队列/命名、未完成任务包、Pixiv 字段/查询、登录与代理语义和交互逻辑由本地 MoeLoaderP 工作区转写，保留其 GPLv3 许可证，见 LICENSE。

- MoeLoaderP：桂叶君（xplusky / leaful），原项目 https://github.com/xplusky/MoeLoaderP 。
- 上游 MoeLoader：esonic；MoeLoader-Delta：YIU。源项目的来源说明保留于 https://github.com/esonic/moe-loader-v7 和 https://github.com/usaginya/MoeLoader-Delta 。
- `src/renderer/public/assets/banner.png`、`m-icon.ico`、`konachan-g.ico`、`pixiv.ico`、`safebooru.ico` 来自 MoeLoaderP 的 Assets。
- `fa-solid-900.ttf` 为原项目使用的 Font Awesome 字体；字体按 SIL OFL 1.1 授权，见 https://fontawesome.com/license/free 。字体版权信息保留在原文件内，官方 5.x 许可说明一并保存为 `src/renderer/public/assets/fontawesome-license.txt`。
- `fluent-noise.png` 从源项目使用的 FluentWPF 0.10.2 程序集提取，Windows 材质设置按其 `AcrylicHelper` 转写；MIT 许可保存在 `src/renderer/public/assets/fluentwpf-license.txt`。上游：https://github.com/sourcechord/FluentWPF 。
- Koffi 3.3.0（MIT）用于主进程调用 Windows 窗口合成接口；不向页面暴露原生调用能力。上游：https://koffi.dev/ 。

转写基线和文件摘要见 `openspec/changes/port-booru-browser/source-hashes.json` 、`openspec/changes/port-download-queue/source-hashes.json` 与 `openspec/changes/port-session-auth/source-hashes.json`。

- fast-xml-parser 5.11.1（MIT）用于 Safebooru 的 XML DAPI 响应解析，许可证随 npm 包保留。上游：https://github.com/NaturalIntelligence/fast-xml-parser 。
- Safebooru 参数、字段与图标迁移基线见 `openspec/changes/port-safebooru/source-hashes.json`。

- jsdom 30.0.1（MIT）用于自定义站点的静态 HTML/XPath 解析；不执行抓取页面脚本或加载子资源。上游：https://github.com/jsdom/jsdom 。
- custom-site.png 来自 MoeLoaderP Assets/SiteIcon/default.png；自定义配置和 XPath 语义转写自 CustomSite.cs、CustomSiteConfig.cs 和 Ex.GetValue，基线见 openspec/changes/port-custom-sites/source-hashes.json。
