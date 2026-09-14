# circuit_solver

Practice opens a problem-set picker with DC fundamentals (9 missions),
Capacitors and timing (6 missions), and Free Build. Progress is saved per
mission in this browser, and the Problem sets button returns to the picker.

The capacitor set covers selecting R or C for a time constant, charging to a
target voltage, discharge thresholds, timing with an initial-current limit,
and a switched charge/discharge circuit. Click the requested component to edit
its value; wiring, initial conditions, and simulation timing stay fixed.
Checking a design shows the waveform and grades the specified voltage/current
conditions. Each mission includes hints and a worked answer. Capacitor values
are entered in farads (for example, 10 µF = 0.00001 F).

The Rust core supports DC modified nodal analysis and fixed-step transient
analysis with capacitors and scheduled resistive switches. Transient capacitor
integration uses backward Euler, and switch event times are inserted as exact
samples even when they fall between regular time steps.

```json
[
  { "type": "voltage_source", "n_pos": 1, "n_neg": 0, "voltage": 5.0 },
  {
    "type": "switch", "n1": 1, "n2": 2,
    "transitions": [{ "time": 0.001, "closed": true }]
  },
  { "type": "resistor", "n1": 2, "n2": 3, "resistance": 1000.0 },
  {
    "type": "capacitor", "n1": 3, "n2": 0,
    "capacitance": 0.000001, "initial_voltage": 0.0
  }
]
```

Rust callers can use `Circuit::solve_dc()` or
`Circuit::solve_transient(TransientConfig)`. JavaScript callers can use
`solve_circuit(json)` or
`solve_transient_circuit(json, startTime, stopTime, timeStep)`.
