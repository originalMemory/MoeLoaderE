## ADDED Requirements

### Requirement: 原 JSON 与 XPath 自定义站点
应用 SHALL 从 CustomSites 目录加载静态分类配置，并依原 XPath 字段解析列表与图组，支持详情分页及第二级详情。

#### Scenario: 自定义站点浏览下载
- **WHEN** 用户选择已加载站点和分类
- **THEN** 正确替换关键词/页码，解析缩略图、详情和原图，通过同一站点会话预览和下载

### Requirement: 隔离配置与会话
应用 SHALL 隔离错误配置及各站点状态，拒绝不支持的能力和非网络 URL，不执行抓取页面脚本。

#### Scenario: 错误配置
- **WHEN** 某个 JSON 损坏、重名或包含未支持能力
- **THEN** 报告文件级错误，其余站点仍可用
