# 阶段 4：登录、Cookie 与代理

用户授权提交阶段 3 并继续下一步。先完成站点隔离会话、全局/单站点代理及原版网页登录窗口；默认选择 Pixiv 作为第一条需登录链路，真实账号操作由用户完成。

本阶段接通 Konachan-G 与 Pixiv 的会话；Pixiv 覆盖静态作品的搜索/排行/作者、详情和组图下载，动图转换、镜像及其他站点仍属后续站点阶段。UI 按原 SearchControl、SettingsControl 与 LoginWindow 转写，不增加自创登录表单或独立代理弹窗。
