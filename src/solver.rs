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

#[derive(Debug, Clone, Copy, PartialEq, serde::Deserialize)]
pub struct TransientConfig {
    pub start_time: f64,
    pub stop_time: f64,
    pub time_step: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct TransientSolution {
    pub times: Vec<f64>,
    /// `node_voltages[time_index][node_index]`.
    pub node_voltages: Vec<Vec<f64>>,
    /// `source_currents[time_index][source_index]`.
    pub source_currents: Vec<Vec<f64>>,
}

const MAX_TRANSIENT_POINTS: usize = 1_000_000;
type CapacitorData = (usize, usize, f64, f64);

/// Tracks voltage-difference constraints while choosing an independent set
/// for transient initialisation. This prevents parallel capacitors (or a
/// consistent loop of capacitors) from adding redundant MNA rows.
struct VoltageConstraints {
    parent: Vec<usize>,
    offset_to_parent: Vec<f64>,
}

impl VoltageConstraints {
    fn new(node_count: usize) -> Self {
        Self {
            parent: (0..node_count).collect(),
            offset_to_parent: vec![0.0; node_count],
        }
    }

    /// Returns the root and V(node) - V(root).
    fn root_and_offset(&self, mut node: usize) -> (usize, f64) {
        let mut offset = 0.0;
        while self.parent[node] != node {
            offset += self.offset_to_parent[node];
            node = self.parent[node];
        }
        (node, offset)
    }

    /// Adds V(n1) - V(n2) = voltage. Returns true when the constraint is
    /// independent and therefore needs an MNA branch.
    fn add(&mut self, n1: usize, n2: usize, voltage: f64) -> Result<bool, CircuitError> {
        let (root1, offset1) = self.root_and_offset(n1);
        let (root2, offset2) = self.root_and_offset(n2);
        if root1 == root2 {
            let implied = offset1 - offset2;
            let tolerance = 1.0e-9 * voltage.abs().max(implied.abs()).max(1.0);
            if (implied - voltage).abs() > tolerance {
                return Err(CircuitError::InvalidTransientConfig(format!(
                    "inconsistent initial voltage constraints: requested {voltage} V but the circuit implies {implied} V"
                )));
            }
            return Ok(false);
        }

        self.parent[root1] = root2;
        self.offset_to_parent[root1] = voltage - offset1 + offset2;
        Ok(true)
    }
}

/// Ground (node 0) has no unknown; every other node maps to `n - 1`.
fn node_unknown(n: usize) -> Option<usize> {
    if n == 0 { None } else { Some(n - 1) }
}

fn stamp_conductance(a: &mut DMatrix<f64>, n1: usize, n2: usize, conductance: f64) {
    let i1 = node_unknown(n1);
    let i2 = node_unknown(n2);
    if let Some(i1) = i1 {
        a[(i1, i1)] += conductance;
    }
    if let Some(i2) = i2 {
        a[(i2, i2)] += conductance;
    }
    if let (Some(i1), Some(i2)) = (i1, i2) {
        a[(i1, i2)] -= conductance;
        a[(i2, i1)] -= conductance;
    }
}

fn stamp_current_source(b: &mut DVector<f64>, n_from: usize, n_to: usize, current: f64) {
    if let Some(i_from) = node_unknown(n_from) {
        b[i_from] -= current;
    }
    if let Some(i_to) = node_unknown(n_to) {
        b[i_to] += current;
    }
}

fn stamp_voltage_source(
    a: &mut DMatrix<f64>,
    b: &mut DVector<f64>,
    n_pos: usize,
    n_neg: usize,
    branch: usize,
    voltage: f64,
) {
    if let Some(i_pos) = node_unknown(n_pos) {
        a[(i_pos, branch)] += 1.0;
        a[(branch, i_pos)] += 1.0;
    }
    if let Some(i_neg) = node_unknown(n_neg) {
        a[(i_neg, branch)] -= 1.0;
        a[(branch, i_neg)] -= 1.0;
    }
    b[branch] = voltage;
}

fn unpack_solution(
    x: DVector<f64>,
    node_count: usize,
    num_voltage_sources: usize,
) -> Result<Solution, CircuitError> {
    if x.iter().any(|value| !value.is_finite()) {
        return Err(CircuitError::SingularMatrix);
    }

    let num_node_unknowns = node_count - 1;
    let mut node_voltages = vec![0.0; node_count];
    for n in 1..node_count {
        node_voltages[n] = x[n - 1];
    }
    let source_currents = x
        .rows(num_node_unknowns, num_voltage_sources)
        .iter()
        .copied()
        .collect();
    Ok(Solution {
        node_voltages,
        source_currents,
    })
}

impl Circuit {
    /// Solve the time-independent circuit. Capacitors are open circuits and
    /// switches use their state at t=0.
    pub fn solve(&self) -> Result<Solution, CircuitError> {
        self.solve_dc()
    }

