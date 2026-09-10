# @deepseek-ai/dsh-client-ui-settings-memory

[English](README.md) | 中文

用于查看和维护持久用户记忆与当前项目记忆的 Web 设置页面。它读取当前 Session 的 `cwd`，调用类型化的 `memory` Host Remote，按 scope 分组有效记录，并提供启用、新增、行内编辑和删除操作。变更失败时保留当前草稿和最后一次成功快照。

关闭记忆会保留已存记录，也不会禁用本页面或 `memory_manage`；它会阻止 `@deepseek-ai/dsh-tool-memory` 向未来模型请求添加记录快照。所选 Session 没有 `cwd` 时，项目操作不可用。

## 模型体验

无；本包只渲染浏览器管理界面，不注册面向模型的提示词、schema、工具或消息。

#### KV Cache 影响

无；本包既不组装也不发送 Provider 请求。

## 已知限制与暂缓事项

- **按当前 Session 选择项目** — 页面只能管理当前所选 Session 的项目 scope，不能浏览任意文件系统路径的记录。
- **没有跨窗口推送更新** — 其他窗口的记忆变更会在页面重载或所选 Session 变化后出现；专用记忆 revision 事件暂缓。
