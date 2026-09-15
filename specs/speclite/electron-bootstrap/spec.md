# Spec: electron-bootstrap

## Why

- 空仓库需要可运行的 Electron + TypeScript 开发入口。
- 先验证应用壳与构建链路，为后续图片浏览功能提供基础。

## Scope

- 本次做：单个应用工程、主进程窗口、最小本地页面、开发启动、类型检查与生产构建。
- 本次不做：站点请求、下载、登录、代理、正式 UI、安装包、自动更新、数据库。
- 本次是应用基础模块；后续功能分别建 spec。

## Plan

- [x] 检查 Node/npm 与候选构建工具的兼容要求，选用维护中的稳定版本并记录实际版本。
- [x] 建立 Electron + TypeScript 工程，使用 npm 并提交锁文件；优先现有构建工具，不手写进程编排。
- [x] 实现显示 MoeLoaderE 标题与开发状态的本地窗口，适配关闭窗口和 macOS 再激活行为。
- [x] 关闭渲染进程 Node 集成，开启上下文隔离与沙箱，限制非预期导航和新窗口，配置 CSP。
- [x] 提供开发启动、类型检查、生产构建命令；README 写明实际执行方式。
- [x] 为窗口生命周期和安全配置保留最小可运行检查；完成 Windows 开发与生产构建运行验证。
- [x] 更新本 spec 和路线图，记录命令结果及未验证平台。
- [x] 修复 review 发现的启动失败仍返回 0 问题，并补充回归检查。

## Apply Notes

- 2026-09-15 用户确认进入实现；目标收敛为 Windows/macOS，阶段完成后停止等待 review。
- 用户追加约束：整个项目是保持逻辑与 UI 一致的换语言转写。当前占位页只验收启动链路，不属于正式 UI；后续对照源项目实现，不沿用占位页设计。
- 首阶段只用最小 HTML/CSS/TypeScript 页面；正式 UI 框架留到阶段 2 选择。
- 没有业务通信需求时不创建空 IPC 通道或通用桥接 API。
- 不复制参考项目源代码或素材，不添加 C# 子进程。
- 当前机器为 Windows；不能用 Windows 构建成功代替 macOS 运行验收。
- 安全配置依据：[Electron security](https://www.electronjs.org/docs/latest/tutorial/security)。
- 实际工具版本：Node 22.16.0、npm 10.9.2、Electron 44.3.0、electron-vite 5.0.0、Vite 7.3.6、TypeScript 7.0.2、Playwright 1.63.0；全部开发依赖固定版本。
- Vite 选 7.x，符合 electron-vite 5 的 peer dependency；不直接升级到 Vite 8。
- 构建工具缺少 preload 的配置提醒通过其官方 `--ignoreConfigWarning` 选项处理，不添加无用途文件。
- 开发 CSS 改用 HTML stylesheet 链接，避免 Vite 注入内联样式触发 CSP；生产模式禁止网络连接。
- 首次运行时下载未使用已有代理而停滞；设置当前进程 `ELECTRON_GET_USE_PROXY=1` 后官方安装器下载成功。未写入固定代理或镜像。
- 阶段 review 后用户已授权修复并提交，不自动开始阶段 2；macOS 真机运行与安装包验收仍未完成。
- review 修复：共用错误处理函数改为 `app.exit(1)`，覆盖首次加载和 macOS 再激活加载失败；正常关闭仍使用 `app.quit()`。

## Verify

- [x] 从锁文件安装依赖成功，记录 Node/npm 版本和安装命令。
- [x] 类型检查与生产构建成功，记录实际命令。
- [x] Windows 开发模式打开窗口，显示本地页面，关闭后无遗留开发进程。
- [x] Windows 生产构建可启动，不依赖开发服务器。
- [x] 最小检查通过：安全配置符合上述约束；窗口生命周期处理有可执行验证。
- [x] README 与实际命令一致，构建产物和依赖目录未进入 Git。
- [x] macOS 实测缺失明确标记为未验证，不影响本阶段 Windows 验收。
- [x] 启动失败回归检查先在旧实现复现 `0 !== 1`，修复后通过。

## Status

- State: done
- Archived: yes
- Review: 唯一 P2 问题已修复并通过回归检查；用户已授权提交，停在阶段 1。

## 验收记录（2026-09-15）

| 检查 | 结果 |
| --- | --- |
| `npm ci` | 成功，安装 77 个包，审计报告 0 vulnerabilities |
| `npx --no install-electron` | 官方运行时安装命令成功 |
| `npm test` | 成功，包含类型检查、生产构建和 2 个真实 Electron 进程检查 |
| 启动失败回归检查 | 使用本机受限端口触发加载失败，仅替换阻塞弹窗；真实错误处理返回退出码 1，正常窗口生命周期检查仍通过 |
| 桌面自动检查 | 本地页面加载、Node 不可访问、沙箱/隔离、生产 CSP、内联脚本拦截、导航拦截、弹窗拦截、重复激活不增开窗口、Windows 关闭最后窗口后退出均通过 |
| `npm run dev -- --remoteDebuggingPort=9337` | 页面显示“开发模式”、样式生效、重载后无 console error/pageerror；关闭窗口后命令退出 0 |
| `npm start` | 不启动开发服务器，显示 MoeLoaderE 窗口；关闭后命令退出 0 |
| 截图 | 本地忽略产物 `artifacts/bootstrap.png` 与 `artifacts/bootstrap-dev.png`，已检查布局 |
| macOS | 未实测；检查代码含 macOS 关闭后再激活分支，Windows 的通过结果不覆盖此分支 |
| 正式 UI 一致性 | 未验收，阶段 1 仅有启动占位页 |

阶段差异：未实现源应用功能与 UI；此处的 done 仅指当前 Scope 的 Windows 工程基础验收完成。安装包和 macOS 验收保留到后续阶段。
