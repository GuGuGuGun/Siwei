use crate::utils::error::AppResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SseEvent {
    pub event_name: String,
    pub data: String,
}

#[derive(Debug, Default)]
pub(crate) struct SseDecoder {
    buffer: String,
    event_name: String,
    data_lines: Vec<String>,
}

impl SseDecoder {
    pub(crate) fn push_chunk(&mut self, chunk: &[u8]) -> AppResult<Vec<SseEvent>> {
        self.buffer.push_str(&String::from_utf8_lossy(chunk));
        let mut events = Vec::new();

        // SSE 事件可能跨 TCP chunk 到达，因此缓存半行并只在空行出现时产出完整事件。
        while let Some(newline_index) = self.buffer.find('\n') {
            let mut line = self.buffer[..newline_index].to_string();
            if line.ends_with('\r') {
                line.pop();
            }
            self.buffer.replace_range(..=newline_index, "");

            if line.is_empty() {
                if !self.data_lines.is_empty() {
                    events.push(SseEvent {
                        event_name: if self.event_name.is_empty() {
                            "message".to_string()
                        } else {
                            std::mem::take(&mut self.event_name)
                        },
                        data: self.data_lines.join("\n"),
                    });
                    self.data_lines.clear();
                }
                continue;
            }

            if let Some(value) = line.strip_prefix("event:") {
                self.event_name = value.trim().to_string();
            } else if let Some(value) = line.strip_prefix("data:") {
                self.data_lines.push(value.trim_start().to_string());
            }
        }

        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    use super::SseDecoder;

    #[test]
    fn decodes_sse_events_across_chunks() {
        let mut decoder = SseDecoder::default();

        assert!(decoder.push_chunk(b"event: message_delta\ndata: {\"a\"").unwrap().is_empty());
        let events = decoder.push_chunk(br#":1}

"#).unwrap();

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_name, "message_delta");
        assert_eq!(events[0].data, r#"{"a":1}"#);
    }
}
