pub mod number;
pub mod value;

use std::cmp::Ordering;

pub use value::{Object, Value};

pub fn cmp_utf16(a: &str, b: &str) -> Ordering {
    if a.is_ascii() && b.is_ascii() {
        return a.cmp(b);
    }
    a.encode_utf16().cmp(b.encode_utf16())
}
