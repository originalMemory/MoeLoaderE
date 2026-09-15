# 第二阶段 review 记录

## 状态

- 第二阶段实施、Windows 视觉补齐及整体 review 修复完成，22/22 项任务完成。
- 已按源 XAML、FluentWPF 资源及量测数据恢复布局、材质和控件状态；文字栅格化差异不等于逐像素相同。
- 用户已授权提交及推送本阶段改动。未进入下载、登录或打包阶段。

## 源基线

- `D:\code\MyGit\MoeLoaderP`，HEAD `f37c511`，包含原工作区未提交修改。
- `source-hashes.json` 记录源文件 SHA-256；实施结束核对，源文件内容未变化。
- 源项目构建成功，编译警告保留在本地 `artifacts/reference-render-build.log`，未升级或修改源项目依赖。
- Windows 截图 helper 连续返回 `SetIsBorderRequired ... 0x80004002`。对照图改由独立 WPF 测试进程的 `RenderTargetBitmap` 导出。
- 测试进程使用 `artifacts/render-profile`，不读取原应用账号配置；程序化构造了一条图片条目以展示列表、菜单和预览。背景系统合成效果不能用此导出证明像素一致。
- 测试入口位于本地忽略目录 `artifacts/reference-render/`；相对资源解析异常的 Logo 在测试进程中改为源程序集的明确 pack URI，未改动源文件。

## 功能对照

| 源功能 | 转写结果 | 证据 |
| --- | --- | --- |
| 初始居中搜索、搜索后右上布局 | 已实现，包含首次搜索过渡 | 初始/结果截图，桌面检查 |
| 参数、默认 60、起始页 1、分辨率 1024×768 | 已实现，参数范围与源控件一致 | 参数截图，输入边界检查 |
| Konachan-G 的 page/limit/tags 与字段映射 | 已实现 | 特殊字符查询、字段样本、在线验证 |
| 分辨率、方向、评级过滤 | 已实现；源程序没有实际分数过滤逻辑，不新增该功能 | `LocalFilter` 对照、样本检查 |
| 真实页聚合为展示页 | 已实现；短页不直接判定结束，空页结束 | 过滤后补取两页的检查 |
| 取消与连续搜索 | 已实现；过期结果不覆盖新会话 | slow/cancel/new 请求检查 |
| 缩略图、失败状态、Ctrl+R | 已实现，常规加载并发 8 | 图片加载样本，源码路径对照 |
| 已读状态、粉色描边与计数 | 已实现；当前运行单独记录，下次运行识别 | Viewed 编码及重复访问检查 |
| 点击、Shift 闭区间选择 | 已实现 | 选择 4 张的桌面检查 |
| 框选 | 按源五个点命中规则，Shift/Alt 取消选中，边缘滚动 | Shift 框选从 10 张减到 9 张检查 |
| 右键菜单 | 右键不改变选择；信息和标签点击复制 | 源代码对照，复制结果检查 |
| 导出地址与收集箱 | 按选择的图片类型收集地址后清空选择 | 源事件处理对照 |
| 独立预览窗口 | 85% 初始尺寸、元信息、标签、进度、失败重试、Escape | 桌面与在线预览检查 |
| 缩放和拖动 | 对照源滚轮比例、宽度阈值、锚点和小图边界 | 缩放增大、拖动边界检查 |
| 窗口位置、尺寸、缩略图大小、数量与历史 | 保存到 userData/browser.json，临时文件替换；与源数据隔离 | 源保存时机对照，正常退出检查 |
| 进程边界 | 显式 preload API，主窗口/预览窗口鉴权，条目 ID 图片协议 | 非法参数、非授权窗口、未知图片 ID 检查 |

## 命令与平台结果

- `npm test`：类型检查、生产构建、6 项测试通过，覆盖纯逻辑、已读记录恢复、正常启动、安全配置、失败退出码、浏览交互与 WPF 视觉基线。
- `npm run test:online`：Konachan-G 搜索 `landscape`，返回 10 张、10 张缩略图加载成功、独立预览图加载成功。
- `npm run dev -- --remoteDebuggingPort=9337`：开发页面、preload、字体/CSS、CSP 检查通过；关闭窗口后命令正常退出。
- `openspec validate port-booru-browser --strict`：规格校验。
- Node 22 的测试命令使用内置实验性 TypeScript 类型剥离，会输出实验提示；应用生产运行不依赖此功能。
- macOS 尚未实测；Windows 本阶段没有生成安装包。
- 一轮桌面回归曾出现额外取空页、下一页禁用，尚未稳定复现。增加查询 `limit=10` 和请求次数断言后，单独连续 5 次及完整测试再次通过；未声称已定位或修复原因，review 时需留意。

## 对照图（本地忽略产物）

