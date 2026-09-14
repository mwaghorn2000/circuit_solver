use crate::component::Component;
use crate::error::CircuitError;

#[derive(Debug)]
pub struct Circuit {
    pub(crate) node_count: usize,
    pub(crate) components: Vec<Component>,
}

impl Default for Circuit {
    fn default() -> Self {
        Self::new()
    }
}

impl Circuit {
    pub fn new() -> Self {
        Circuit {
            node_count: 1,
            components: Vec::new(),
        }
    }

    pub fn add_node(&mut self) -> usize {
        self.node_count += 1;
        self.node_count - 1
    }

    pub fn add_component(&mut self, component: Component) -> Result<(), CircuitError> {
        let (a, b) = component.nodes();
        if a >= self.node_count {
            return Err(CircuitError::InvalidNode(a));
        }
        if b >= self.node_count {
            return Err(CircuitError::InvalidNode(b));
        }
        if a == b {
            return Err(CircuitError::DuplicateNode(a));
        }

        match &component {
            Component::Resistor { resistance, .. } => {
                if !resistance.is_finite() || *resistance <= 0.0 {
                    return Err(CircuitError::InvalidResistance(*resistance));
                }
            }
            Component::Capacitor {
                capacitance,
                initial_voltage,
                ..
            } => {
                if !capacitance.is_finite() || *capacitance <= 0.0 {
                    return Err(CircuitError::InvalidCapacitance(*capacitance));
                }
                if !initial_voltage.is_finite() {
                    return Err(CircuitError::InvalidTransientConfig(
                        "capacitor initial voltages must be finite".into(),
                    ));
                }
            }
            Component::Switch {
                on_resistance,
                off_resistance,
                transitions,
                ..
            } => {
                if !on_resistance.is_finite()
                    || !off_resistance.is_finite()
                    || *on_resistance <= 0.0
                    || *off_resistance <= 0.0
                    || off_resistance < on_resistance
                {
                    return Err(CircuitError::InvalidSwitchResistance {
                        on: *on_resistance,
                        off: *off_resistance,
                    });
                }
                if transitions
                    .iter()
                    .any(|transition| !transition.time.is_finite())
                    || transitions
                        .windows(2)
                        .any(|pair| pair[0].time > pair[1].time)
                {
                    return Err(CircuitError::InvalidSwitchSchedule);
                }
            }
            Component::VoltageSource { voltage, .. } if !voltage.is_finite() => {
                return Err(CircuitError::InvalidTransientConfig(
                    "source values must be finite".into(),
                ));
            }
            Component::CurrentSource { current, .. } if !current.is_finite() => {
                return Err(CircuitError::InvalidTransientConfig(
                    "source values must be finite".into(),
                ));
            }
            Component::VoltageSource { .. } | Component::CurrentSource { .. } => {}
        }

        self.components.push(component);
        Ok(())
    }
}
