import { emptyGridState } from './grid'
import type { GridState, PlacedElement } from './grid'

export interface Mission {
  id: string; title: string; kind: 'Tune it' | 'Fix it' | 'Build it'
  brief: string; lesson: string; supply: number; count: number
  layout: 'single' | 'series' | 'parallel' | 'blank'
  initial: number[]; answer: number[]; voltage?: number; current?: number; maxCurrent?: number
  hints: string[]; explanation: string
  transient?: {
    edit: 'resistor' | 'capacitor'; resistance: number; capacitance: number
    initialVoltage: number; stop: number; switched?: boolean
    targets: { time: number; voltage: number; tolerance?: number; below?: boolean }[]
    currentLimit?: number
  }
}
export const missions: Mission[] = [
  { id: 'ohms-law', title: 'Set the current', kind: 'Tune it', layout: 'single', supply: 6, count: 1, initial: [1000], answer: [2000], current: 3,
    brief: 'Adjust the resistor so the 6 V supply delivers 3 mA (±0.05 mA).', lesson: 'Ohm’s law',
    hints: ['Increasing resistance reduces current.', 'Use R = V / I. Convert milliamps to amps first.', '6 / 0.003 = 2000 Ω.'],
    explanation: 'A 2 kΩ resistor draws 6 / 2000 = 0.003 A, or 3 mA. Voltage, resistance and current are linked by V = IR.' },
  { id: 'series', title: 'Share the resistance', kind: 'Tune it', layout: 'series', supply: 12, count: 2, initial: [1000,1000], answer: [2000,4000], current: 2,
    brief: 'Choose two series resistors that draw 2 mA (±0.05 mA) from 12 V.', lesson: 'Series resistance',
    hints: ['The same current flows through both resistors.', 'Series resistances add: Rtotal = R1 + R2.', 'You need 6 kΩ in total. Try 2 kΩ and 4 kΩ.'],
    explanation: '12 V / 2 mA = 6 kΩ total resistance. Any allowed pair adding to 6 kΩ works; the current is the same through both.' },
  { id: 'half', title: 'Find the midpoint', kind: 'Tune it', layout: 'series', supply: 12, count: 2, initial: [1000,3000], answer: [3000,3000], voltage: 6,
    brief: 'Make the marked output 6 V (±0.2 V) from a 12 V supply.', lesson: 'Voltage division',
    hints: ['The output is measured across the lower resistor.', 'Vout = Vin × Rlower / (Rupper + Rlower).', 'Equal resistors split the voltage equally.'],
    explanation: 'Equal resistors produce half the supply voltage. Their ratio sets the output; their total resistance sets the supply current.' },
  { id: 'third', title: 'Choose the ratio', kind: 'Tune it', layout: 'series', supply: 12, count: 2, initial: [3000,3000], answer: [4000,2000], voltage: 4,
    brief: 'Produce 4 V (±0.2 V) at the marked output.', lesson: 'Divider ratios',
    hints: ['The lower resistor needs one third of the total resistance.', 'The upper resistor must be twice the lower resistor.', 'Try 4 kΩ above the output and 2 kΩ below it.'],
    explanation: '12 × 2 / (4 + 2) = 4 V. Multiplying both resistors by the same factor preserves the output voltage.' },
  { id: 'parallel', title: 'Add a second path', kind: 'Tune it', layout: 'parallel', supply: 6, count: 2, initial: [1000,1000], answer: [2000,2000], current: 6,
    brief: 'Adjust the parallel resistors so the supply delivers 6 mA (±0.05 mA) in total.', lesson: 'Parallel resistance',
    hints: ['Each branch sees the full 6 V supply.', 'Total current is 6/R1 + 6/R2.', 'Two 2 kΩ resistors each draw 3 mA.'],
    explanation: 'Parallel branch currents add. Two 2 kΩ resistors have an equivalent resistance of 1 kΩ, drawing 6 mA from 6 V.' },
  { id: 'repair', title: 'Repair the sensor reference', kind: 'Fix it', layout: 'series', supply: 9, count: 2, initial: [2000,6000], answer: [6000,3000], voltage: 3,
    brief: 'This reference circuit produces the wrong voltage. Repair its resistor values to produce 3 V (±0.2 V).', lesson: 'Diagnose a divider',
    hints: ['A large lower resistor pulls the output toward the supply voltage.', 'For one third of the supply, the upper resistor should be twice the lower.', '6 kΩ above and 3 kΩ below gives 3 V.'],
    explanation: 'The original ratio put too much voltage across the lower resistor. A 2:1 upper-to-lower ratio restores the 3 V reference.' },
  { id: 'efficient', title: 'Keep the voltage, cut the current', kind: 'Fix it', layout: 'series', supply: 12, count: 2, initial: [2000,1000], answer: [20000,10000], voltage: 4, maxCurrent: 1,
    brief: 'The output is already 4 V. Keep it within ±0.2 V while reducing supply current below 1 mA.', lesson: 'Ratio versus total resistance',
    hints: ['Preserve the resistor ratio while increasing their values.', 'Current = 12 / (Rupper + Rlower). The total must exceed 12 kΩ.', '20 kΩ and 10 kΩ give 4 V and 0.4 mA.'],
    explanation: 'Scaling both resistors equally preserves the divider ratio while reducing current. This model assumes an unloaded output.' },
  { id: 'build-divider', title: 'Build your first reference', kind: 'Build it', layout: 'blank', supply: 10, count: 2, initial: [], answer: [10000,10000], voltage: 5,
    brief: 'Start from an empty board. Use one 10 V voltage supply and exactly two resistors to produce 5 V (±0.2 V). Place ground and an output marker.', lesson: 'Independent construction',
    hints: ['Connect two resistors in series across the supply.', 'Ground the negative supply terminal and connect the lower resistor to it. Mark the resistor junction as output.', 'Use two 10 kΩ resistors. The output at their junction is 5 V.'],
    explanation: 'A pair of equal series resistors divides 10 V into two 5 V drops. The output must be taken at their junction relative to ground.' },
  { id: 'final', title: 'Design a low-current reference', kind: 'Build it', layout: 'blank', supply: 12, count: 2, initial: [], answer: [20000,10000], voltage: 4, maxCurrent: 1,
    brief: 'Design a 4 V reference (±0.2 V) from one 12 V supply using exactly two resistors. Draw less than 1 mA. Add ground and mark the output.', lesson: 'Final design challenge',
    hints: ['Solve the voltage ratio and current limit separately.', 'Use a 2:1 upper-to-lower ratio with more than 12 kΩ total resistance.', 'One solution is 20 kΩ above the output and 10 kΩ below it.'],
    explanation: '20 kΩ and 10 kΩ give 12 × 10/30 = 4 V and 12/30000 = 0.4 mA. Many other values satisfy both requirements. You have completed the DC resistor path!' },
]
export function starter(m: Mission, solution = false): GridState {
  if (m.transient) {
    const t = m.transient
    const value = (solution ? m.answer : m.initial)[0]
    const elements = new Map<string, PlacedElement>([
      ['3,2', { type: 'voltage', value: m.supply }],
      ['2,3', { type: 'wire', value: 0 }],
      ['2,5', { type: 'resistor', value: t.edit === 'resistor' ? value : t.resistance }],
      ['3,6', { type: 'capacitor', value: t.edit === 'capacitor' ? value : t.capacitance, initialVoltage: t.initialVoltage }],
      ['4,3', { type: 'wire', value: 0 }],
      ['4,5', { type: 'wire', value: 0 }],
    ])
    if (t.switched) {
      // A shunt discharge resistor provides a return path after disconnecting the supply.
      elements.set('2,3', { type: 'switch', value: 0, initiallyClosed: true, transitionTimes: [0.3] })
      elements.set('2,7', { type: 'wire', value: 0 })
      elements.set('3,8', { type: 'resistor', value: 10000 })
      elements.set('4,7', { type: 'wire', value: 0 })
    }
    return { elements, ground: new Set(['4,2']), output: '2,6' }
  }
  if (m.layout === 'blank' && !solution) return emptyGridState()
  const values = solution ? m.answer : m.initial
  const elements = new Map<string, PlacedElement>()
  const put = (k: string, type: PlacedElement['type'], value = 0) => elements.set(k, {type, value})
  put('3,2','voltage',m.supply)
  put('2,3','wire'); put('4,3','wire')
  if (m.layout === 'single') put('3,4','resistor',values[0])
  else if (m.layout === 'parallel') {
    put('3,4','resistor',values[0]); put('2,5','wire'); put('4,5','wire'); put('3,6','resistor',values[1])
  } else {
    put('2,5','resistor',values[0]); put('3,6','resistor',values[1]); put('4,5','wire')
  }
  return {elements, ground: new Set(['4,2']), output: m.layout === 'single' || m.layout === 'parallel' ? '2,4' : '2,6'}
}
export interface Check { label: string; pass: boolean }
export interface Solution { node_voltages: number[]; source_currents: number[] }
export function requirements(m: Mission, grid: GridState): Check[] {
  if (m.transient) {
    const expected = starter(m)
    const editableKey = m.transient.edit === 'resistor' ? '2,5' : '3,6'
    const valid = grid.elements.size === expected.elements.size && [...expected.elements].every(([key, part]) => {
      const actual = grid.elements.get(key)
      return actual !== undefined && JSON.stringify({ ...actual, value: key === editableKey ? part.value : actual.value }) === JSON.stringify(part)
    }) && grid.output === expected.output && grid.ground.size === 1 && grid.ground.has('4,2')
    const value = grid.elements.get(editableKey)?.value ?? NaN
    return [
      { label: 'Keep the supplied wiring, sources and initial conditions', pass: valid },
      { label: m.transient.edit === 'resistor' ? 'Resistance: 100 Ω–1 MΩ' : 'Capacitance: 1 nF–1 mF',
        pass: Number.isFinite(value) && value >= (m.transient.edit === 'resistor' ? 100 : 1e-9) && value <= (m.transient.edit === 'resistor' ? 1e6 : 1e-3) },
    ]
  }
  const parts = [...grid.elements.values()]
  const resistors = parts.filter(p => p.type === 'resistor')
  const sources = parts.filter(p => p.type === 'voltage')
  return [
    {label: `Exactly ${m.count} resistor${m.count === 1 ? '' : 's'}, each 1–100 kΩ`, pass: resistors.length === m.count && resistors.every(p => Number.isFinite(p.value) && p.value >= 1000 && p.value <= 100000)},
    {label: `One ${m.supply} V voltage supply; no current supplies`, pass: sources.length === 1 && sources[0].value === m.supply && !parts.some(p => p.type === 'current')},
    {label: 'Ground and output marker placed', pass: grid.ground.size > 0 && grid.output !== null},
  ]
}
export function measurements(m: Mission, solved: Solution, outputNode: number | null): Check[] {
  const voltage = outputNode === null ? NaN : solved.node_voltages[outputNode]
  const current = Math.abs(solved.source_currents[0]) * 1000
  const checks: Check[] = [{label: 'Output is connected to the solved circuit', pass: Number.isFinite(voltage)}]
  if (m.voltage !== undefined) checks.push({label: `Output: ${Number.isFinite(voltage) ? voltage.toFixed(3) : 'unavailable'} V / target ${m.voltage} V ±0.2 V`, pass: Number.isFinite(voltage) && Math.abs(voltage - m.voltage) <= 0.2 + 1e-9})
  if (m.current !== undefined) checks.push({label: `Supply current: ${current.toFixed(3)} mA / target ${m.current} ±0.05 mA`, pass: Number.isFinite(current) && Math.abs(current - m.current) <= 0.05 + 1e-9})
  if (m.maxCurrent !== undefined) checks.push({label: `Supply current: ${current.toFixed(3)} mA / below ${m.maxCurrent} mA`, pass: Number.isFinite(current) && current < m.maxCurrent})
  return checks
}
