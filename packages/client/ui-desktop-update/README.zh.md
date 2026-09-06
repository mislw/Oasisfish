# @deepseek-ai/dsh-client-ui-desktop-update

[English](README.md) | 中文

本包定义 Oasisfish Electron preload 与 Settings 页面共用、可用 JSON 表达的桌面更新状态和命令 bridge。协议只包含应用版本、更新阶段、受限的下载计数与适合展示给用户的消息；provider 配置、请求 metadata、文件系统路径、凭据和原始错误都不进入 renderer 接口。

浏览器插件仅在 `window.oasisfishUpdate` 存在时注册“应用更新”Settings 页面。页面挂载时读取当前状态并订阅变化；检查、下载和安装分别需要用户点击。普通浏览器客户端不显示更新页面。

本包的 Host 插件没有行为。GitHub Release 访问、安装包验证、安装、便携版清理和用户数据保留均由 Electron 负责。

## 模型体验

无。桌面更新状态和命令不进入模型请求或 Session 日志。

#### KV Cache 影响

无。本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- 更新页面仅支持 Windows 桌面 bridge，不为浏览器部署或其他操作系统提供 updater。
