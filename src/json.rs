use std::fs;
use std::path::Path;

use crate::circuit::Circuit;
use crate::component::Component;
use crate::error::CircuitError;

impl Circuit {
    /// Build a circuit from a JSON array of components, e.g.:
    ///
    /// ```json
    /// [
    ///   { "type": "voltage_source", "n_pos": 1, "n_neg": 0, "voltage": 10.0 },
    ///   { "type": "resistor", "n1": 1, "n2": 2, "resistance": 100.0 },
    ///   { "type": "resistor", "n1": 2, "n2": 0, "resistance": 200.0 }
    /// ]
    /// ```
    ///
    /// Node 0 is always ground and never needs to be declared. Every other
    /// node count is inferred from the highest node index referenced by any
    /// component, so there's no separate "declare your nodes" step.
    pub fn from_json(json: &str) -> Result<Self, CircuitError> {
        let components: Vec<Component> =
            serde_json::from_str(json).map_err(|e| CircuitError::Json(e.to_string()))?;

        let max_node = components
            .iter()
            .map(|c| {
                let (a, b) = c.nodes();
                a.max(b)
            })
            .max()
            .unwrap_or(0);

        let mut circuit = Circuit::new();
        for _ in 0..max_node {
            circuit.add_node();
        }

        for component in components {
            circuit.add_component(component)?;
        }

        Ok(circuit)
    }

    /// Same as [`Circuit::from_json`], reading the JSON from a file path.
    pub fn from_json_file(path: impl AsRef<Path>) -> Result<Self, CircuitError> {
        let contents = fs::read_to_string(path).map_err(|e| CircuitError::Io(e.to_string()))?;
        Self::from_json(&contents)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voltage_divider_from_json() {
        let json = r#"
            [
              { "type": "voltage_source", "n_pos": 1, "n_neg": 0, "voltage": 10.0 },
              { "type": "resistor", "n1": 1, "n2": 2, "resistance": 100.0 },
              { "type": "resistor", "n1": 2, "n2": 0, "resistance": 200.0 }
            ]
        "#;

        let circuit = Circuit::from_json(json).unwrap();
        let solution = circuit.solve().unwrap();

        assert!((solution.node_voltages[1] - 10.0).abs() < 1e-9);
        assert!((solution.node_voltages[2] - (10.0 * 200.0 / 300.0)).abs() < 1e-9);
    }

    #[test]
    fn voltage_divider_from_json_file() {
        let json = r#"
            [
              { "type": "voltage_source", "n_pos": 1, "n_neg": 0, "voltage": 10.0 },
              { "type": "resistor", "n1": 1, "n2": 2, "resistance": 100.0 },
              { "type": "resistor", "n1": 2, "n2": 0, "resistance": 200.0 }
            ]
        "#;

        let path = std::env::temp_dir().join("circuit_solver_test_voltage_divider.json");
        fs::write(&path, json).unwrap();

        let circuit = Circuit::from_json_file(&path).unwrap();
        let solution = circuit.solve().unwrap();

        fs::remove_file(&path).unwrap();

        assert!((solution.node_voltages[1] - 10.0).abs() < 1e-9);
        assert!((solution.node_voltages[2] - (10.0 * 200.0 / 300.0)).abs() < 1e-9);
    }

    #[test]
    fn rejects_malformed_json() {
        let err = Circuit::from_json("not json").unwrap_err();
        assert!(matches!(err, CircuitError::Json(_)));
    }

    #[test]
    fn still_runs_component_validation() {
        // Zero resistance should fail the same InvalidResistance check
        // add_component() enforces for circuits built via the Rust API.
        let json = r#"
            [
              { "type": "resistor", "n1": 1, "n2": 0, "resistance": 0.0 }
            ]
        "#;

        let err = Circuit::from_json(json).unwrap_err();
        assert!(matches!(err, CircuitError::InvalidResistance(_)));
    }
}