    pub fn solve_dc(&self) -> Result<Solution, CircuitError> {
        let num_node_unknowns = self.node_count - 1;
        let num_voltage_sources = self
            .components
            .iter()
            .filter(|c| matches!(c, Component::VoltageSource { .. }))
            .count();
        let size = num_node_unknowns + num_voltage_sources;

        let mut a = DMatrix::<f64>::zeros(size, size);
        let mut b = DVector::<f64>::zeros(size);
        self.stamp_static(&mut a, &mut b, 0.0, true);

        let x = a.lu().solve(&b).ok_or(CircuitError::SingularMatrix)?;
        unpack_solution(x, self.node_count, num_voltage_sources)
    }

    pub fn solve_transient(
        &self,
        config: TransientConfig,
    ) -> Result<TransientSolution, CircuitError> {
        let times = self.transient_times(config)?;
        let num_node_unknowns = self.node_count - 1;
        let num_voltage_sources = self
            .components
            .iter()
            .filter(|component| matches!(component, Component::VoltageSource { .. }))
            .count();
        let capacitors: Vec<CapacitorData> = self
            .components
            .iter()
            .filter_map(|component| match component {
                Component::Capacitor {
                    n1,
                    n2,
                    capacitance,
                    initial_voltage,
                } => Some((*n1, *n2, *capacitance, *initial_voltage)),
                _ => None,
            })
            .collect();
        let requested_initial_voltages: Vec<f64> = capacitors
            .iter()
            .map(|(_, _, _, initial_voltage)| *initial_voltage)
            .collect();
        let initial = self.solve_with_capacitor_constraints(
            times[0],
            num_voltage_sources,
            &capacitors,
            &requested_initial_voltages,
        )?;

        let mut previous_cap_voltages: Vec<f64> = capacitors
            .iter()
            .map(|(n1, n2, _, _)| initial.node_voltages[*n1] - initial.node_voltages[*n2])
            .collect();
        let mut node_voltages = vec![initial.node_voltages];
        let mut source_currents = vec![initial.source_currents];

        for time_index in 1..times.len() {
            let dt = times[time_index] - times[time_index - 1];
            let size = num_node_unknowns + num_voltage_sources;
            let (mut a, mut b) = (
                DMatrix::<f64>::zeros(size, size),
                DVector::<f64>::zeros(size),
            );
            let is_switch_event = self.has_switch_event_at(times[time_index]);
            self.stamp_static(&mut a, &mut b, times[time_index], !is_switch_event);
            for (index, (n1, n2, capacitance, _)) in capacitors.iter().enumerate() {
                let conductance = capacitance / dt;
                stamp_conductance(&mut a, *n1, *n2, conductance);
                // Backward Euler: i = G * (v_now - v_previous).
                if let Some(i1) = node_unknown(*n1) {
                    b[i1] += conductance * previous_cap_voltages[index];
                }
                if let Some(i2) = node_unknown(*n2) {
                    b[i2] -= conductance * previous_cap_voltages[index];
                }
            }

            let x = a.lu().solve(&b).ok_or(CircuitError::SingularMatrix)?;
            let mut solution = unpack_solution(x, self.node_count, num_voltage_sources)?;
            for (index, (n1, n2, _, _)) in capacitors.iter().enumerate() {
                previous_cap_voltages[index] =
                    solution.node_voltages[*n1] - solution.node_voltages[*n2];
            }
            if is_switch_event {
                // Advance to the event using the old topology, then apply the
                // switch without allowing capacitor voltages to jump.
                solution = self.solve_with_capacitor_constraints(
                    times[time_index],
                    num_voltage_sources,
                    &capacitors,
                    &previous_cap_voltages,
                )?;
            }
            node_voltages.push(solution.node_voltages);
            source_currents.push(solution.source_currents);
        }

        Ok(TransientSolution {
            times,
            node_voltages,
            source_currents,
        })
    }

