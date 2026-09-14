use nalgebra::{DMatrix, DVector};

use crate::circuit::Circuit;
use crate::component::Component;
use crate::error::CircuitError;

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Solution {
    /// `node_voltages[0]` is always 0.0 (ground).
    pub node_voltages: Vec<f64>,
    /// One entry per voltage source, in the order it was added to the circuit.
    pub source_currents: Vec<f64>,
}

/// Ground (node 0) has no unknown; every other node maps to `n - 1`.
fn node_unknown(n: usize) -> Option<usize> {
    if n == 0 { None } else { Some(n - 1) }
}

impl Circuit {
    pub fn solve(&self) -> Result<Solution, CircuitError> {
        let num_node_unknowns = self.node_count - 1;
        let num_voltage_sources = self
            .components
            .iter()
            .filter(|c| matches!(c, Component::VoltageSource { .. }))
            .count();
        let size = num_node_unknowns + num_voltage_sources;

        let mut a = DMatrix::<f64>::zeros(size, size);
        let mut b = DVector::<f64>::zeros(size);

        let mut vsrc_index = 0;
        for component in &self.components {
            match *component {
                Component::Resistor { n1, n2, resistance } => {
                    let g = 1.0 / resistance;
                    let i1 = node_unknown(n1);
                    let i2 = node_unknown(n2);

                    if let Some(i1) = i1 {
                        a[(i1, i1)] += g;
                    }
                    if let Some(i2) = i2 {
                        a[(i2, i2)] += g;
                    }
                    if let (Some(i1), Some(i2)) = (i1, i2) {
                        a[(i1, i2)] -= g;
                        a[(i2, i1)] -= g;
                    }
                }
                Component::CurrentSource { n_from, n_to, current } => {
                    if let Some(i_from) = node_unknown(n_from) {
                        b[i_from] -= current;
                    }
                    if let Some(i_to) = node_unknown(n_to) {
                        b[i_to] += current;
                    }
                }
                Component::VoltageSource { n_pos, n_neg, voltage } => {
                    let branch = num_node_unknowns + vsrc_index;

                    if let Some(i_pos) = node_unknown(n_pos) {
                        a[(i_pos, branch)] += 1.0;
                        a[(branch, i_pos)] += 1.0;
                    }
                    if let Some(i_neg) = node_unknown(n_neg) {
                        a[(i_neg, branch)] -= 1.0;
                        a[(branch, i_neg)] -= 1.0;
                    }
                    b[branch] = voltage;

                    vsrc_index += 1;
                }
            }
        }

        let x = a.lu().solve(&b).ok_or(CircuitError::SingularMatrix)?;

        let mut node_voltages = vec![0.0; self.node_count];
        for n in 1..self.node_count {
            node_voltages[n] = x[n - 1];
        }

        let source_currents: Vec<f64> = x
            .rows(num_node_unknowns, num_voltage_sources)
            .iter()
            .copied()
            .collect();

        Ok(Solution {
            node_voltages,
            source_currents,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::{Circuit, Component};

    #[test]
    fn voltage_divider() {
        // 10V source across node 1 -> ground, R1=100 between 1 and 2,
        // R2=200 between 2 and ground. Expect V(2) = 10 * 200/(100+200).
        let mut circuit = Circuit::new();
        let n1 = circuit.add_node();
        let n2 = circuit.add_node();

        circuit
            .add_component(Component::VoltageSource {
                n_pos: n1,
                n_neg: 0,
                voltage: 10.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1,
                n2,
                resistance: 100.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1: n2,
                n2: 0,
                resistance: 200.0,
            })
            .unwrap();

        let solution = circuit.solve().unwrap();

        assert!((solution.node_voltages[n1] - 10.0).abs() < 1e-9);
        assert!((solution.node_voltages[n2] - (10.0 * 200.0 / 300.0)).abs() < 1e-9);
    }

    #[test]
    fn resistor_with_current_source() {
        // 2A current source injected into node 1, R = 10 ohm from node 1
        // to ground. No voltage source, so this exercises plain nodal
        // analysis (the current-source RHS stamp only, no B/C block).
        //
        // KCL at node 1 (current leaving through R = current injected):
        //     V1 / R = I
        //     V1 = I * R = 2.0 * 10.0 = 20.0V
        let mut circuit = Circuit::new();
        let n1 = circuit.add_node();

        circuit
            .add_component(Component::CurrentSource {
                n_from: 0,
                n_to: n1,
                current: 2.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1,
                n2: 0,
                resistance: 10.0,
            })
            .unwrap();

        let solution = circuit.solve().unwrap();

        assert!((solution.node_voltages[n1] - 20.0).abs() < 1e-9);
    }

    #[test]
    fn parallel_resistors() {
        // Two 100 ohm resistors, both from node 1 to ground, plus a 1A
        // current source injected into node 1. Each resistor stamps
        // a[n1][n1] += 1/100 independently; since both land on the same
        // diagonal entry, they sum automatically -> this is the parallel
        // combination rule falling out of plain matrix accumulation.
        //
        //     G_total = 1/R1 + 1/R2 = 1/100 + 1/100 = 0.02 S
        //
        // KCL at node 1:
        //     V1 * G_total = I
        //     V1 = I / G_total = 1.0 / 0.02 = 50.0V
        let mut circuit = Circuit::new();
        let n1 = circuit.add_node();

        circuit
            .add_component(Component::CurrentSource {
                n_from: 0,
                n_to: n1,
                current: 1.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1,
                n2: 0,
                resistance: 100.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1,
                n2: 0,
                resistance: 100.0,
            })
            .unwrap();

        let solution = circuit.solve().unwrap();

        assert!((solution.node_voltages[n1] - 50.0).abs() < 1e-9);
    }

    #[test]
    fn two_independent_voltage_sources() {
        // Two separate branches, each its own voltage source + resistor to
        // ground, sharing no nodes with each other besides ground. This
        // checks that each voltage source gets its own branch-current
        // unknown (`vsrc_index` 0 and 1) without the two colliding.
        //
        // For a single source+resistor loop (V source n_pos=node, n_neg=
        // ground, resistor R node->ground), the assembled 2x2 system is:
        //     [ g   1 ] [V]   [0 ]
        //     [ 1   0 ] [J] = [Vs]
        // Row 2 forces V = Vs directly. Substituting into row 1:
        //     g*Vs + J = 0  =>  J = -g*Vs = -Vs/R
        // (negative because J is defined n_pos -> n_neg, while the source
        // is actually delivering current the other way internally to
        // supply the resistor).
        //
        // Branch 1: Vs=5V, R=50 ohm -> V1=5.0V, J1 = -5/50  = -0.1A
        // Branch 2: Vs=8V, R=40 ohm -> V2=8.0V, J2 = -8/40  = -0.2A
        let mut circuit = Circuit::new();
        let n1 = circuit.add_node();
        let n2 = circuit.add_node();

        circuit
            .add_component(Component::VoltageSource {
                n_pos: n1,
                n_neg: 0,
                voltage: 5.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1,
                n2: 0,
                resistance: 50.0,
            })
            .unwrap();
        circuit
            .add_component(Component::VoltageSource {
                n_pos: n2,
                n_neg: 0,
                voltage: 8.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1: n2,
                n2: 0,
                resistance: 40.0,
            })
            .unwrap();

        let solution = circuit.solve().unwrap();

        assert!((solution.node_voltages[n1] - 5.0).abs() < 1e-9);
        assert!((solution.node_voltages[n2] - 8.0).abs() < 1e-9);
        assert!((solution.source_currents[0] - (-0.1)).abs() < 1e-9);
        assert!((solution.source_currents[1] - (-0.2)).abs() < 1e-9);
    }
}
