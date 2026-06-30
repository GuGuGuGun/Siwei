use crate::models::{OutlineDocument, OutlineNode};

pub fn export_html(doc: &OutlineDocument) -> String {
    let document_json = serde_json::to_string(doc)
        .map(escape_json_for_script)
        .unwrap_or_else(|_| "{}".to_string());
    let mut html = String::new();
    html.push_str("<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n");
    html.push_str("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n");
    html.push_str("<title>");
    html.push_str(&escape_html(&doc.title));
    html.push_str("</title>\n");
    html.push_str(SHARE_STYLE);
    html.push_str("</head>\n<body>\n");
    html.push_str(
        "<div id=\"siwei-share-root\" class=\"shell\" data-renderer=\"siwei-offline-mindmap\"></div>\n",
    );
    html.push_str("<script id=\"siwei-share-data\" type=\"application/json\">");
    html.push_str(&document_json);
    html.push_str("</script>\n");
    html.push_str(SHARE_SCRIPT);
    html.push_str("<noscript><div class=\"fallback\"><h1>");
    html.push_str(&escape_html(&doc.title));
    html.push_str("</h1>\n");
    append_nodes(&mut html, &doc.root.children);
    html.push_str("</div></noscript>\n");
    html.push_str("</body>\n</html>\n");
    html
}

