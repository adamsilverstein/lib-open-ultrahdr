//! Gain map processing module.
//!
//! Implements ISO 21496-1 gain map computation and application.

pub mod decode;
pub mod encode;
pub mod math;
pub mod metadata;

pub use decode::apply_gain_map;
pub use encode::compute_gain_map;
pub use math::*;
pub use metadata::*;