    fn solve_with_capacitor_constraints(
        &self,
        time: f64,
        num_voltage_sources: usize,
        capacitors: &[CapacitorData],
        capacitor_voltages: &[f64],
    ) -> Result<Solution, CircuitError> {
        let num_node_unknowns = self.node_count - 1;
        let mut constraints = VoltageConstraints::new(self.node_count);
        for component in &self.components {
            if let Component::VoltageSource {
                n_pos,
                n_neg,
                voltage,
            } = component
            {
                constraints.add(*n_pos, *n_neg, *voltage)?;
            }
        }
        let mut independent_capacitors = Vec::new();
        for (index, ((n1, n2, _, _), voltage)) in
            capacitors.iter().zip(capacitor_voltages).enumerate()
        {
            if constraints.add(*n1, *n2, *voltage)? {
                independent_capacitors.push(index);
            }
        }

        let size = num_node_unknowns + num_voltage_sources + independent_capacitors.len();
        let (mut a, mut b) = (
            DMatrix::<f64>::zeros(size, size),
            DVector::<f64>::zeros(size),
        );
        self.stamp_static(&mut a, &mut b, time, true);
        for (branch_index, capacitor_index) in independent_capacitors.iter().enumerate() {
            let (n1, n2, _, _) = capacitors[*capacitor_index];
            stamp_voltage_source(
                &mut a,
                &mut b,
                n1,
                n2,
                num_node_unknowns + num_voltage_sources + branch_index,
                capacitor_voltages[*capacitor_index],
            );
        }
        let x = a.lu().solve(&b).ok_or(CircuitError::SingularMatrix)?;
        unpack_solution(x, self.node_count, num_voltage_sources)
    }

    fn stamp_static(
        &self,
        a: &mut DMatrix<f64>,
        b: &mut DVector<f64>,
        time: f64,
        include_switch_events_at_time: bool,
    ) {
        let num_node_unknowns = self.node_count - 1;
        let mut vsrc_index = 0;
        for component in &self.components {
            match component {
                Component::Resistor { n1, n2, resistance } => {
                    stamp_conductance(a, *n1, *n2, 1.0 / resistance);
                }
                Component::CurrentSource {
                    n_from,
                    n_to,
                    current,
                } => {
                    stamp_current_source(b, *n_from, *n_to, *current);
                }
                Component::VoltageSource {
                    n_pos,
                    n_neg,
                    voltage,
                } => {
                    stamp_voltage_source(
                        a,
                        b,
                        *n_pos,
                        *n_neg,
                        num_node_unknowns + vsrc_index,
                        *voltage,
                    );
                    vsrc_index += 1;
                }
                Component::Switch {
                    n1,
                    n2,
                    on_resistance,
                    off_resistance,
                    ..
                } => {
                    let closed = if include_switch_events_at_time {
                        component.switch_is_closed_at(time).unwrap()
                    } else {
                        component.switch_is_closed_before(time).unwrap()
                    };
                    let resistance = if closed {
                        on_resistance
                    } else {
                        off_resistance
                    };
                    stamp_conductance(a, *n1, *n2, 1.0 / resistance);
                }
                Component::Capacitor { .. } => {}
            }
        }
    }

