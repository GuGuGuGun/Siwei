pub mod document;
pub mod recent;
pub mod search;

pub use document::{OutlineDocument, OutlineNode};
pub use recent::RecentDocItem;
pub use search::{SearchMatch, SearchMatchSource, SearchResult};
