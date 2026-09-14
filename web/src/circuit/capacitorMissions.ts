import type { Check, Mission } from './missions'

export const capacitorMissions: Mission[] = [
  {
    id: 'cap-tau-r', title: 'Set the time constant', kind: 'Tune it', layout: 'single', supply: 5, count: 1,
    initial: [2000], answer: [10000], lesson: 'τ = RC',
    brief: 'With C = 10 µF, choose R for a 100 ms time constant. At 100 ms the output should be 3.161 V ±0.05 V.',
    hints: ['After one time constant, a charging capacitor reaches 63.2% of its final voltage.', 'Use R = τ / C. Convert milliseconds and microfarads to seconds and farads.', '0.1 / 0.00001 = 10,000 Ω.'],
    explanation: 'R = 10 kΩ and C = 10 µF give τ = 100 ms. After one τ, the output is 5 × (1 − exp(−1)) ≈ 3.161 V.',
    transient: { edit: 'resistor', resistance: 10000, capacitance: 1e-5, initialVoltage: 0, stop: 0.5, targets: [{ time: 0.1, voltage: 5 * (1 - Math.exp(-1)), tolerance: 0.05 }] },
  },
  {
    id: 'cap-tau-c', title: 'Choose the capacitor', kind: 'Tune it', layout: 'single', supply: 5, count: 1,
    initial: [2e-6], answer: [1e-5], lesson: 'Capacitance and timing',
    brief: 'With R = 20 kΩ, choose C for a 200 ms time constant. Target 3.161 V ±0.05 V at 200 ms.',
    hints: ['Increasing C slows the response.', 'Rearrange τ = RC to C = τ / R.', '0.2 / 20,000 = 0.00001 F, or 10 µF.'],
    explanation: 'C = 10 µF gives τ = 20,000 × 0.00001 = 0.2 s.',
    transient: { edit: 'capacitor', resistance: 20000, capacitance: 1e-5, initialVoltage: 0, stop: 1, targets: [{ time: 0.2, voltage: 5 * (1 - Math.exp(-1)), tolerance: 0.05 }] },
  },
  {
    id: 'cap-charge', title: 'Reach 3 V on time', kind: 'Tune it', layout: 'single', supply: 5, count: 1,
    initial: [3e-5], answer: [0.1 / (10000 * -Math.log(0.4))], lesson: 'Charging curve',
    brief: 'Choose C so the output is 3 V ±0.05 V at 100 ms. The supply is 5 V and R = 10 kΩ.',
    hints: ['Use V(t) = Vs × (1 − exp(−t/RC)).', 'At 3 V, the remaining gap to 5 V is 40% of the initial gap.', 'C = −0.1 / (10,000 × ln(0.4)) ≈ 10.914 µF.'],
    explanation: 'A capacitor of approximately 10.914 µF reaches 3 V after 100 ms through 10 kΩ.',
    transient: { edit: 'capacitor', resistance: 10000, capacitance: 1e-5, initialVoltage: 0, stop: 0.5, targets: [{ time: 0.1, voltage: 3, tolerance: 0.05 }] },
  },
  {
    id: 'cap-discharge', title: 'Discharge below 1 V', kind: 'Tune it', layout: 'single', supply: 0, count: 1,
    initial: [20000], answer: [6000], lesson: 'Discharge threshold',
    brief: 'A 10 µF capacitor starts at 5 V. Choose R so it falls below 1 V by 100 ms. The 0 V source provides the return path.',
    hints: ['Discharge follows V(t) = Vinitial × exp(−t/RC).', 'Solve 1/5 = exp(−0.1/RC). A smaller R discharges faster.', 'The boundary is about 6.21 kΩ. Try 6 kΩ for some margin.'],
    explanation: 'At 6 kΩ, τ = 60 ms and V(100 ms) ≈ 0.944 V. A capacitor approaches zero asymptotically; “discharged” needs a voltage threshold.',
    transient: { edit: 'resistor', resistance: 6000, capacitance: 1e-5, initialVoltage: 5, stop: 0.3, targets: [{ time: 0.1, voltage: 1, below: true }] },
  },
  {
    id: 'cap-current', title: 'Fast enough, gentle enough', kind: 'Tune it', layout: 'single', supply: 5, count: 1,
    initial: [1000], answer: [5100], lesson: 'Timing and current limits',
    brief: 'With C = 10 µF, reach at least 4.5 V by 120 ms while keeping initial supply current below 1 mA. Choose R.',
    hints: ['Initial charging current is 5/R. Keeping it below 1 mA requires R > 5 kΩ.', 'Reaching 90% takes approximately 2.303RC.', 'The timing limit allows roughly R ≤ 5.21 kΩ. Try 5.1 kΩ.'],
    explanation: 'At 5.1 kΩ, initial current is about 0.980 mA and the capacitor reaches 90% in about 117.4 ms.',
    transient: { edit: 'resistor', resistance: 5100, capacitance: 1e-5, initialVoltage: 0, stop: 0.3, currentLimit: 0.001, targets: [{ time: 0.12, voltage: 4.5 }] },
  },
  {
    id: 'cap-switch', title: 'Charge, disconnect, discharge', kind: 'Tune it', layout: 'single', supply: 5, count: 2,
    initial: [5e-5], answer: [1e-5], lesson: 'Switched response',
    brief: 'Choose C to exceed 4.5 V at 300 ms, when the supply disconnects, then fall below 0.5 V at 600 ms. The charge resistor is 1 kΩ; the discharge resistor is 10 kΩ.',
    hints: ['The 10 kΩ discharge resistor is always connected. With the switch closed, it forms a divider with 1 kΩ.', 'The charging limit is 5 × 10/11 ≈ 4.545 V. After opening, discharge has τ = 10,000C.', 'Try 10 µF. It charges quickly, then discharges to roughly 0.226 V after another 300 ms.'],
    explanation: 'The shunt resistor provides a discharge path after the switch opens. With C = 10 µF, discharge τ = 100 ms; three time constants reduce 4.545 V to about 0.226 V.',
    transient: { edit: 'capacitor', resistance: 1000, capacitance: 1e-5, initialVoltage: 0, stop: 0.6, switched: true, targets: [{ time: 0.3, voltage: 4.5 }, { time: 0.6, voltage: 0.5, below: true }] },
  },
]

