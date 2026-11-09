#![cfg_attr(test, allow(dead_code))]

mod engine;
mod filter;
mod fs;
mod js;
mod optimize;
mod policy;
mod style;
mod stylesheet;
mod oxc;

#[cfg(test)]
mod stylesheet_tests;
#[cfg(feature = "napi")]
mod binding;

pub mod api {
    pub use crate::stylesheet::compile;
    pub use crate::oxc::link::LinkOptions;
    pub use crate::oxc::model::Source;
    pub use crate::oxc::transform::{
        DEFAULT_STYLE_PROP, TransformOptions, needs_transform, transform_if_needed, transform_module,
    };
}
