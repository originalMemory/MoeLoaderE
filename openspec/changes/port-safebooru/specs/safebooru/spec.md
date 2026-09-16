## ADDED Requirements

### Requirement: Safebooru 静态浏览与下载
应用 SHALL 沿用参考站点的 XML 参数、分类入口和下载类型，支持搜索、提示、预览及下载。

#### Scenario: 搜索与下载
- **WHEN** 用户选择 Safebooru 并搜索关键词
- **THEN** 页码转换为从 0 开始的 pid，结果正确显示且可按所选质量下载

### Requirement: 独立状态与旧配置兼容
应用 SHALL 为 Safebooru 隔离会话与浏览状态，并兼容未包含此站点的旧配置。

#### Scenario: 旧配置启动
- **WHEN** 旧版配置中没有 Safebooru
- **THEN** 默认继承全局代理，其他站点代理、历史和登录状态保持不变