- 源：`artifacts/reference-initial.png`、`reference-results.png`、`reference-parameters.png`、`reference-menu.png`、`reference-preview.png`。
- 新：`artifacts/browser-initial.png`、`browser-results.png`、`browser-parameters.png`、`browser-menu.png`、`browser-preview.png`。
- 在线：`artifacts/browser-online.png`、`browser-online-preview.png`；结果记录 `artifacts/online-result.json`。

## 待 review 的差异与边界

1. **渲染边界**：已补齐窗口材质、噪点、明暗/失焦状态、自绘控件、网格、阴影、动画和预览叠层。WPF 与 Chromium 的字体栅格化仍有细微区别，不宣称所有像素相同；本机 Windows 10 19045 已验证，macOS 与 Windows 11 未实测。
2. **平台行为**：窗口标题使用 MoeLoaderE；macOS 的标题栏、修饰键、关闭后再激活尚未实测。源窗口位置按虚拟屏夹紧，新实现按匹配显示器工作区夹紧。
3. **安全边界**：只允许 Konachan 的明确 HTTPS 域名，校验重定向和图片类型；JSON 上限 8 MiB、图片上限 40 MiB。源代码没有相同边界；超限或未知地址返回错误，不读取任意文件。
4. **失败反馈**：HTTP 错误显式反馈；预览失败提供重试。源程序部分失败仅写日志。页面边界验证和非零启动失败退出码继续保留。
5. **阶段范围**：只有 Konachan-G 可用；下载执行、登录、代理配置、完整设置、其他站点、原版彩蛋与关于内容未迁移，入口明确提示未完成。全功能迁移目标不变。

## 下一步

提交并推送第二阶段；用户继续指示后进入阶段 3。

## 整体 review 修复验收

- 三个问题均先由新增断言复现失败，再修复并通过完整测试。
- 已读：`Viewed.add` 跳过历史已读 ID；解码器兼容原格式的有符号偏移，验证实际区间非负、整数及安全范围。旧记录 `0,1001;-1,59` 可读取并保留记录，启动检查使用该记录通过。
- 菜单：使用浏览器原生顶层 popover，绕开祖先变换/裁切，空间不足时向上展开并限制高度；修复鼠标转移焦点时提前关闭选项的问题。760px 和最小 400px 窗口高度均能点击预览图、自动和原图。
- 重复 ID：保留所有条目，主进程按会话、展示页和条目位置分配独立键。卡片、资源协议、选择、预览和进度使用此键，站点 ID 仍用于展示、已读和详情地址。两个同 ID、不同资源和作者的条目可分别加载、选择、导出和预览。
- `npm run test:online` 再次通过：10 张结果、10 张缩略图和独立预览均成功。

## 视觉补齐验收

- 窗口：30px 标题区、1px 边框、原生最小化/最大化/关闭按钮；最大化和恢复尺寸检查通过。
- 材质：复用 FluentWPF 0.10.2 的 `noise.png`，128×128 平铺、0.03 不透明度；白/黑 tint 0.6，失焦回退色 `#e6e6e6` / `#1f1f1f`。
- Windows 10：通过 Koffi 调用与原版相同的 `SetWindowCompositionAttribute`，本机返回成功；拖动期间切换 BlurBehind，结束后恢复 Acrylic。Windows 11 分支按源代码使用 Gradient；macOS 使用系统 vibrancy，仍需实机检查。
- 明暗主题、活动/失焦状态经 IPC 同步。修正了直接在焦点回调读取原生状态导致时序不一致的问题；只更新已登记的应用窗口。
- 字体：按运行中的源窗口改为 `Microsoft YaHei UI`，保留 Font Awesome 原字体。
- 控件：下拉选项、自绘箭头、左右各 18px 的数字调节按钮、禁用色、悬浮阴影、滚动条、提示面板左右分栏、菜单图标与标签渐变均按源模板还原。
- 图片：按源算法等距列布局、16px 行间距、模糊底图、0.5s 加载动画、0.6s 悬浮放大和标题下移；预览信息与标签改为覆盖在完整画布上。
- 量测：1060×760 窗口的内容区为 1058×728；72px 顶栏、631px 内容区、25px 状态栏、404×34 搜索区（x=327、y=370.5）等量测与源数据误差不超过 1px。数据固化于 `tests/fixtures/wpf-layout.json`。
- 像素粗对照：同尺寸初始非活动态，裁去标题栏后，RGB 平均绝对差约 1.62/255；单像素平均差大于 20 的比例约 1.86%。指标包含大量留白，仅作为补充证据，不替代控件和状态检查。
- 图像：`artifacts/visual-comparison.png` 左侧原版、右侧当前；`visual-native-window.png` 包含真实系统窗口按钮；`visual-light.png`、`visual-dark.png`、`visual-inactive.png`、`visual-parameters.png`、`visual-dropdown.png` 覆盖主要状态。
- 开发模式验证：原生材质、preload、CSP 与样式通过，控制台无 error；窗口关闭后开发进程正常退出。
