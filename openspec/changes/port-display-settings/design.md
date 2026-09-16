# 设计

- 按 App.BackgroundImagesDir 使用应用 userData/Background，仅读取直接子目录的 PNG 常规文件，随机选图；无内置背景素材。打开文件夹时创建目录。
- 源默认 670×530、右下；支持文件名 width=正整数 height=正整数 ha=left/right/center。背景覆盖主窗口内容与页眉区域，不覆盖状态栏；保持比例及源阴影。
- 主进程限制本地图片大小并验证 PNG，通过受限 moe-image://background/随机ID 传图，renderer 不获得任意文件读取接口。
- browser.json 保存 showBackground 默认 true、lowPerformance 默认 false；严格校验 IPC，读取旧配置时缺项补默认值。
- 低性能模式对应源缩略图出现/加载动画与模糊底图：关闭这些效果并跳过 canvas 绘制；不强制关闭独立的原生亚克力设置。切换对当前卡片即时生效，关闭低性能后从已加载图片重绘底图，不重发网络请求。