    fn has_switch_event_at(&self, time: f64) -> bool {
        self.components.iter().any(|component| {
            matches!(
                component,
                Component::Switch { transitions, .. }
                    if transitions.iter().any(|transition| transition.time == time)
            )
        })
    }

    fn transient_times(&self, config: TransientConfig) -> Result<Vec<f64>, CircuitError> {
        if !config.start_time.is_finite()
            || !config.stop_time.is_finite()
            || !config.time_step.is_finite()
            || config.stop_time <= config.start_time
            || config.time_step <= 0.0
        {
            return Err(CircuitError::InvalidTransientConfig(
                "times must be finite, stop_time must exceed start_time, and time_step must be > 0"
                    .into(),
            ));
        }
        let regular_steps = ((config.stop_time - config.start_time) / config.time_step).ceil();
        if regular_steps > MAX_TRANSIENT_POINTS as f64 {
            return Err(CircuitError::InvalidTransientConfig(format!(
                "simulation exceeds the limit of {MAX_TRANSIENT_POINTS} samples"
            )));
        }

        // Insert events before regular samples so exact event values survive
        // tolerance-based de-duplication of values such as 0.3 and 3 * 0.1.
        let mut times = Vec::with_capacity(regular_steps as usize + 2);
        for component in &self.components {
            if let Component::Switch { transitions, .. } = component {
                times.extend(
                    transitions
                        .iter()
                        .map(|transition| transition.time)
                        .filter(|time| *time > config.start_time && *time < config.stop_time),
                );
            }
        }
        times.push(config.start_time);
        for index in 1..regular_steps as usize {
            let time = config.start_time + index as f64 * config.time_step;
            if time < config.stop_time {
                times.push(time);
            }
        }
        times.push(config.stop_time);
        times.sort_by(f64::total_cmp);
        let tolerance = f64::EPSILON
            * 16.0
            * config
                .start_time
                .abs()
                .max(config.stop_time.abs())
                .max(config.time_step);
        times.dedup_by(|a, b| (*a - *b).abs() <= tolerance);
        if times.len() > MAX_TRANSIENT_POINTS {
            return Err(CircuitError::InvalidTransientConfig(format!(
                "simulation exceeds the limit of {MAX_TRANSIENT_POINTS} samples after switch events"
            )));
        }
        Ok(times)
    }
}

#[cfg(test)]
mod tests {
    use crate::{Circuit, CircuitError, Component, SwitchTransition, TransientConfig};

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

    #[test]
    fn rc_charge_matches_backward_euler_response() {
        let mut circuit = Circuit::new();
        let supply = circuit.add_node();
        let output = circuit.add_node();
        let resistance = 1_000.0;
        let capacitance = 1.0e-6;
        let tau = resistance * capacitance;
        let dt = tau / 20.0;

        circuit
            .add_component(Component::VoltageSource {
                n_pos: supply,
                n_neg: 0,
                voltage: 5.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1: supply,
                n2: output,
                resistance,
            })
            .unwrap();
        circuit
            .add_component(Component::Capacitor {
                n1: output,
                n2: 0,
                capacitance,
                initial_voltage: 0.0,
            })
            .unwrap();

        let result = circuit
            .solve_transient(TransientConfig {
                start_time: 0.0,
                stop_time: 5.0 * tau,
                time_step: dt,
            })
            .unwrap();

        assert_eq!(result.node_voltages[0][output], 0.0);
        let tau_index = result
            .times
            .iter()
            .position(|time| (*time - tau).abs() < 1.0e-12)
            .unwrap();
        let expected_at_tau = 5.0 * (1.0 - (-1.0_f64).exp());
        assert!((result.node_voltages[tau_index][output] - expected_at_tau).abs() < 0.06);
        assert!((result.node_voltages.last().unwrap()[output] - 5.0).abs() < 0.05);
    }

