# MoeLoaderE

将 MoeLoaderP 等价转写为 Electron + TypeScript 的多站点图片浏览与下载桌面应用。

- 技术路线：Electron + TypeScript。
- 初始目标：Windows、macOS 桌面端；Linux 暂不考虑，移动端和浏览器版未纳入。
- 当前状态：第二阶段 Konachan-G 浏览闭环与 Windows 视觉补齐已完成，整体 review 问题已修复；下载与登录尚未迁移。
- 迁移原则：逻辑、UI 布局、样式、文案与交互保持源项目一致，差异逐项记录，不默默改变行为。

## 本地开发

需要 Node.js 22.12+ 和 npm。本阶段验证环境为 Windows、Node.js 22.16.0、npm 10.9.2；macOS 尚未实测。

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
| `npm run test:online` | 独立的真实站点检查：搜索 10 张图片，验证缩略图与预览；需要网络 |

默认测试使用本地响应，覆盖搜索/过滤/分页/已读、选择/预览/取消、IPC 边界与启动回归；在线检查单独运行。截图写入忽略目录 `artifacts/`。macOS 分支需在 macOS 上运行才能验收。

## 工程结构

- `src/main/`：窗口、站点网络、资源协议、状态保存与 IPC 验证。
- `src/preload/`：有限的浏览 API，不向页面暴露 Node 或通用 IPC。
- `src/shared/`：类型与源业务逻辑转写。
- `src/renderer/`：原版布局的 HTML/CSS/TypeScript 实现与独立预览。
- `tests/`：逻辑和桌面检查，使用临时浏览器配置目录。

Windows 材质通过 Koffi 在主进程调用窗口合成接口，使用原版 FluentWPF 噪点及配色；macOS 使用系统 vibrancy。已验证 Windows 10，macOS 与 Windows 11 尚未实测。打包阶段需保留 Koffi 的平台原生模块。

构建采用 electron-vite 5 + Vite 7，依赖固定版本。不使用额外 UI 框架或 C# 应用子进程。浏览设置保存在 Electron userData 下的 `browser.json`，不会改写原项目设置。

## 开发入口

- [路线图与进度](docs/roadmap.md)
- [第一阶段：应用工程初始化](specs/speclite/electron-bootstrap/spec.md)
- [第二阶段：单站点浏览转写提案](openspec/changes/port-booru-browser/proposal.md)
- [第二阶段实施任务](openspec/changes/port-booru-browser/tasks.md)
- [第二阶段 review 与差异](openspec/changes/port-booru-browser/review.md)

每阶段完成后停下来 review，经确认再进入下一阶段。

源项目位于 `D:\code\MyGit\MoeLoaderP`。对照当前工作区（包含未提交修改）转写行为与界面，不引入 C# 子进程；具体基线与验收规则见路线图。

项目按源项目 GPLv3 许可转写；见 [LICENSE](LICENSE) 和 [来源说明](THIRD_PARTY_NOTICES.md)。