export interface TransientResult {
  times: number[]; node_voltages: number[][]; source_currents: number[][]
}

export function capacitorMeasurements(m: Mission, solved: TransientResult, output: number | null): Check[] {
  const t = m.transient!
  const valid = output !== null && solved.times.length > 1
    && solved.times.length === solved.node_voltages.length
    && solved.node_voltages.every(row => Number.isFinite(row[output]))
  const checks: Check[] = [{ label: 'Output is connected to the simulated circuit', pass: valid }]
  for (const target of t.targets) {
    const index = solved.times.findIndex(time => time >= target.time - 1e-10)
    const value = valid && index >= 0 ? solved.node_voltages[index][output!] : NaN
    const condition = target.tolerance !== undefined ? Math.abs(value - target.voltage) <= target.tolerance
      : target.below ? value < target.voltage : value >= target.voltage
    const goal = target.tolerance !== undefined ? `${target.voltage.toFixed(3)} V ±${target.tolerance} V` : `${target.below ? 'below' : 'at least'} ${target.voltage} V`
    checks.push({ label: `At ${target.time * 1000} ms: ${Number.isFinite(value) ? value.toFixed(3) + ' V' : 'unavailable'} / ${goal}`, pass: Number.isFinite(value) && condition })
  }
  if (t.currentLimit !== undefined) {
    const current = Math.abs(solved.source_currents[0]?.[0])
    checks.push({ label: `Initial supply current: ${(current * 1000).toFixed(3)} mA / below ${t.currentLimit * 1000} mA`, pass: Number.isFinite(current) && current < t.currentLimit })
  }
  return checks
}
