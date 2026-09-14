#[derive(Debug, Clone, PartialEq)]
pub enum CircuitError {
    InvalidNode(usize),
    DuplicateNode(usize),
    InvalidResistance(f64),
    SingularMatrix,
    Json(String),
    Io(String),
}

impl std::fmt::Display for CircuitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircuitError::InvalidNode(n) => write!(f, "node {n} does not exist in this circuit"),
            CircuitError::DuplicateNode(n) => write!(f, "Compoenents must be connected to two seperate nodes {n}"),
            CircuitError::InvalidResistance(r) => write!(f, "resistance {r} is invalid (must be > 0)"),
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
