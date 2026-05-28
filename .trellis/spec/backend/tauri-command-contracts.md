# Tauri Command Contracts

> Siwei MVP 的后端命令契约。这里记录 Rust `#[tauri::command]`、前端 `invoke` 包装、JSON 字段和错误边界，避免跨层字段漂移。

---

## Scenario: Outline Document Command Contract

### 1. Scope / Trigger

- Trigger: Siwei MVP 新增 Tauri 后端命令、文件读写、Markdown/JSON 导入导出、最近文档和搜索能力。
- 涉及层级: `src-tauri/src/commands/*`、`src-tauri/src/models/*`、`src/services/siweiApi.ts`、`src/types/document.ts`、`src/features/document/documentStore.ts`。
- 任何新增或修改 Tauri command、模型字段、错误文案、文件格式时，都必须同步更新本规格和前端类型。

### 2. Signatures

后端命令必须集中注册在 `src-tauri/src/commands/mod.rs::handlers()`：

```rust
#[tauri::command]
pub fn new_document() -> OutlineDocument;

#[tauri::command]
pub fn save_document(path: String, doc: OutlineDocument) -> Result<(), String>;

#[tauri::command]
pub fn load_document(path: String) -> Result<OutlineDocument, String>;

#[tauri::command]
pub fn export_markdown(path: String, doc: OutlineDocument) -> Result<(), String>;

#[tauri::command]
pub fn import_markdown(path: String) -> Result<OutlineDocument, String>;

#[tauri::command]
pub fn export_json(path: String, doc: OutlineDocument) -> Result<(), String>;

#[tauri::command]
pub fn import_json(path: String) -> Result<OutlineDocument, String>;

#[tauri::command]
pub fn get_recent_docs(app: tauri::AppHandle) -> Result<Vec<RecentDocItem>, String>;

#[tauri::command]
pub fn add_recent_doc(app: tauri::AppHandle, item: RecentDocItem) -> Result<(), String>;

#[tauri::command]
pub fn remove_recent_doc(app: tauri::AppHandle, path: String) -> Result<(), String>;

#[tauri::command]
pub fn open_file_dialog(app: tauri::AppHandle, filters: Vec<String>) -> Option<String>;

#[tauri::command]
pub fn save_file_dialog(app: tauri::AppHandle, default_name: String) -> Option<String>;

#[tauri::command]
pub fn search_document(doc: OutlineDocument, query: String) -> Vec<SearchResult>;

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<AppSettings, String>;

#[tauri::command]
pub fn update_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<AppSettings, String>;
```

前端只能通过 `src/services/siweiApi.ts` 包装调用这些命令，不在组件或 store 中直接散落 `invoke(...)`：

```typescript
export function saveDocument(path: string, doc: OutlineDocument): Promise<void> {
  return invoke('save_document', { path, doc })
}

export function searchDocument(
  doc: OutlineDocument,
  query: string,
): Promise<SearchResult[]> {
  return invoke('search_document', { doc, query })
}

export function updateSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke('update_settings', { settings })
}
```

### 3. Contracts

`OutlineDocument` 和 `OutlineNode` 的跨层 JSON 字段使用 camelCase，由 Rust `serde(rename_all = "camelCase")` 与 TypeScript interface 共同维持：

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

文件和存储契约：

- `.siwei.json` 保存为 pretty JSON，写入前必须执行 `OutlineDocument::validate()`。
- 文档格式 `version: 2` 可包含可选 `mindMapLayout` 字段，字段按节点 ID 保存 `{ x, y }` 坐标；旧 `version: 1` 文档缺少该字段时必须可反序列化并保持不主动改写。
- Markdown 导入导出不表达 `mindMapLayout`，只保留树、任务、标签、备注等大纲语义。
- 写文件必须通过 `file_service::atomic_write_with_backup()`，当前文件存在时创建同路径 `.bak`。
- 读取 `.siwei.json` 时主文件解析失败且 `.bak` 存在，必须尝试从备份恢复。
- 单个文档或导出文本大小上限为 `MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024`。
- 最近文档条目 `RecentDocItem` 字段为 `path/title/lastOpenedAt`。
- 搜索结果 `SearchResult` 字段为 `nodeId/text/path/matchIndices`，其中 `matchIndices` 是 `[start, end]` 元组数组。
- 设置 `AppSettings` 字段为 `autoSaveEnabled/autoSaveIntervalMs/defaultViewMode/sidebarCollapsed`，`defaultViewMode` 只能是 `outline | mindmap | split`。
- 设置保存到 Tauri `appDataDir/settings.json`；文件不存在、JSON 损坏或字段校验失败时返回默认设置，下一次成功保存覆盖损坏配置。
- `autoSaveIntervalMs` 默认值为 `1500`，允许范围为 `500..=10000`。

### 4. Validation & Error Matrix

