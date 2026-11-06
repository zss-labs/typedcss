use crate::engine::logical_physical::Spelling;

#[derive(Clone, Copy, Debug, Default)]
pub struct PolicyOption {
    pub enabled: bool,
    pub sizes: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct PropertyPolicy {
    pub reject: Spelling,
    pub include_axes: bool,
}

pub fn resolve_property_policy(
    logical: PolicyOption,
    physical: PolicyOption,
) -> Result<Option<PropertyPolicy>, String> {
    if logical.enabled && physical.enabled {
        return Err("[typedcss] withoutLogicalProperties and withoutPhysicalProperties contradict each other. Enable only the one this project writes against.".to_string());
    }
    if logical.enabled {
        return Ok(Some(PropertyPolicy {
            reject: Spelling::Logical,
            include_axes: logical.sizes,
        }));
    }
    if physical.enabled {
        return Ok(Some(PropertyPolicy {
            reject: Spelling::Physical,
            include_axes: physical.sizes,
        }));
    }
    Ok(None)
}

fn policy_option(value: &serde_json::Value) -> PolicyOption {
    match value {
        serde_json::Value::Bool(enabled) => PolicyOption { enabled: *enabled, sizes: false },
        serde_json::Value::Object(object) => PolicyOption {
            enabled: true,
            sizes: object.get("sizes").and_then(serde_json::Value::as_bool).unwrap_or(false),
        },
        _ => PolicyOption::default(),
    }
}

pub fn property_policy_of(options: &serde_json::Value) -> Result<Option<PropertyPolicy>, String> {
    resolve_property_policy(
        policy_option(&options["withoutLogicalProperties"]),
        policy_option(&options["withoutPhysicalProperties"]),
    )
}
