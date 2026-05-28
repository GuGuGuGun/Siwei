# Siwei v0.8.0 开发记录

## Phase 1：脑图自由布局与拖拽重组

- 阶段目标：在脑图视图中支持可持久化的自由布局，并通过独立重组模式拖拽调整树结构。
- 核心变更：新增 `mindMapLayout` 文档字段、布局提交与跨层级节点移动能力；脑图工具条新增布局、重组、自动整理；文档保存含布局时升级为 `version: 2`。
- 影响范围：前端文档类型、document store、树操作工具、脑图 ReactFlow 交互、Rust `OutlineDocument` 模型、JSON 保存/加载契约。
- 测试或验证结果：`pnpm test`、`pnpm run build`、`cargo test` 均通过。
- 遗留问题或后续计划：未执行 Playwright e2e；后续可补真实浏览器拖拽重组烟测，覆盖 ReactFlow 在实际 DOM 下的拖放事件。

## Phase 2：重组模式拖拽修复

- 阶段目标：修复重组模式进入后节点无法拖动的问题。
- 核心变更：移除自定义节点上的原生 HTML `draggable` / drop 事件，统一使用 ReactFlow 的节点拖拽事件；重组模式拖动过程中只更新命中预览，拖停后提交结构变更，布局模式仍提交坐标。
- 影响范围：脑图节点组件、脑图视图拖拽处理、重组命中测试。
- 测试或验证结果：`pnpm test`、`pnpm run build` 均通过。
- 遗留问题或后续计划：建议后续补浏览器级拖拽 smoke，验证 ReactFlow pointer 拖拽在真实运行环境中的手感。
