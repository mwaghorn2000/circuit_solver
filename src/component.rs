#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Component {
    Resistor {
        n1: usize,
        n2: usize,
        resistance: f64,
    },
    /// `n_pos` is the positive terminal: V(n_pos) - V(n_neg) = voltage.
    VoltageSource {
        n_pos: usize,
        n_neg: usize,
        voltage: f64,
    },
    /// Current flows through the source from `n_from` to `n_to`,
    /// i.e. it is injected into `n_to` and drawn out of `n_from`.
    CurrentSource {
        n_from: usize,
        n_to: usize,
        current: f64,
    },
    // Capacitor and Inductor can be added later once transient/AC support
    // is in scope.
}

impl Component {
    pub(crate) fn nodes(&self) -> (usize, usize) {
        match *self {
            Component::Resistor { n1, n2, .. } => (n1, n2),
            Component::VoltageSource { n_pos, n_neg, .. } => (n_pos, n_neg),
            Component::CurrentSource { n_from, n_to, .. } => (n_from, n_to),
        }
    }
}