const SHARE_STYLE: &str = r#"<style>
:root{color-scheme:light;--paper:#faf8f4;--panel:#fffdf8;--ink:#27272a;--muted:#71717a;--line:rgba(139,90,43,.22);--accent:#8a5a2b}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:var(--ink);background:var(--paper)}
button{font:inherit}.shell{display:flex;min-height:100vh;flex-direction:column}.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.72);padding:10px 16px;backdrop-filter:blur(12px)}
.title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700}.actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px}.seg{display:flex;gap:2px;border:1px solid var(--line);border-radius:8px;background:#f3efe6;padding:2px}.seg button,.icon{height:32px;border:0;border-radius:6px;background:transparent;color:#52525b;cursor:pointer}.seg button{padding:0 10px;font-size:12px;font-weight:700}.seg button.active,.seg button[aria-pressed=true]{background:white;color:#18181b;box-shadow:0 1px 3px rgba(0,0,0,.08)}.icon{border:1px solid var(--line);background:var(--panel);padding:0 10px;font-size:12px;font-weight:700}.icon:focus-visible,.seg button:focus-visible,.collapse:focus-visible{outline:2px solid rgba(138,90,43,.38);outline-offset:2px}
.stage{min-height:0;flex:1;overflow:hidden}.view{display:none;height:100%}.view.active{display:block}.outline{height:100%;overflow:auto;padding:32px}.outline-inner{max-width:920px;margin:0 auto}.outline h1{margin:0 0 28px;border-bottom:1px dashed var(--line);padding-bottom:16px;font-size:30px;line-height:1.25;overflow-wrap:anywhere}.node{margin:8px 0}.node-card{border:1px solid var(--line);border-radius:10px;background:rgba(255,255,255,.74);padding:10px 12px;box-shadow:0 8px 22px rgba(0,0,0,.035)}.node-row{display:flex;align-items:flex-start;gap:8px}.node-content{min-width:0;line-height:1.55;overflow-wrap:anywhere;word-break:break-word}.collapse{width:24px;height:24px;flex:0 0 auto;border:0;border-radius:6px;background:#f4eadc;color:var(--accent);cursor:pointer}.collapse:disabled{opacity:.24;cursor:default}.note{margin:6px 0 0 32px;color:#52525b;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}.tags{color:var(--muted);font-size:12px}.task{margin-right:6px;font-family:ui-monospace,Consolas,monospace;color:#047857}.children{margin-left:28px}
.mindmap{position:relative;height:100%;overflow:hidden}.canvas{height:100%;width:100%;touch-action:none;cursor:grab}.canvas:active{cursor:grabbing}.edge{fill:none;stroke:#a27b5c;stroke-width:1.8;stroke-dasharray:5 5}.map-node rect{fill:#faf6ec;stroke:rgba(139,90,43,.3);stroke-width:2;stroke-dasharray:5 5;filter:drop-shadow(0 8px 16px rgba(0,0,0,.08))}.map-node foreignObject{overflow:visible}.node-label{height:100%;display:flex;flex-direction:column;justify-content:center;gap:3px;color:#3f3f46;font-size:12px;font-weight:700;line-height:1.35;overflow:hidden;overflow-wrap:anywhere;word-break:break-word}.node-label small{color:#8a5a2b;font-size:10px}.hint{position:absolute;bottom:14px;left:14px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.72);padding:6px 8px;color:#71717a;font-size:12px}
.fallback{max-width:860px;margin:32px auto;padding:0 24px;line-height:1.6}li{margin:6px 0}
</style>
"#;

const SHARE_SCRIPT: &str = r#"<script>
(() => {
  const doc = JSON.parse(document.getElementById('siwei-share-data').textContent || '{}');
  const rootEl = document.getElementById('siwei-share-root');
  const collapsed = new Set();
  const state = { view: 'outline', panX: 40, panY: 40, zoom: 1, dragging: false, dragStart: null };

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function syncInitialCollapse(node) {
    if (node.collapsed) collapsed.add(node.id);
    (node.children || []).forEach(syncInitialCollapse);
  }

  function renderShell() {
    rootEl.innerHTML = `
      <header class="bar">
        <div class="title">${escapeText(doc.title || '未命名文档')}</div>
        <div class="actions">
          <div class="seg">
            <button type="button" data-action="toggle-view" data-view="outline" aria-pressed="true">大纲</button>
            <button type="button" data-action="toggle-view" data-view="mindmap" aria-pressed="false">导图</button>
          </div>
          <button type="button" class="icon" data-action="fit-map">适配视图</button>
          <button type="button" class="icon" data-action="reset-map">重置视图</button>
        </div>
      </header>
      <main class="stage">
        <section class="view outline" data-view-panel="outline"></section>
        <section class="view mindmap" data-view-panel="mindmap">
          <svg class="canvas" role="img" aria-label="导图视图"></svg>
          <div class="hint">使用鼠标拖动画布，滚轮缩放。</div>
        </section>
      </main>
    `;
    rootEl.addEventListener('click', handleClick);
    const canvas = rootEl.querySelector('.canvas');
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
  }

  function handleClick(event) {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'toggle-view') {
      state.view = action.dataset.view;
      render();
    }
    if (action.dataset.action === 'toggle-collapse') {
      const nodeId = action.dataset.nodeId;
      collapsed.has(nodeId) ? collapsed.delete(nodeId) : collapsed.add(nodeId);
      render();
    }
    if (action.dataset.action === 'fit-map') {
      fitMap();
      renderMindMap();
    }
    if (action.dataset.action === 'reset-map') {
      resetMap();
      renderMindMap();
    }
  }

  function render() {
    rootEl.querySelectorAll('[data-action="toggle-view"]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === state.view);
      button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
    });
    rootEl.querySelectorAll('[data-view-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.viewPanel === state.view);
    });
    renderOutline();
    renderMindMap();
  }

  function renderOutline() {
    const panel = rootEl.querySelector('[data-view-panel="outline"]');
    panel.innerHTML = `<div class="outline-inner"><h1>${escapeText(doc.root?.text || doc.title || '未命名文档')}</h1>${renderOutlineNodes(doc.root?.children || [])}</div>`;
  }

  function renderOutlineNodes(nodes) {
    return nodes.map((node) => {
      const children = node.children || [];
      const isCollapsed = collapsed.has(node.id);
      const task = node.checked === undefined || node.checked === null ? '' : `<span class="task">${node.checked ? '[x]' : '[ ]'}</span>`;
      const tags = Array.isArray(node.tags) && node.tags.length ? ` <span class="tags">${escapeText(node.tags.map((tag) => '#' + tag).join(' '))}</span>` : '';
      const note = node.note && node.note.trim() ? `<div class="note">${escapeText(node.note)}</div>` : '';
      return `<div class="node"><div class="node-card"><div class="node-row"><button type="button" class="collapse" data-action="toggle-collapse" data-node-id="${escapeText(node.id)}" aria-label="${isCollapsed ? '展开节点' : '折叠节点'}" ${children.length ? '' : 'disabled'}>${children.length ? (isCollapsed ? '›' : '⌄') : ''}</button><div class="node-content">${task}${escapeText(node.text || '空白节点')}${tags}</div></div>${note}</div>${!isCollapsed && children.length ? `<div class="children">${renderOutlineNodes(children)}</div>` : ''}</div>`;
    }).join('');
  }

  function collectVisible(node, depth = 0, indexByDepth = new Map(), result = { nodes: [], edges: [] }) {
    const index = indexByDepth.get(depth) || 0;
    indexByDepth.set(depth, index + 1);
    const metrics = getNodeMetrics(node);
    result.nodes.push({ node, depth, x: depth * 280, y: index * 116, width: metrics.width, height: metrics.height });
    if (!collapsed.has(node.id)) {
      (node.children || []).forEach((child) => {
        result.edges.push({ source: node.id, target: child.id });
        collectVisible(child, depth + 1, indexByDepth, result);
      });
    }
    return result;
  }

  function renderMindMap() {
    const canvas = rootEl.querySelector('.canvas');
    const graph = collectVisible(doc.root || { id: 'root', text: doc.title || '未命名文档', children: [] });
    const byId = new Map(graph.nodes.map((item) => [item.node.id, item]));
    const edges = graph.edges.map((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) return '';
      const sourceY = source.y + source.height / 2;
      const targetY = target.y + target.height / 2;
      return `<path class="edge" d="M${source.x + source.width} ${sourceY} C${source.x + source.width + 46} ${sourceY}, ${target.x - 46} ${targetY}, ${target.x} ${targetY}" />`;
    }).join('');
    const nodes = graph.nodes.map(({ node, x, y }) => {
      const label = escapeText(node.text || '空白节点');
      const metrics = getNodeMetrics(node);
      const childMeta = (node.children || []).length ? `<small>${(node.children || []).length} 个子节点</small>` : '';
      const task = node.checked === undefined || node.checked === null ? '' : `<span class="task">${node.checked ? '[x]' : '[ ]'}</span>`;
      return `<g class="map-node" transform="translate(${x},${y})"><rect width="${metrics.width}" height="${metrics.height}" rx="12"></rect><foreignObject x="12" y="8" width="${metrics.width - 24}" height="${metrics.height - 16}"><div class="node-label"><div>${task}${label}</div>${childMeta}</div></foreignObject></g>`;
    }).join('');
    canvas.setAttribute('viewBox', `${-state.panX / state.zoom} ${-state.panY / state.zoom} ${canvas.clientWidth / state.zoom || 1200} ${canvas.clientHeight / state.zoom || 720}`);
    canvas.innerHTML = `<g data-siwei-share-renderer="true">${edges}${nodes}</g>`;
  }

  function getNodeMetrics(node) {
    const labelLength = Array.from(String(node.text || '空白节点')).length;
    const width = Math.max(180, Math.min(280, 88 + labelLength * 8));
    const lineCount = Math.max(1, Math.ceil(labelLength / 18));
    const hasMeta = (node.children || []).length || node.checked !== undefined && node.checked !== null;
    const height = Math.max(64, Math.min(126, 36 + lineCount * 17 + (hasMeta ? 14 : 0)));
    return { width, height };
  }

  function getGraphBounds(graph) {
    if (!graph.nodes.length) return { minX: 0, minY: 0, width: 1, height: 1 };
    const minX = Math.min(...graph.nodes.map((item) => item.x));
    const minY = Math.min(...graph.nodes.map((item) => item.y));
    const maxX = Math.max(...graph.nodes.map((item) => item.x + item.width));
    const maxY = Math.max(...graph.nodes.map((item) => item.y + item.height));
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }

  function fitMap() {
    const canvas = rootEl.querySelector('.canvas');
    const graph = collectVisible(doc.root || { id: 'root', text: doc.title || '未命名文档', children: [] });
    const bounds = getGraphBounds(graph);
    const viewportWidth = canvas.clientWidth || 1200;
    const viewportHeight = canvas.clientHeight || 720;
    const zoomX = (viewportWidth - 96) / bounds.width;
    const zoomY = (viewportHeight - 96) / bounds.height;
    state.zoom = Math.max(0.35, Math.min(1.6, zoomX, zoomY));
    state.panX = -bounds.minX * state.zoom + Math.max(48, (viewportWidth - bounds.width * state.zoom) / 2);
    state.panY = -bounds.minY * state.zoom + Math.max(48, (viewportHeight - bounds.height * state.zoom) / 2);
  }

  function resetMap() {
    state.panX = 40;
    state.panY = 40;
    state.zoom = 1;
  }

  function handlePointerDown(event) {
    state.dragging = true;
    state.dragStart = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!state.dragging || !state.dragStart) return;
    state.panX = state.dragStart.panX + event.clientX - state.dragStart.x;
    state.panY = state.dragStart.panY + event.clientY - state.dragStart.y;
    renderMindMap();
  }

  function handlePointerUp() {
    state.dragging = false;
    state.dragStart = null;
  }

  function handleWheel(event) {
    event.preventDefault();
    state.zoom = Math.max(0.35, Math.min(2.2, state.zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
    renderMindMap();
  }

  syncInitialCollapse(doc.root || { children: [] });
  renderShell();
  fitMap();
  render();
})();
</script>
"#;

