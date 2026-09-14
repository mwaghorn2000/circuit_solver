#[derive(Debug, Clone, PartialEq)]
pub enum CircuitError {
    InvalidNode(usize),
    DuplicateNode(usize),
    InvalidResistance(f64),
    InvalidCapacitance(f64),
    InvalidSwitchResistance { on: f64, off: f64 },
    InvalidSwitchSchedule,
    InvalidTransientConfig(String),
    SingularMatrix,
    Json(String),
    Io(String),
}

impl std::fmt::Display for CircuitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircuitError::InvalidNode(n) => write!(f, "node {n} does not exist in this circuit"),
            CircuitError::DuplicateNode(n) => {
                write!(f, "components must be connected to two separate nodes {n}")
            }
            CircuitError::InvalidResistance(r) => {
                write!(f, "resistance {r} is invalid (must be finite and > 0)")
            }
            CircuitError::InvalidCapacitance(c) => {
                write!(f, "capacitance {c} is invalid (must be finite and > 0)")
            }
            CircuitError::InvalidSwitchResistance { on, off } => write!(
                f,
                "switch resistances are invalid (on={on}, off={off}; both must be finite and > 0, and off must be >= on)"
            ),
            CircuitError::InvalidSwitchSchedule => write!(
                f,
                "switch transition times must be finite and in nondecreasing order"
            ),
            CircuitError::InvalidTransientConfig(msg) => {
                write!(f, "invalid transient configuration: {msg}")
            }
            CircuitError::SingularMatrix => write!(
                f,
                "circuit has no unique solution (check for floating nodes or a loop of ideal voltage sources)"
            ),
            CircuitError::Json(msg) => write!(f, "failed to parse circuit JSON: {msg}"),
            CircuitError::Io(msg) => write!(f, "failed to read circuit file: {msg}"),
        }
    }
}

impl std::error::Error for CircuitError {}
