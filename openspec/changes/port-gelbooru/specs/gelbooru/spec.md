## ADDED Requirements

### Requirement: Gelbooru 浏览下载
应用 SHALL 沿用参考 Gelbooru 的 XML2 参数、提示、详情分类和三种下载质量。

#### Scenario: 登录后搜索下载
- **WHEN** 用户在 Gelbooru 完成 Cookie 登录并搜索
- **THEN** 使用独立会话请求列表和详情，按所选质量及详情命名字段下载

### Requirement: 当前认证边界
应用 SHALL 将匿名 DAPI 的 401 作为错误反馈，不当作空列表，且不记录账号或 API 凭据。

#### Scenario: 匿名接口受限
- **WHEN** Gelbooru 要求认证
- **THEN** 搜索明确失败，标签提示和登录入口仍可使用