    #[test]
    fn switch_transition_is_an_exact_sample() {
        let mut circuit = Circuit::new();
        let supply = circuit.add_node();
        let output = circuit.add_node();
        let event_time = 0.00035;

        circuit
            .add_component(Component::VoltageSource {
                n_pos: supply,
                n_neg: 0,
                voltage: 10.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Switch {
                n1: supply,
                n2: output,
                initially_closed: false,
                on_resistance: 1.0e-3,
                off_resistance: 1.0e9,
                transitions: vec![SwitchTransition {
                    time: event_time,
                    closed: true,
                }],
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1: output,
                n2: 0,
                resistance: 1_000.0,
            })
            .unwrap();

        let result = circuit
            .solve_transient(TransientConfig {
                start_time: 0.0,
                stop_time: 0.0006,
                time_step: 0.0002,
            })
            .unwrap();
        let event_index = result
            .times
            .iter()
            .position(|time| *time == event_time)
            .unwrap();

        assert!(result.node_voltages[event_index - 1][output] < 0.001);
        assert!(result.node_voltages[event_index][output] > 9.99);
    }

    #[test]
    fn parallel_capacitors_do_not_overconstrain_initialisation() {
        let mut circuit = Circuit::new();
        let node = circuit.add_node();
        circuit
            .add_component(Component::Resistor {
                n1: node,
                n2: 0,
                resistance: 1_000.0,
            })
            .unwrap();
        for _ in 0..2 {
            circuit
                .add_component(Component::Capacitor {
                    n1: node,
                    n2: 0,
                    capacitance: 1.0e-6,
                    initial_voltage: 2.0,
                })
                .unwrap();
        }

        let result = circuit
            .solve_transient(TransientConfig {
                start_time: 0.0,
                stop_time: 0.001,
                time_step: 0.001,
            })
            .unwrap();

        assert!((result.node_voltages[0][node] - 2.0).abs() < 1.0e-12);
        // Two parallel 1 uF capacitors give tau=2 ms. One 1 ms backward
        // Euler step therefore leaves 2 / (1 + dt/tau) = 4/3 V.
        assert!((result.node_voltages[1][node] - 4.0 / 3.0).abs() < 1.0e-12);
    }

    #[test]
    fn capacitor_voltage_is_continuous_when_switch_closes() {
        let mut circuit = Circuit::new();
        let supply = circuit.add_node();
        let switched = circuit.add_node();
        let output = circuit.add_node();
        let event_time = 0.0005;
        circuit
            .add_component(Component::VoltageSource {
                n_pos: supply,
                n_neg: 0,
                voltage: 5.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Switch {
                n1: supply,
                n2: switched,
                initially_closed: false,
                on_resistance: 1.0e-3,
                off_resistance: 1.0e12,
                transitions: vec![SwitchTransition {
                    time: event_time,
                    closed: true,
                }],
            })
            .unwrap();
        circuit
            .add_component(Component::Resistor {
                n1: switched,
                n2: output,
                resistance: 1_000.0,
            })
            .unwrap();
        circuit
            .add_component(Component::Capacitor {
                n1: output,
                n2: 0,
                capacitance: 1.0e-6,
                initial_voltage: 0.0,
            })
            .unwrap();

        let result = circuit
            .solve_transient(TransientConfig {
                start_time: 0.0,
                stop_time: 0.001,
                time_step: 0.0002,
            })
            .unwrap();
        let event_index = result
            .times
            .iter()
            .position(|time| *time == event_time)
            .unwrap();

        // The tiny residual is leakage through the finite off resistance,
        // not charging through the newly closed switch.
        assert!(result.node_voltages[event_index][output].abs() < 1.0e-8);
        assert!(result.node_voltages[event_index + 1][output] > 0.0);
    }

    #[test]
    fn rejects_invalid_transient_configuration() {
        let circuit = Circuit::new();
        let error = circuit
            .solve_transient(TransientConfig {
                start_time: 1.0,
                stop_time: 0.0,
                time_step: 0.1,
            })
            .unwrap_err();
        assert!(matches!(error, CircuitError::InvalidTransientConfig(_)));
    }
}
