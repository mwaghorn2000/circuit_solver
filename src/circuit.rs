use crate::component::Component;
use crate::error::CircuitError;

#[derive(Debug)]
pub struct Circuit {
    pub(crate) node_count: usize,
    pub(crate) components: Vec<Component>,
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

        if let Component::Resistor { resistance, .. } = component {
            if resistance <= 0.0 {
                return Err(CircuitError::InvalidResistance(resistance));
            }
        }

        self.components.push(component);
        Ok(())
    }
}
