## ADDED Requirements

### Requirement: Danbooru 浏览下载
应用 SHALL 使用当前安全评级语义完成 Danbooru 搜索、提示、预览和下载，并保留分类标签命名字段。

#### Scenario: 匿名搜索下载
- **WHEN** 用户选择 Danbooru 搜索公开内容
- **THEN** 仅展示 general 结果，使用独立会话加载 CDN 缩略图、预览和原图

### Requirement: 原账号入口
应用 SHALL 复用隔离登录窗口并按 `_danbooru2_session` Cookie 验证登录指示。

#### Scenario: 验证与注销
- **WHEN** 用户验证或注销 Danbooru
- **THEN** Cookie 和状态只作用于 Danbooru，不影响其他站点
