# SEAN Context Monitor

Windows 版 Codex Desktop 顶部上下文与用量监视器。把上下文占用、工作节奏提醒和订阅额度集中在顶部，减少来回查找。

**三种样式可选：清晰分层 · 数字胶囊 · 上下两层**

## 功能

- **上下文占用**：显示当前聊天最近一次有效采样的进度条与百分比。
- **红黄绿提醒**：百分比、进度条与中文提示保持同色。
- **保存结论／换会话提示**：提醒整理关键结论、约束与待办，并提供可复制的交接指令。
- **三种顶部样式**：即时切换并保存偏好，支持深浅主题、极简模式和窄窗口。
- **数值更清晰**：数字加粗、标签弱化；重置日期时间加深加粗，可随数值一起显示为胶囊。
- **会话与额度统计**：会话 Token、缓存命中率、自动压缩次数、耗时、订阅剩余额度与重置时间；可选接入支持的 API 用量接口。
- **独立 S 图标与快捷方式**：采用手动更新，保留现有本地设置。

| 状态 | 当前上下文占用 | 行动提示 |
| --- | --- | --- |
| 🟢 绿色 | 低于 70% | 可继续 |
| 🟡 黄色 | 70% 至低于 85% | 存结论 |
| 🔴 红色 | 85% 及以上 | 换会话 |
| ⚪ 灰色 | 无有效采样或压缩后等待新采样 | 不可用／待更新 |

上下文占用是基于当前聊天日志的**估算**，不是累计 Token；新输入与工具结果可能要等下一次采样才体现。70%／85% 用于提醒工作节奏，不代表模型开始“降智”，也不代表计费倍率。程序不会自动写记忆文件或替用户新开会话。

## 下载与安装

需要 **Windows 10/11、Codex Desktop、Node.js 22+** 和 PowerShell，建议 PowerShell 7。

- [正式发布与下载](https://github.com/mingze21/SEAN-Context-Monitor/releases)
- [仓库中已上传的安装包](https://github.com/mingze21/SEAN-Context-Monitor/raw/refs/heads/main/sean-context-monitor-1.1.0.zip)

解压 ZIP，在解压后的程序目录执行：

```powershell
pwsh -NoProfile -File .\install.ps1
```

没有 PowerShell 7 时：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

之后使用桌面的 **SEAN Context Monitor** 快捷方式启动。如果当前 Codex 未启用监视端口，请先正常退出 Codex，再从此快捷方式打开。安装器不会强制关闭 Codex，也不会改动 WindowsApps、app.asar、登录文件或模型设置。官方订阅监控无需额外 API Key。

## 切换顶部样式

点击顶部监视栏 → 展开“官方订阅”栏中的“设置” → “顶部样式”：

| 样式 | 展示方式 |
| --- | --- |
| 清晰分层 | 紧凑单行，标签弱化、数值加粗 |
| 数字胶囊 | 数值采用浅色胶囊，重置日期时间也加入胶囊 |
| 上下两层 | 上方标签、下方数值 |

选择立即生效，重新启动后恢复。标题栏空间不足时会自动调整布局或回退至输入区域附近。

## 来源与改进

这是结合两款软件的长处、再按 SEAN 使用需求改进的独立项目：

1. **Codex Usage Monitor for Windows**：以 [JiaYang-BUAA/Codex-Desktop-Usage-Monitor-Windows v3.1.7](https://github.com/JiaYang-BUAA/Codex-Desktop-Usage-Monitor-Windows) 为代码基础，延续用量采集、订阅额度、设置面板及 Windows 启动流程。
2. **Nudge**：借鉴紧凑上下文进度指示、红黄绿状态，以及及时保存结论和切换会话的提醒思路。本项目未打包 Nudge 的程序、源码、图标或品牌素材。
3. **SEAN 的改进**：顶部布局、当前聊天上下文估算、中文行动提示、统一状态色、三种可选样式、数字与重置时间的可读性、独立图标与手动更新策略。

感谢原项目及相关工具的启发。保留原项目 MIT 许可证和必要归因；安装包中的 `LICENSE` 与 `NOTICE.md` 记录完整说明。

## 版本与维护

产品版本为 **1.1.0**。包内 `BUILD-INFO.json` 记录完整维护编号和直接修改基线；下载时以具体发布说明为准。当前三种样式的功能基线为 `1.1.0+sean.1`，公开发布文档修订为 `1.1.0+sean.2`，两者运行代码一致。

程序默认安装到 `%LOCALAPPDATA%\Programs\SEANContextMonitor\1.1.0`。为兼容既有设置和 Windows DPAPI 加密凭据，内部状态目录保留为 `%LOCALAPPDATA%\CodexUsageMonitor`。请勿上传凭据、私人配置或会话日志。

本项目独立维护，**非 OpenAI 官方产品**，采用手动更新。问题可在 [Issues](https://github.com/mingze21/SEAN-Context-Monitor/issues) 反馈，请先移除凭据和私人信息。
