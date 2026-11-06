#![cfg_attr(test, allow(dead_code))]

mod engine;
mod filter;
mod fs;
mod js;
mod optimize;
mod policy;
mod style;
mod stylesheet;
mod swc;

#[cfg(test)]
mod stylesheet_tests;
#[cfg(feature = "napi")]
mod binding;

pub mod api {
    pub use crate::stylesheet::compile;
    pub use crate::swc::link::LinkOptions;
    pub use crate::swc::model::Source;
    pub use crate::swc::transform::{
        DEFAULT_STYLE_PROP, TransformOptions, needs_transform, transform_if_needed, transform_module,
    };
}
