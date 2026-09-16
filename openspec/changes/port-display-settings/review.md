# 背景图与低性能模式验收

## 源对照

沿用 SettingsControl.xaml.cs 的 ChangeBgImage、UiUtility.SetBgPos、MainWindow.BgGrid 和 MoeItemControl.TryLoad/LoadDisplayImageAsync；源码摘要见 source-hashes.json。

## 已实现

- 原设置中的背景显示、随机换图、打开背景目录和低性能模式已接通，开关立即保存；旧配置缺项采用 true/false 默认值，IPC 类型错误被拒绝。
- 应用 userData/Background 中的 PNG 常规文件随机选择，默认右下 670×530；文件名支持 width=、height=、ha=left/right/center，图片等比例显示并受窗口大小约束，背景止于状态栏上方。
- 无可用图片时保留当前背景，初次启动无图则不显示；不自带或下载背景素材，启动时随机选图而非保存所选文件名。
- 仅通过当前随机 ID 提供已验证的 PNG 字节，拒绝任意文件路径、旧 ID 与查询参数；跳过符号链接、目录、坏图、非 PNG 和超过 40 MiB 的文件。
- 低性能模式停止缩略图加载/出现动画、隐藏并释放模糊底图 canvas；切回时从已有图片恢复，无新增网络请求。原生亚克力开关独立；参考代码并未全局禁止所有按钮/面板/悬停动画，本批保持相同作用范围。

## 验证

- npm test：类型检查、生产构建与 27/27 测试通过，无跳过。
- 桌面测试覆盖背景目录创建与 shell 打开参数、PNG 布局/比例、错误资源/大文件/符号链接、显示开关、低性能状态与 canvas 恢复、请求数量不增加、重启保存以及没有有效文件时保留旧背景。
- artifacts/display-settings.png 已检查原设置布局、低性能图片状态及测试背景位置。图片由测试临时生成，非产品素材。
- openspec validate port-display-settings --strict、git diff --check 通过。
- 首轮测试仅因 macOS /var 与 /private/var 的路径别名比较失败；按 realpath 比较后通过，产品路径无需修改。

## 平台与剩余工作

本批在 macOS 验证，Windows 真机和原生文件管理器 UI 操作仍待验证（测试拦截 shell.openPath 验证路径，未实际打开 Finder）。目录位置使用 Electron userData 对应各平台应用数据目录，这是源 Windows APPDATA 路径的跨平台对应方式。

其他站点、自定义站点、动图等剩余主体功能继续分批迁移；Pixiv 真实登录验收留到 Windows。本批未提交，待用户 review。
