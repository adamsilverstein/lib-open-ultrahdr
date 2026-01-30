//! UltraHDR format handling.
//!
//! Implements encoding and decoding of UltraHDR JPEG images according to
//! ISO 21496-1 and Google's UltraHDR v1 specification.

pub mod decoder;
pub mod encoder;

pub use decoder::{decode, extract_base, extract_metadata, has_gainmap_metadata, probe};
pub use encoder::encode;
