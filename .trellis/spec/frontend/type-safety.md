# Type Safety

> Type safety patterns in this project.

---

## Overview
前端使用 TypeScript interface 表达与 Tauri/Rust 共享的 JSON 契约。所有跨层类型集中在 `src/types/document.ts`，所有 Tauri 命令集中在 `src/services/siweiApi.ts` 封装。

后端 Rust 模型通过 `serde(rename_all = "camelCase")` 暴露字段，因此前端类型必须使用 camelCase；禁止在前端引入 snake_case 字段或临时转换对象。

---

## Type Organization

共享类型：

```typescript
export interface OutlineDocument {
  id: string
  title: string
  version: number
  createdAt: number
  updatedAt: number
  mindMapLayout?: Record<string, MindMapLayoutPosition>
  root: OutlineNode
}

export interface MindMapLayoutPosition {
  x: number
  y: number
}

export interface OutlineNode {
  id: string
  text: string
  note?: string
  collapsed?: boolean
  checked?: boolean
  tags?: string[]
  createdAt: number
  updatedAt: number
  children: OutlineNode[]
}
```

组织规则：

- `src/types/document.ts`: 只放跨组件、跨层复用的数据结构。
- `src/services/siweiApi.ts`: 返回值必须显式标注 `Promise<...>`，避免 `invoke` 默认推断成 `unknown` 或宽泛类型。
- 组件内部状态和临时 UI 类型应放在对应组件或 feature store 内，不提升到共享类型文件。

---

## Validation

当前前端不做完整运行时 schema 校验，数据有效性由 Rust 后端 `OutlineDocument::validate()` 和文件服务保证。前端必须承担两类轻量约束：

- 创建或编辑节点时生成非空 `id`、`createdAt`、`updatedAt` 和 `children: []`。
- 调用保存、导出、搜索命令前传入完整 `OutlineDocument`，不要传局部节点或裁剪后的树。

如果后续引入 Zod 等运行时校验，必须以 `src/types/document.ts` 和 `.trellis/spec/backend/tauri-command-contracts.md` 为源契约，不得定义另一套字段名。

---

## Common Patterns

Tauri wrapper 必须固定命令名、参数字段和返回类型：

```typescript
export function importJson(path: string): Promise<OutlineDocument> {
  return invoke('import_json', { path })
}

export function addRecentDoc(item: RecentDocItem): Promise<void> {
  return invoke('add_recent_doc', { item })
}
```

状态层更新树节点时保留 `OutlineNode` 完整结构：

```typescript
const newNode: OutlineNode = {
  id: generateId(),
  text,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  children: [],
}
```

---

## Forbidden Patterns

禁止：

- 在组件或 store 中直接调用 `invoke(...)`，应通过 `siweiApi.ts`。
- 使用 `any` 或类型断言绕过 `OutlineDocument` / `OutlineNode`。
- 在前端使用 `created_at`、`updated_at`、`node_id`、`match_indices` 等 snake_case 字段。
- 保存前删除 `children`、`createdAt`、`updatedAt` 等后端校验必需字段。
- 在脑图布局字段中使用 `mind_map_layout`、`node_id` 等 snake_case 名称。

错误示例：

```typescript
await invoke('load_document', { filePath: path }) as OutlineDocument
```

正确示例：

```typescript
const doc = await api.loadDocument(path)
```
