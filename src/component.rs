#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
pub struct SwitchTransition {
    pub time: f64,
    pub closed: bool,
}

fn default_switch_on_resistance() -> f64 {
    1.0e-3
}

fn default_switch_off_resistance() -> f64 {
    1.0e12
}

#[derive(Debug, Clone, PartialEq, serde::Deserialize)]
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
    /// `initial_voltage` is V(n1) - V(n2) at the start of a transient run.
    Capacitor {
        n1: usize,
        n2: usize,
        capacitance: f64,
        #[serde(default)]
        initial_voltage: f64,
    },
    /// A practical switch represented by a finite resistance in each state.
    Switch {
        n1: usize,
        n2: usize,
        #[serde(default)]
        initially_closed: bool,
        #[serde(default = "default_switch_on_resistance")]
        on_resistance: f64,
        #[serde(default = "default_switch_off_resistance")]
        off_resistance: f64,
        #[serde(default)]
        transitions: Vec<SwitchTransition>,
    },
}

impl Component {
    pub(crate) fn nodes(&self) -> (usize, usize) {
        match self {
            Component::Resistor { n1, n2, .. }
            | Component::Capacitor { n1, n2, .. }
            | Component::Switch { n1, n2, .. } => (*n1, *n2),
            Component::VoltageSource { n_pos, n_neg, .. } => (*n_pos, *n_neg),
            Component::CurrentSource { n_from, n_to, .. } => (*n_from, *n_to),
        }
    }

    pub(crate) fn switch_is_closed_at(&self, time: f64) -> Option<bool> {
        self.switch_state(time, true)
    }

    pub(crate) fn switch_is_closed_before(&self, time: f64) -> Option<bool> {
        self.switch_state(time, false)
    }

    fn switch_state(&self, time: f64, include_transitions_at_time: bool) -> Option<bool> {
        let Component::Switch {
            initially_closed,
            transitions,
            ..
        } = self
        else {
            return None;
        };

        let mut closed = *initially_closed;
        for transition in transitions {
            if transition.time > time || (!include_transitions_at_time && transition.time == time) {
                break;
            }
            closed = transition.closed;
        }
        Some(closed)
    }
}
