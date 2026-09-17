## ADDED Requirements

### Requirement: 源动态分类配置
应用 SHALL 支持 CustomLv2MenuItems，按 XPath 从菜单页生成静态分类所需的名称、分页 API 和覆盖规则。

#### Scenario: 首次选择站点
- **WHEN** 用户选择配置动态菜单的站点
- **THEN** 使用该站点会话加载菜单并显示分类，可继续搜索/详情/下载

### Requirement: 加载一致性
应用 SHALL 隔离不同站点的菜单状态，失败后允许重试，搜索与 UI 共用加载任务。

#### Scenario: 切走或加载失败
- **WHEN** 菜单加载中切换站点或加载失败
- **THEN** 不覆盖新站点分类，不提交半份列表，重新选择原站点可以重试
