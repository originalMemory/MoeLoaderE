# MoeLoaderE

将 MoeLoaderP 等价转写为 Electron + TypeScript 的多站点图片浏览与下载桌面应用。

- 技术路线：Electron + TypeScript。
- 初始目标：Windows、macOS 桌面端；Linux 暂不考虑，移动端和浏览器版未纳入。
- 当前状态：阶段 4 已提交推送，Pixiv 真实账号验收留到 Windows。阶段 5 已接通搜索设置、历史、背景/低性能、自定义站点、Safebooru、Yande、Gelbooru 和 Danbooru；Danbooru 已通过公开实站搜索/预览/下载。其余站点继续分批迁移。
- 迁移原则：逻辑、UI 布局、样式、文案与交互保持源项目一致，差异逐项记录，不默默改变行为。

## 本地开发

需要 Node.js `^22.22.2 || ^24.15.0 || >=26.0.0` 和 npm（自定义站点 HTML 解析库要求）。本批在 macOS 26.3.1 Apple Silicon（Node.js 26.0.0、npm 11.12.1）验证；Windows 早期验证使用的 Node.js 22.16.0 需升级后复验。

```sh
npm ci
npm run dev
```

Electron 首次启动会下载运行时。若本机通过 `HTTP_PROXY` / `HTTPS_PROXY` 访问网络，首次启动或安装前需设置 `ELECTRON_GET_USE_PROXY=1`。PowerShell 7 示例：

```powershell
$env:ELECTRON_GET_USE_PROXY = '1'
npx --no install-electron
```

代理设置只用于本机开发环境，不写入仓库。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器与桌面窗口；渲染页面支持热更新，主进程修改后需重启命令 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 类型检查并生成 `out/` 生产文件，不生成安装包 |
| `npm start` | 启动已构建的本地应用；先执行 `npm run build` |
| `npm test` | 构建并运行真实 Electron 窗口检查，需要桌面会话；无需额外安装 Playwright 浏览器 |
| `npm run test:online` | 独立的真实站点检查：搜索 10 张图片，验证缩略图、预览与单张真实下载；需要网络 |

默认测试使用本地响应，覆盖浏览、下载实际文件/同名竞争/取消重试/组图、任务包、IPC 边界与启动回归；在线检查单独运行，下载文件使用独立临时目录并在测试后清理。截图写入忽略目录 `artifacts/`。macOS 启动生命周期、浏览、下载、代理与登录隔离已验证；真实 Pixiv 账号和安装包尚未验收。

## 工程结构

- `src/main/`：窗口、站点隔离会话、登录、代理、下载、资源协议、状态保存与 IPC 验证。
- `src/preload/`：有限的浏览 API，不向页面暴露 Node 或通用 IPC。
- `src/shared/`：类型与源业务逻辑转写。
- `src/renderer/`：原版布局的 HTML/CSS/TypeScript 实现与独立预览。
- `tests/`：逻辑和桌面检查，使用临时浏览器配置目录。

Windows 材质通过 Koffi 在主进程调用窗口合成接口，使用原版 FluentWPF 噪点及配色；macOS 使用系统 vibrancy，并减轻页面重复染色。顶部“软件设置”的毛玻璃开关已接通并记忆，主窗口与预览同步；失焦或系统开启“降低透明度”时使用不透明回退色。已验证 Windows 10 及 macOS 窗口运行与外观；Windows 11 尚未实测。打包阶段需保留 Koffi 的平台原生模块。

构建采用 electron-vite 5 + Vite 7，依赖固定版本。不使用额外 UI 框架或 C# 应用子进程。浏览设置保存在 Electron userData 下的 `browser.json`，下载设置保存在 `downloads.json`，不会改写原项目设置。默认下载目录为系统图片目录下的 `MoeLoaderE`；顶部“软件设置”中的下载设置可调整目录、命名及并发，修改即时生效。将 `.mlpub` 拖入下载面板导入任务，在任务右键菜单导出未成功任务。

## 开发入口

- [路线图与进度](docs/roadmap.md)
- [第一阶段：应用工程初始化](specs/speclite/electron-bootstrap/spec.md)
- [第二阶段：单站点浏览转写提案](openspec/changes/port-booru-browser/proposal.md)
- [第二阶段实施任务](openspec/changes/port-booru-browser/tasks.md)
- [第二阶段 review 与差异](openspec/changes/port-booru-browser/review.md)
- [第三阶段下载主体与验证](openspec/changes/port-download-queue/review.md)
- [第四阶段登录、会话与代理验收](openspec/changes/port-session-auth/review.md)
- [第五阶段第一批：搜索设置与历史](openspec/changes/port-search-settings/review.md)
- [第五阶段第二批：Safebooru](openspec/changes/port-safebooru/review.md)
- [第五阶段第三批：背景图与低性能模式](openspec/changes/port-display-settings/review.md)
- [自定义站点使用指南](docs/custom-sites.md)
- [第五阶段第四批：自定义站点](openspec/changes/port-custom-sites/review.md)
- [自定义站点动态分类验收](openspec/changes/port-custom-menus/review.md)
- [自定义站点网页登录验收](openspec/changes/port-custom-login/review.md)
- [Yande 接入与跨域 Referer 验收](openspec/changes/port-yande/review.md)
- [Gelbooru 接入与认证边界](openspec/changes/port-gelbooru/review.md)
- [Danbooru 接入与当前评级适配](openspec/changes/port-danbooru/review.md)

## 登录与代理

- 代理仍在原“软件设置”和搜索参数中配置；单站点设置覆盖全局，默认继承。需要本机系统代理时，在“全局代理设置”选择“系统代理”。
- 自定义地址为 `host:port`（HTTP），也支持显式 `socks5://host:port`；不支持在地址内保存账号密码。
- 选择 Pixiv 后点击原账号按钮打开网页登录；完成后点击右侧验证按钮。右键账号按钮清除该站点登录信息。
- 登录 Cookie 由 Chromium 站点会话持久化，不写入 browser.json/network.json；远程登录页不暴露应用 API。
- Pixiv 当前支持静态最新/标签、作者、排行及组图。动图转换、镜像、其他身份提供方/通行密钥尚未完成验收。
- 本机直连访问失败，系统代理下 Konachan-G 与 Pixiv 匿名登录页可访问。在线回归可用 `MOE_ONLINE_PROXY_MODE=system npm run test:online`；默认 none，不会暗中回落或切换代理。

每阶段完成后停下来 review，经确认再进入下一阶段。

源项目位于 `D:\code\MyGit\MoeLoaderP`。对照当前工作区（包含未提交修改）转写行为与界面，不引入 C# 子进程；具体基线与验收规则见路线图。

项目按源项目 GPLv3 许可转写；见 [LICENSE](LICENSE) 和 [来源说明](THIRD_PARTY_NOTICES.md)。