fn append_nodes(html: &mut String, nodes: &[OutlineNode]) {
    if nodes.is_empty() {
        return;
    }

    html.push_str("<ul>\n");
    for node in nodes {
        html.push_str("<li>");
        if let Some(checked) = node.checked {
            html.push_str("<span class=\"task\">");
            html.push_str(if checked { "[x]" } else { "[ ]" });
            html.push_str("</span>");
        }
        html.push_str(&escape_html(&node.text));
        if let Some(tags) = &node.tags {
            if !tags.is_empty() {
                html.push_str(" <span class=\"tags\">");
                html.push_str(&escape_html(
                    &tags
                        .iter()
                        .map(|tag| format!("#{tag}"))
                        .collect::<Vec<_>>()
                        .join(" "),
                ));
                html.push_str("</span>");
            }
        }
        if let Some(note) = &node.note {
            if !note.trim().is_empty() {
                html.push_str("<div class=\"note\">");
                html.push_str(&escape_html(note));
                html.push_str("</div>");
            }
        }
        append_nodes(html, &node.children);
        html.push_str("</li>\n");
    }
    html.push_str("</ul>\n");
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn escape_json_for_script(value: String) -> String {
    value
        .replace('<', "\\u003C")
        .replace('>', "\\u003E")
        .replace('&', "\\u0026")
}
