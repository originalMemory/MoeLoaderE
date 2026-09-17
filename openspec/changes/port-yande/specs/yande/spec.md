## ADDED Requirements

### Requirement: Yande 站点链路
应用 SHALL 沿用参考 Yande 的 XML 搜索、提示和下载类型，隔离其会话及浏览状态。

#### Scenario: 搜索与下载
- **WHEN** 用户选择 Yande 搜索
- **THEN** 请求包含正确页码和 rating:s，结果可预览并按所选质量下载

### Requirement: 原账号入口
应用 SHALL 复用隔离登录窗口并按 user_id Cookie 验证 Yande 登录指示。

#### Scenario: 验证与注销
- **WHEN** 用户完成网页登录并验证或右键注销
- **THEN** Cookie 只进入 Yande 会话，不影响 Pixiv 或其他站点
