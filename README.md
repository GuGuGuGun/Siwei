# Siwei（思帷）

本地优先的桌面大纲与思维导图工具，用来整理长文档、项目计划、学习笔记和结构化想法。

Siwei 基于 Tauri 2、React、TypeScript 和 Rust 构建。它把文档保存为可读、可备份、可版本管理的 `.siwei.json` 文件，同时提供思维导图视图、文档库检索、Markdown/JSON 导入导出，以及受控的 Pi Agent 文档助手能力。

> 当前项目仍处于活跃开发阶段，接口、数据结构和打包流程可能随版本继续调整。

## 功能亮点

- 大纲编辑：支持节点增删改、层级调整、折叠、备注、标签、待办状态、撤销和重做。
- 思维导图：基于 React Flow 与 Dagre 将大纲树自动布局为可视化导图。
- 多视图工作区：支持大纲、思维导图和分屏视图，适合编辑与结构浏览并行。
- 本地优先存储：使用 `.siwei.json` 保存完整文档树，保存时生成 `.bak` 备份。
- 导入导出：支持 `.siwei.json` 与 Markdown 文件互转。
- 文档库：支持添加本地文档、刷新索引、全文检索、标签汇总和待办汇总。
- 文档助手：通过 Tauri command 管理 Pi Agent sidecar，AI 建议以预览和确认写入为边界。
- 浏览器测试 fallback：在没有 Tauri runtime 的测试环境中提供最小前端 fallback，便于覆盖首屏和关键交互。

## 技术栈

| 模块 | 技术 |
|---|---|
| 桌面应用 | Tauri 2 |
| 前端 | React 18、TypeScript、Vite |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 导图渲染 | React Flow、Dagre |
| 后端 | Rust、Tauri command |
| 本地索引 | rusqlite |
| Agent sidecar | Node.js、`@earendil-works/pi-agent-core` |
| 测试 | Vitest、Testing Library、Node test runner、Playwright |

## 快速开始

### 环境要求

- Node.js
- pnpm
- Rust 工具链
- Tauri 2 所需系统依赖

Windows 是当前优先开发和验证平台。

### 安装依赖

```bash
pnpm install
```

### 启动桌面应用

```bash
pnpm tauri dev
```

只启动前端开发服务器：

```bash
pnpm dev
```

默认 Vite 开发地址为 `http://127.0.0.1:1420`。

## 常用命令

```bash
# 构建前端
pnpm build

# 构建 Pi Agent sidecar
pnpm build:sidecar

# 运行单元测试与脚本测试
pnpm test

# 运行 Playwright smoke 测试
pnpm test:e2e

# 使用 Tauri CLI
pnpm tauri
```

## 项目结构

```text
.
├── index.html
├── package.json
├── scripts/                 # fixtures 生成、sidecar 构建等 Node 脚本
├── sidecars/                # Pi Agent sidecar 源文件
├── src/                     # React 前端
│   ├── app/                 # 应用入口和工作区状态
│   ├── components/          # 通用组件与布局组件
│   ├── features/            # 文档、大纲、导图、搜索、设置、文档库和 Agent 功能
│   ├── services/            # Tauri invoke 封装与浏览器测试 fallback
│   ├── test/                # 前端测试配置和 fixtures
│   ├── types/               # 前端共享类型
│   └── utils/               # 树操作和 ID 工具
├── src-tauri/               # Tauri Rust 后端
│   ├── binaries/            # 外部 sidecar 二进制
│   ├── capabilities/        # Tauri 权限配置
│   └── src/
│       ├── commands/        # 对前端暴露的 Tauri commands
│       ├── models/          # Rust 数据模型
│       ├── services/        # 文件、文档、索引、设置、Agent 等服务
│       └── utils/           # 错误、ID、时间等工具
└── tests/                   # Playwright e2e 测试
```

## 数据格式

Siwei 的主文档格式是 `.siwei.json`。一个文件包含完整的 `OutlineDocument` 文档树，核心内容包括文档 ID、标题、版本、时间戳、根节点，以及节点的文本、备注、折叠状态、待办状态、标签和子节点。

保存时后端会执行数据校验、pretty JSON 序列化、临时文件写入和备份文件生成。最近文档、应用设置和文档库索引保存在 Tauri `appDataDir` 下。

Markdown 导入目前以标题和无序缩进列表构造大纲树；Markdown 导出由 Rust 后端统一生成。

## 架构概览

```text
React UI
  -> Zustand stores
  -> src/services/siweiApi.ts
  -> Tauri invoke
  -> Rust commands
  -> Rust services
  -> 本地文件 / SQLite 索引 / Node sidecar
```

前端通过 `src/services/siweiApi.ts` 统一调用 Tauri commands。浏览器测试环境没有 Tauri runtime 时，`browserInvokeFallback.ts` 提供最小 fallback。

后端按 command、model、service、utils 分层。command 负责 IPC 边界，service 负责文档读写、Markdown 转换、文档库索引、设置持久化和 Agent sidecar 生命周期管理。

## 开发说明

- 项目版本信息当前同步维护在 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json`。
- 前端可见数据契约使用 camelCase，Rust 内部模型保持 snake_case。
- 业务逻辑变更优先补充测试；文档或样式类调整至少执行轻量验证。

## License

当前仓库尚未声明开源许可证。使用、分发或二次开发前请先与作者确认授权范围。
