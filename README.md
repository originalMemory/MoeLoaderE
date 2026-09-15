# MoeLoaderE

将 MoeLoaderP 等价转写为 Electron + TypeScript 的多站点图片浏览与下载桌面应用。

- 技术路线：Electron + TypeScript。
- 初始目标：Windows、macOS 桌面端；Linux 暂不考虑，移动端和浏览器版未纳入。
- 当前状态：第一阶段应用基础已完成，review 问题已修复并验证；站点与下载功能尚未实现。
- 迁移原则：逻辑、UI 布局、样式、文案与交互保持源项目一致；当前启动验证占位页不是正式 UI 方案。

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

测试检查本地页面、Node 隔离、沙箱、CSP、导航/弹窗限制、窗口生命周期及启动失败退出码，截图写入忽略目录 `artifacts/`。macOS 分支需在 macOS 上运行才能验收。

## 工程结构

- `src/main/index.ts`：窗口、安全配置与应用生命周期。
- `src/renderer/`：最小 HTML/CSS/TypeScript 页面。
- `electron.vite.config.ts`：构建配置；仅开发模式允许本机热更新连接。
- `tests/bootstrap.test.mjs`：桌面运行检查，使用临时浏览器配置目录。

构建采用 electron-vite 5 + Vite 7，按兼容范围固定版本并提交锁文件。当前没有 preload、IPC、UI 框架或 C# 子进程。

## 开发入口

- [路线图与进度](docs/roadmap.md)
- [第一阶段：应用工程初始化](specs/speclite/electron-bootstrap/spec.md)

每阶段完成后停下来 review，经确认再进入下一阶段。

源项目位于 `D:\code\MyGit\MoeLoaderP`。对照当前工作区（包含未提交修改）转写行为与界面，不引入 C# 子进程；具体基线与验收规则见路线图。

参考项目附带 GPLv3 许可证；引入其代码或素材时记录来源并处理许可证与署名。当前尚未复制参考项目代码或素材。