| Condition | Backend error | Frontend expectation |
|---|---|---|
| `doc.id` 为空 | `数据校验失败: 文档 ID 不能为空` | 保存失败，`saveStatus = "error"` 或向调用方抛出错误 |
| `doc.version == 0` | `数据校验失败: 文档版本必须大于 0` | 不得静默覆盖文件 |
| 任一节点 `id` 为空 | `数据校验失败: <location> 节点 ID 不能为空` | 阻止保存或导入结果进入有效状态 |
| 节点 ID 重复 | `数据校验失败: 节点 ID 重复: <id>` | 调用方必须保留当前文档状态 |
| 时间戳为 `0` | `数据校验失败: ...时间戳必须大于 0` | 不得写入磁盘 |
| 文件不存在 | `文件不存在: <path>` | load/import 失败并由 UI 呈现错误 |
| 文件超过 10MB | `文件过大: 当前 <actual> 字节，最大允许 <max> 字节` | 阻止读取或写入 |
| JSON 无法解析且备份也失败 | `JSON 解析失败: 主文件读取失败...备份读取失败...` | 不得生成半初始化文档 |
| Markdown 无法解析 | `Markdown 解析失败: <reason>` | import markdown 抛错 |
| 用户取消打开/保存对话框 | `Option<String>::None` / `null` | 前端保持当前状态，不设置错误 |
| `settings.autoSaveIntervalMs` 超出范围 | `数据校验失败: 自动保存延迟必须在 500-10000 毫秒之间` | 设置保存失败，前端必须回滚到上一个设置 |

### 5. Good/Base/Bad Cases

- Good: `save_document(path, doc)` 收到有效 `OutlineDocument`，先校验、写临时文件、同步、备份旧文件，再替换目标文件。
- Base: `load_document(path)` 读取主文件成功，返回与 TypeScript `OutlineDocument` 字段一致的 camelCase JSON。
- Base: `load_document(path)` 主文件损坏但 `.bak` 有效，返回备份文档。
- Base: `get_settings(app)` 在设置文件不存在或损坏时返回默认 `AppSettings`。
- Good: `update_settings(app, settings)` 先校验范围，再 pretty JSON 写入 `settings.json` 并返回保存后的完整设置。
- Bad: 直接 `fs::write(path, content)` 覆盖文档，跳过校验、临时文件和备份。
- Bad: 在前端组件里直接 `invoke('save_document', ...)`，绕开 `siweiApi.ts` 的统一命令名和类型入口。
- Bad: 前端只保存 patch 对象到后端，导致新增设置字段时旧配置丢失。

### 6. Tests Required

- Rust model test: 断言 `OutlineDocument` 序列化字段为 camelCase，`note/collapsed/checked/tags` 为 `None` 时省略。
- Rust model test: 断言 `mindMapLayout` camelCase 序列化、旧 JSON 反序列化兼容、`version: 2` 文档校验通过。
- Rust validation test: 断言空文档 ID、`version == 0`、重复节点 ID、空节点 ID、零时间戳都返回 `AppError::Validation`。
- Rust file service test: 断言第二次保存生成 `.bak`，主文件损坏时能从备份恢复，超过 10MB 的读写失败且不落盘。
- Rust command test: 断言 `export_markdown` 能把文档树写成预期 Markdown。
- Rust settings service test: 断言默认值、读写持久化、损坏 JSON 回退、`autoSaveIntervalMs` 范围校验。
- Frontend type/API test: 断言 `siweiApi.ts` 的 wrapper 使用正确 command name 和参数对象字段。
- Frontend store test: 断言保存前会把 `collapsedNodeIds` 同步回树节点，保存成功后 `isDirty=false`，取消保存对话框返回 `false` 且不改变当前路径。
- Frontend settings store test: 断言加载默认设置、即时保存、保存失败回滚。

### 7. Background Job Commands

Any command named `start_*_job`, `start_*_refresh`, or otherwise documented as a background task must return after creating the job record. It must not synchronously perform all work before returning the job id.

Required behavior:

- The start command creates a job id and stores an initial `queued` or `running` status.
- Work continues outside the command call, for example in a worker thread.
- A status command can observe intermediate progress while work is still running.
- A cancel command can mark the job as cancel requested; already-running item work may finish, but not-yet-started items should be skipped.
- Unit tests must assert that start returns before `processed == total` for a multi-item job, or otherwise use a deterministic worker seam to prove non-blocking behavior.

### 8. Wrong vs Correct

#### Wrong

```typescript
// 组件或 store 内直接拼 command name，字段漂移时无法集中发现。
await invoke('save_document', {
  filePath: path,
  document: doc,
})

await invoke('update_settings', {
  auto_save_interval_ms: 2500,
})
```

#### Correct

```typescript
// 统一通过 API 包装维持 command name 和参数字段契约。
await api.saveDocument(path, doc)

await api.updateSettings({
  autoSaveEnabled: true,
  autoSaveIntervalMs: 2500,
  defaultViewMode: 'outline',
  sidebarCollapsed: false,
})
```

#### Wrong

```rust
// 跳过校验和备份会让损坏数据直接覆盖用户文档。
std::fs::write(path, serde_json::to_string(doc).unwrap()).unwrap();
```

#### Correct

```rust
// 保存必须走 file_service，复用校验、pretty JSON、原子写入和备份。
file_service::save_document(path, &doc).into_command_result()
```
