# EZ PM2 GUI

[![Discord](https://img.shields.io/discord/1234567890?logo=discord&logoColor=white&label=Discord&color=5865F2)](https://discord.gg/ttgc2zqK7b)

🌐 **支持的语言**: [English](README.md) | [中文](README_zh.md)

一个现代化的 PM2 进程管理器 Web 图形界面，基于 TypeScript、Tailwind CSS 和 React 构建。

## 截图

**进程仪表盘** — 实时系统指标和所有 PM2 进程一览：

![进程仪表盘](ezpm2gui/screenshots/01-processes.png)

**进程监控** — 每个进程的实时 CPU、内存和运行时间：

![进程监控](ezpm2gui/screenshots/02-monitoring.png)

**指标（实时）** — 每个进程滚动显示 1 小时迷你图，每 3 秒更新：

![指标实时](ezpm2gui/screenshots/12-metrics-live.png)

**指标（历史）** — 基于 SQLite 的 CPU 和内存图表，可选择时间范围：

![指标历史](ezpm2gui/screenshots/13-metrics-history.png)

**部署应用** — 通过结构化表单启动新的 PM2 进程：

![部署应用](ezpm2gui/screenshots/04-deploy-app.png)

**定时任务** — 无需编辑 crontab 即可调度周期性任务：

![定时任务](ezpm2gui/screenshots/08-cron-jobs.png)

**设置** — 自动保存的刷新、日志、主题和安全偏好设置：

![设置](ezpm2gui/screenshots/11-settings.png)

> 完整的视觉演示请访问 [https://ezpm2gui.vercel.app/](https://ezpm2gui.vercel.app/) — 每个页面都配有截图说明。

## 功能特性

- **实时进程监控** - 实时追踪所有 PM2 进程
- **进程管理** - 一键启动、停止、重启和删除进程
- **侧边栏快捷操作** *(v1.9.0)* - 鼠标悬停在侧边栏进程上时显示重启、启动/停止和日志按钮
- **系统指标仪表盘** - 监控 CPU、内存使用和运行时间
- **带实时迷你图的指标页面** - 每个进程滚动显示 1 小时 CPU 和内存微型图表，每 3 秒更新；切换到历史标签页查看基于 SQLite 的长期图表
- **增强的日志流** - 同时查看和筛选多个进程的日志
- **日志搜索高亮** *(v1.9.0)* - 搜索词在日志查看器中可视化高亮显示
- **日志时间戳范围筛选** *(v1.9.0)* - 按开始/结束时间戳筛选日志输出，支持快照模式
- **远程日志轮询** *(v1.9.0)* - 实时获取并显示远程服务器的日志
- **WebSocket 实时更新** - 无需刷新即可获取即时更新
- **进程 CPU 和内存图表** - 可视化性能指标随时间的变化
- **按状态或名称筛选进程** - 快速找到所需的进程
- **深色/浅色模式** - 所有页面完全支持 Tailwind CSS；偏好设置跨会话持久化
- **集群管理** - 轻松扩展 Node.js 应用
- **应用部署** - 直接从 UI 部署新应用
- **生态系统配置** - 创建和管理 PM2 生态系统文件
- **PM2 模块支持** - 管理和配置 PM2 模块
- **定时任务** - 使用可视化 cron 表达式构建器调度和管理自动化任务
- **远程服务器管理** - 通过 SSH 连接和管理远程服务器上的 PM2
- **端到端加密凭据** *(v1.9.0)* - 远程服务器密码在浏览器中使用 RSA-OAEP + AES-256-GCM 加密后再传输
- **高级监控仪表盘** - 带健康评分的实时性能图表
- **多语言支持** *(v1.10.0)* - 完整的国际化支持，内置英语和尼泊尔语；导航栏提供语言切换器；社区可扩展
- **Tailwind CSS UI** - 时尚、紧凑、响应式设计，一致的深色/浅色主题
- **完整的 TypeScript 类型** - 健壮且可维护的代码库

## 详细功能

### 进程监控
实时监控所有 PM2 进程，提供 CPU 使用率、内存消耗、运行时间和状态等详细信息。直观的界面让您可以一眼识别问题。

### 多语言支持
EZ PM2 GUI 内置完整的国际化（i18n）支持，由 `i18next` 和 `react-i18next` 驱动：
- 每个页面、组件、对话框、提示和工具提示都已完整翻译
- 内置**英语**（默认）和**尼泊尔语**语言包
- 导航栏提供语言切换器；选择跨会话持久化
- 社区可扩展 — 按照 `CONTRIBUTING_TRANSLATIONS.md` 添加新语言

### 远程服务器管理
通过安全的 SSH 连接连接和管理远程服务器上的 PM2 进程：
- 添加多个远程服务器连接及 SSH 凭据
- 查看和管理远程服务器上的进程
- 通过轮询实时流式传输远程进程日志
- 在远程机器上执行 PM2 命令
- **端到端凭据加密** — 密码在客户端加密（RSA-OAEP + AES-256-GCM 混合方案）后再传输；服务器在传输过程中永远不会看到明文密码

### 定时任务
使用 PM2 的 cron 重启功能调度和自动化任务：
- 可视化 cron 表达式构建器，内置常用预设
- 支持 Node.js、Python、Shell 和 .NET 脚本
- 内联脚本编辑器或基于文件的执行
- 无需删除即可启用/禁用任务
- 查看下次执行时间和任务状态

### 高级监控仪表盘
深入了解系统和进程性能：
- CPU、内存和负载的实时性能图表
- 系统健康评分计算
- 历史指标追踪
- 高资源使用的进程告警
- 每个进程的性能可视化

### 应用部署
直接从 UI 将新的 Node.js 应用部署到 PM2。配置所有必要选项，包括：
- 应用名称和脚本路径
- 工作目录
- 用于负载均衡的实例数
- 执行模式（fork 或 cluster）
- 自动重启选项
- 重启的内存阈值
- 环境变量

### 集群管理
通过集群管理界面轻松扩展 Node.js 应用。动态添加或移除实例，在 fork 和 cluster 执行模式之间切换以获得最佳性能。

### 日志流
通过增强的日志流界面同时查看和筛选多个进程的日志。功能包括：
- 通过 WebSocket 实时更新日志
- **带可视化高亮的搜索** — 匹配的词内联高亮显示
- **时间戳范围筛选** — 将日志缩小到开始/结束时间窗口，支持快照模式（筛选激活时暂停轮询）
- 按进程、日志级别或内容筛选
- 暂停和恢复日志流
- 下载日志进行离线分析
- 远程进程日志的浮动面板
- 远程服务器日志轮询

### 生态系统配置
直接从 UI 生成和管理 PM2 生态系统配置文件。轻松设置复杂的应用部署并在团队间共享配置。

### PM2 模块
管理和配置 PM2 模块以扩展 PM2 安装的功能。点击几下即可安装、更新和移除模块。

### 系统指标
监控关键系统指标，包括：
- CPU 使用率和核心数
- 内存使用和可用性
- 系统运行时间
- 平均负载（1、5 和 15 分钟）

### 用户界面
EZ PM2 GUI 使用 Tailwind CSS 打造时尚、紧凑且完全响应式的界面：
- 所有页面支持深色和浅色模式
- 一致的颜色主题和流畅过渡
- 紧凑布局，小字体和减少间距以提高信息密度
- `PageHeader` 和 `LogStatusBar` 可复用组件确保一致外观
- 从设置中配置仪表盘刷新间隔和日志显示设置

## 安装

### 全局安装

```bash
npm install -g ezpm2gui
```

### 本地安装

```bash
npm install ezpm2gui
```

## 使用方法

### 作为命令行工具（全局安装）

```bash
# 启动 EZ PM2 GUI Web 界面
ezpm2gui

# 在指定端口启动
ezpm2gui --port 4000

# 绑定到所有网络接口启动
ezpm2gui --host 0.0.0.0

# 生成示例 PM2 生态系统配置
ezpm2gui-generate-ecosystem
```

### 作为模块（本地安装）

```javascript
const ezpm2gui = require('ezpm2gui');

// 使用默认选项启动服务器
ezpm2gui.start();

// 或使用自定义选项
ezpm2gui.start({
  port: 3030,
  host: '0.0.0.0'
});
```

### 访问界面

启动后，在浏览器中访问：

```
http://localhost:3101
```

## 系统要求

- Node.js 16.x 或更高版本
- 全局安装 PM2 (`npm install -g pm2`)

## 配置

EZ PM2 GUI 使用环境变量进行配置：

- `PORT`: 服务器运行端口（默认：`3101`）
- `HOST`: 绑定的主机（默认：`localhost`）

您可以在项目根目录的 `.env` 文件中设置（如不存在请创建）：

```env
# .env
PORT=3102
HOST=localhost
```

为了让 React 客户端在生产构建时连接到正确的端口，还需设置：

```env
# src/client/.env
REACT_APP_API_URL=http://localhost:3102
```

## 使用 PM2 进行负载均衡

EZ PM2 GUI 提供简单的界面来管理 PM2 的负载均衡功能：

### 设置负载均衡

1. **部署新应用或修改现有应用**：
   - 将实例数设置为大于 1（或 0/-1 表示根据 CPU 核心数最大化实例）
   - 选择"Cluster"作为执行模式以获得最佳负载均衡

2. **管理您的集群**：
   - 使用集群管理部分来扩容或缩容实例
   - 在 fork 和 cluster 执行模式之间切换
   - 零停机重载所有实例

### 负载均衡工作原理

当您在集群模式下运行多个实例的 Node.js 应用时，PM2 提供内置的负载均衡：

- **集群模式**：在此模式下，PM2 使用 Node.js 的 cluster 模块创建共享同一服务器端口的多个工作进程
- **多实例**：传入请求自动分发到各个实例
- **零停机重载**：更新应用时，PM2 可以逐个重载实例以避免停机

### 最佳实践

- 对于 CPU 密集型应用，使用与 CPU 核心数相等的实例数
- 对于 I/O 密集型应用，可以使用超过 CPU 核心数的实例
- 始终使用集群模式进行负载均衡，以确保实例间端口共享
- 使用重载功能而非重启来实现零停机部署

## 开发

详细的开发说明请参见 [DEVELOPMENT.md](DEVELOPMENT.md)。

```bash
# 克隆仓库
git clone https://github.com/thechandanbhagat/ezpm2gui.git
cd ezpm2gui

# 安装依赖并构建
./install.sh   # Linux/macOS
install.bat    # Windows

# 以开发模式启动
npm run dev

# 构建应用
npm run build

# 启动应用（生产模式）
npm start
```

### 项目结构

```
ezpm2gui/
├── bin/                 # CLI 入口点
├── dist/                # 编译输出
├── docs/                # 文档
├── screenshots/         # 应用截图
├── scripts/             # 构建和工具脚本
├── src/                 # 源代码
│   ├── client/          # React 前端
│   │   ├── public/      # 静态资源
│   │   └── src/         # React 组件和逻辑
│   │       ├── components/ # UI 组件
│   │       └── types/   # 客户端 TypeScript 类型
│   ├── server/          # Express 后端
│   │   ├── routes/      # API 路由
│   │   └── utils/       # 服务器工具
│   └── types/           # 共享 TypeScript 类型
└── test/                # 测试文件
```

## 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 本仓库
2. 创建您的功能分支 (`git checkout -b feature/amazing-feature`)
3. 进行修改
4. 运行测试确保一切正常
5. 使用我们的[提交指南](./docs/COMMIT_GUIDE.md)提交更改
6. 推送到分支 (`git push origin feature/amazing-feature`)
7. 打开 Pull Request

### 编码风格

本项目遵循标准化的 TypeScript 约定，并使用 ESLint 进行代码质量检查。提交 pull request 前，请确保您的代码符合这些指南：

```bash
npm run lint
```

## 常见问题

### 问：EZ PM2 GUI 与 pm2-gui 和 PM2 Plus 有什么区别？

答：EZ PM2 GUI 是 pm2-gui 的现代化 TypeScript 替代方案，拥有更友好的用户界面和额外功能。与 PM2 Plus 不同，它完全免费且开源，在您的服务器本地运行而非云端。

### 问：我可以在不同机器上运行的 PM2 使用 EZ PM2 GUI 吗？

答：可以，您可以配置 EZ PM2 GUI 连接到远程 PM2 安装。您需要在应用设置中指定连接详情。

### 问：如何从现有进程生成生态系统文件？

答：使用 `ezpm2gui-generate-ecosystem` 命令行工具，或访问 Web UI 中的生态系统配置部分。

### 问：EZ PM2 GUI 能处理大量进程吗？

答：可以，EZ PM2 GUI 专为高效处理数十个进程而设计。UI 经过优化，以易于理解的方式呈现大量信息。

### 问：EZ PM2 GUI 安全吗？

答：默认情况下，出于安全考虑，EZ PM2 GUI 绑定到 localhost。如果您将界面暴露给其他机器，请考虑通过反向代理（如 Nginx）添加身份验证。

## 相关项目

- [PM2](https://github.com/Unitech/pm2) - EZ PM2 GUI 所使用的进程管理器
- [pm2-gui](https://github.com/Tjatse/pm2-gui) - 本项目的灵感来源

## 许可证

GNU Affero 通用公共许可证 v3.0 或更高版本（AGPL-3.0-or-later）。详见 [LICENSE](LICENSE)。

EZ PM2 GUI 与 [PM2](https://github.com/Unitech/pm2) 交互，PM2 采用 AGPL-3.0 许可。由于本项目将 PM2 作为库链接，因此采用相同许可证分发。

## 致谢

由 [Chandan Bhagat](https://github.com/thechandanbhagat) 构建，作为 pm2-gui 的现代化替代方案。

---

**注意**：EZ PM2 GUI 与 PM2 或 PM2 Plus 没有官方关联。它是一个与 PM2 进程管理器交互的独立工具。
