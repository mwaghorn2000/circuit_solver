use wasm_bindgen::prelude::*;

use crate::Circuit;

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
    let solution = circuit.solve().map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&solution).map_err(|e| JsValue::from_str(&e.to_string()))
}
