# @deepseek-ai/dsh-client-ui-desktop-update

[English](README.md) | 中文

本包定义 Oasisfish Electron preload 与浏览器展示层共用、可用 JSON 表达的桌面更新状态和命令 bridge。协议只包含应用版本、更新阶段、受限的下载计数与适合展示给用户的消息；provider 配置、请求 metadata、文件系统路径、凭据和原始错误都不进入 renderer 接口。

本包的 Host 插件没有行为。更新检查、下载、安装和用户数据保留均由 Electron 负责。

## 模型体验

无。桌面更新状态和命令不进入模型请求或 Session 日志。

#### KV Cache 影响

无。本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- 该协议仅描述 Windows 桌面更新；普通浏览器客户端没有更新 bridge。
