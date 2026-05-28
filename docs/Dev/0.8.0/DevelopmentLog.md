# Siwei v0.8.0 开发记录

## Phase 1：脑图自由布局与拖拽重组

- 阶段目标：在脑图视图中支持可持久化的自由布局，并通过独立重组模式拖拽调整树结构。
- 核心变更：新增 `mindMapLayout` 文档字段、布局提交与跨层级节点移动能力；脑图工具条新增布局、重组、自动整理；文档保存含布局时升级为 `version: 2`。
- 影响范围：前端文档类型、document store、树操作工具、脑图 ReactFlow 交互、Rust `OutlineDocument` 模型、JSON 保存/加载契约。
- 测试或验证结果：`pnpm test`、`pnpm run build`、`cargo test` 均通过。
- 遗留问题或后续计划：未执行 Playwright e2e；后续可补真实浏览器拖拽重组烟测，覆盖 ReactFlow 在实际 DOM 下的拖放事件。
