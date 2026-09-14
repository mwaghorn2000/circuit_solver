use wasm_bindgen::prelude::*;

use crate::{Circuit, TransientConfig};

/// Solve a circuit described as a JSON array of components (see
/// `Circuit::from_json` for the expected shape) and return the solved
/// node voltages / source currents as JSON.
///
/// This is the single entry point JS calls into — it stays JSON-in,
/// JSON-out so the Rust-side types (`Component`, `Circuit`) never need to
/// cross the wasm-bindgen boundary directly.
#[wasm_bindgen]
pub fn solve_circuit(json: &str) -> Result<String, JsValue> {
    let circuit = Circuit::from_json(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let solution = circuit
        .solve()
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&solution).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Run a fixed-step transient analysis. Additional samples are inserted at
/// switch transition times so discontinuities are never skipped.
#[wasm_bindgen]
pub fn solve_transient_circuit(
    json: &str,
    start_time: f64,
    stop_time: f64,
    time_step: f64,
) -> Result<String, JsValue> {
    let circuit = Circuit::from_json(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let solution = circuit
        .solve_transient(TransientConfig {
            start_time,
            stop_time,
            time_step,
        })
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&solution).map_err(|e| JsValue::from_str(&e.to_string()))
}
