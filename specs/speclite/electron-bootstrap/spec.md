# Spec: electron-bootstrap

## Why

- 空仓库需要可运行的 Electron + TypeScript 开发入口。
- 先验证应用壳与构建链路，为后续图片浏览功能提供基础。

## Scope

- 本次做：单个应用工程、主进程窗口、最小本地页面、开发启动、类型检查与生产构建。
- 本次不做：站点请求、下载、登录、代理、正式 UI、安装包、自动更新、数据库。
- 本次是应用基础模块；后续功能分别建 spec。

## Plan

- [ ] 检查 Node/npm 与候选构建工具的兼容要求，选用维护中的稳定版本并记录实际版本。
- [ ] 建立 Electron + TypeScript 工程，使用 npm 并提交锁文件；优先现有构建工具，不手写进程编排。
- [ ] 实现显示 MoeLoaderE 标题与开发状态的本地窗口，适配关闭窗口和 macOS 再激活行为。
- [ ] 关闭渲染进程 Node 集成，开启上下文隔离与沙箱，限制非预期导航和新窗口，配置 CSP。
- [ ] 提供开发启动、类型检查、生产构建命令；README 写明实际执行方式。
- [ ] 为窗口生命周期和安全配置保留最小可运行检查；完成 Windows 开发与生产构建运行验证。
- [ ] 更新本 spec 和路线图，记录命令结果及未验证平台。

## Apply Notes

- 首阶段只用最小 HTML/CSS/TypeScript 页面；正式 UI 框架留到阶段 2 选择。
- 没有业务通信需求时不创建空 IPC 通道或通用桥接 API。
- 不复制参考项目源代码或素材，不添加 C# 子进程。
- 当前机器为 Windows；不能用 Windows 构建成功代替 macOS/Linux 运行验收。
- 安全配置依据：[Electron security](https://www.electronjs.org/docs/latest/tutorial/security)。

## Verify

- [ ] 从锁文件安装依赖成功，记录 Node/npm 版本和安装命令。
- [ ] 类型检查与生产构建成功，记录实际命令。
- [ ] Windows 开发模式打开窗口，显示本地页面，关闭后无遗留开发进程。
- [ ] Windows 生产构建可启动，不依赖开发服务器。
- [ ] 最小检查通过：安全配置符合上述约束；窗口生命周期处理有可执行验证。
- [ ] README 与实际命令一致，构建产物和依赖目录未进入 Git。
- [ ] macOS/Linux 实测缺失明确标记为未验证，不影响本阶段 Windows 验收。

## Status

- State: draft
- Archived: no
