use crate::models::{OutlineDocument, OutlineNode};

pub fn export_html(doc: &OutlineDocument) -> String {
    let mut html = String::new();
    html.push_str("<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n");
    html.push_str("<title>");
    html.push_str(&escape_html(&doc.title));
    html.push_str("</title>\n");
    html.push_str("<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#27272a;max-width:860px;margin:40px auto;padding:0 24px;}h1{font-size:28px;}li{margin:6px 0}.note{margin:4px 0 8px;color:#52525b;white-space:pre-wrap}.tags{color:#71717a;font-size:0.9em}.task{font-family:monospace;margin-right:6px}</style>\n");
    html.push_str("</head>\n<body>\n<h1>");
    html.push_str(&escape_html(&doc.title));
    html.push_str("</h1>\n");
    append_nodes(&mut html, &doc.root.children);
    html.push_str("</body>\n</html>\n");
    html
}

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
