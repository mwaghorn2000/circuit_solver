import { useEffect, useRef, useState } from 'react'
import init, { solve_circuit, solve_transient_circuit } from 'circuit_solver'
import CircuitGrid from '../components/CircuitGrid'
import TransientPlot from '../components/TransientPlot'
import { buildCircuitJson, emptyGridState, isBuildError } from '../circuit/grid'
import type { GridState, Tool } from '../circuit/grid'
import { missions as dcMissions, starter, requirements, measurements } from '../circuit/missions'
import { capacitorMissions, capacitorMeasurements } from '../circuit/capacitorMissions'
import type { Mission } from '../circuit/missions'
import type { Check, Solution } from '../circuit/missions'
import './Practice.css'

const tools: { key: string; tool: Tool; label: string }[] = [
  {key:'r',tool:'resistor',label:'Resistor'}, {key:'v',tool:'voltage',label:'Voltage supply'},
  {key:'w',tool:'wire',label:'Wire'}, {key:'g',tool:'ground',label:'Ground'}, {key:'o',tool:'output',label:'Output'},
]
const sandboxTools: { key: string; tool: Tool; label: string }[] = [
  {key:'i',tool:'current',label:'Current supply'},
  {key:'c',tool:'capacitor',label:'Capacitor'},
  {key:'s',tool:'switch',label:'Timed switch'},
]
interface TransientSolution {
  times: number[]
  node_voltages: number[][]
  source_currents: number[][]
}
const STORAGE = 'circuit-practice-v1'
function readProgress(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]')
    return Array.isArray(value) ? [...dcMissions, ...capacitorMissions].filter(m => value.includes(m.id)).map(m => m.id) : []
  } catch { return [] }
}
let wasmReady: Promise<unknown> | null = null
function ensureWasm() {
  if (!wasmReady) wasmReady = init().catch(error => { wasmReady = null; throw error })
  return wasmReady
}

export default function Practice() {
  const [set, setSet] = useState<'dc' | 'capacitors' | 'free' | null>(null)
  const progress = readProgress()
  if (set !== null) return <PracticeWorkspace
    key={set}
    missions={set === 'capacitors' ? capacitorMissions : dcMissions}
    title={set === 'capacitors' ? 'Capacitors and timing' : 'DC fundamentals'}
    free={set === 'free'}
    onBack={() => setSet(null)}
  />
  return <section className="problem-set-picker">
    <p className="eyebrow">PRACTICE</p>
    <h1>Choose a problem set</h1>
    <p>Build your understanding one circuit at a time. Start anywhere and return to your saved progress.</p>
    <div className="problem-set-cards">
      <button onClick={() => setSet('dc')}>
        <span className="set-number">01 / RESISTORS</span>
        <h2>DC fundamentals</h2>
        <p>Ohm’s law, voltage dividers, parallel circuits and design constraints.</p>
        <span>{dcMissions.filter(m => progress.includes(m.id)).length} / {dcMissions.length} complete →</span>
      </button>
      <button onClick={() => setSet('capacitors')}>
        <span className="set-number">02 / TRANSIENTS</span>
        <h2>Capacitors and timing</h2>
        <p>Time constants, charging, discharge thresholds and timed switches.</p>
        <span>{capacitorMissions.filter(m => progress.includes(m.id)).length} / {capacitorMissions.length} complete →</span>
      </button>
      <button onClick={() => setSet('free')}>
        <span className="set-number">SANDBOX</span>
        <h2>Free build</h2>
        <p>Explore your own circuits with DC and transient analysis.</p>
        <span>Open the editor →</span>
      </button>
    </div>
  </section>
}

function PracticeWorkspace({ missions, title, free, onBack }: { missions: Mission[]; title: string; free: boolean; onBack: () => void }) {
  const [completed, setCompleted] = useState(readProgress)
  const [selected, setSelected] = useState(() => {
    const done = readProgress()
    const next = missions.findIndex(m => !done.includes(m.id))
    return next < 0 ? missions.length - 1 : next
  })
  const [sandbox, setSandbox] = useState(free)
  const mission = missions[selected]
  const [grid, setGrid] = useState<GridState>(() => free ? emptyGridState() : starter(mission))
  const [tool, setTool] = useState<Tool>('wire')
  const [checks, setChecks] = useState<Check[]>([])
  const [message, setMessage] = useState('')
  const [hintCount, setHintCount] = useState(0)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const [passed, setPassed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [analysis, setAnalysis] = useState<'dc' | 'transient'>('dc')
  const [stopTime, setStopTime] = useState('0.01')
  const [timeStep, setTimeStep] = useState('0.0001')
  const [transient, setTransient] = useState<{ times: number[]; voltages: number[] } | null>(null)
  const revision = useRef(0)
  const guided = !sandbox && mission.kind !== 'Build it'
  const capMission = !sandbox ? mission.transient : undefined
  const completedCount = missions.filter(m => completed.includes(m.id)).length

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || target?.closest('input, textarea, select, [contenteditable]')) return
      const next = [...tools, ...(sandbox ? sandboxTools : [])].find(t => t.key === e.key.toLowerCase())
      if (next && !guided) {
        setTool(next.tool)
        if (next.tool === 'capacitor' || next.tool === 'switch') setAnalysis('transient')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [guided, sandbox])
  useEffect(() => () => { revision.current += 1 }, [])

  function updateGrid(next: GridState) {
    revision.current += 1
    setGrid(next); setChecks([]); setMessage(''); setPassed(false); setBusy(false); setTransient(null)
  }
  function selectMission(index: number, free = false) {
    setTool('wire')
    setSelected(index); setSandbox(free); setHintCount(0); setSolutionOpen(false); setAnalysis('dc')
    updateGrid(free ? emptyGridState() : starter(missions[index]))
  }
  function finishMission(results: Check[]) {
    setChecks(results)
    const success = results.every(c => c.pass)
    setPassed(success)
    setMessage(success ? 'Mission complete. Your design meets every requirement.' : 'Keep experimenting. Use the measurements below or reveal a hint.')
    if (success) {
      const next = [...new Set([...completed, mission.id])]
      setCompleted(next)
      try { localStorage.setItem(STORAGE, JSON.stringify(next)); setSaveError(false) } catch { setSaveError(true) }
    }
  }
  async function checkDesign() {
    const version = ++revision.current
    setBusy(true); setMessage(''); setPassed(false); setTransient(null)
    const initial = sandbox ? [] : requirements(mission, grid)
    setChecks(initial)
    const built = buildCircuitJson(grid)
    if (isBuildError(built)) {
      setMessage(built.kind === 'no-ground' ? 'Add a ground marker at your reference node before checking.' : 'Add circuit components, then connect them with wires.')
      setBusy(false); return
    }
    try {
      await ensureWasm()
      if (version !== revision.current) return
      if (capMission) {
        const solved: TransientSolution = JSON.parse(solve_transient_circuit(built.json, 0, capMission.stop, 0.0001))
        const voltages = solved.node_voltages.map(sample => sample[built.outputNode ?? -1])
        if (voltages.every(Number.isFinite)) setTransient({ times: solved.times, voltages })
        finishMission([...initial, ...capacitorMeasurements(mission, solved, built.outputNode)])
        return
      }
      if (sandbox && analysis === 'transient') {
        const stop = Number(stopTime)
        const step = Number(timeStep)
        if (!Number.isFinite(stop) || !Number.isFinite(step) || stop <= 0 || step <= 0 || step > stop) {
          throw new Error('Choose positive simulation times, with the time step no larger than the stop time.')
        }
        if (built.outputNode === null) throw new Error('Place an output marker on the node you want to plot.')
        const solved: TransientSolution = JSON.parse(solve_transient_circuit(built.json, 0, stop, step))
        const voltages = solved.node_voltages.map(sample => sample[built.outputNode as number])
        if (!solved.times.every(Number.isFinite) || !voltages.every(Number.isFinite)
          || !solved.source_currents.every(sample => sample.every(Number.isFinite))) {
          throw new Error('The transient solver returned a non-finite result.')
        }
        setTransient({ times: solved.times, voltages })
        const peak = voltages.reduce((largest, voltage) => Math.max(largest, Math.abs(voltage)), 0)
        setMessage(`Transient complete: ${solved.times.length} samples. Final output ${voltages.at(-1)?.toFixed(4)} V; peak magnitude ${peak.toFixed(4)} V.`)
        return
      }

      const solved: Solution = JSON.parse(solve_circuit(built.json))
      if (!solved.node_voltages.every(Number.isFinite) || !solved.source_currents.every(Number.isFinite)) throw new Error('Non-finite solution')
      if (sandbox) {
        const voltage = built.outputNode === null ? undefined : solved.node_voltages[built.outputNode]
        setMessage(`Output: ${voltage === undefined ? 'place a connected output marker' : voltage.toFixed(4) + ' V'}. Supply currents: ${solved.source_currents.map(i => (Math.abs(i)*1000).toFixed(3) + ' mA').join(', ')}`)
      } else {
        finishMission([...initial, ...measurements(mission, solved, built.outputNode)])
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setTransient(null)
      setMessage(detail && !detail.includes('unreachable')
        ? detail
        : 'This circuit could not be solved. Check for disconnected branches, a missing return path to ground, or a short across the supply.')
    } finally {
      if (version === revision.current) setBusy(false)
    }
  }

  return <div className="practice learning-practice">
    <aside className="learning-path" aria-label="Learning path">
      <button onClick={onBack}>← Problem sets</button>
      <p className="eyebrow">PRACTICE</p>
      <h1>{title}</h1>
      <p>Learn by making circuits work.</p>
      <label className="progress-label" htmlFor="path-progress">{completedCount} / {missions.length} missions complete</label>
      <progress id="path-progress" max={missions.length} value={completedCount} />
      <nav aria-label="Missions">
        {missions.map((m, index) => <button key={m.id} className={!sandbox && selected === index ? 'mission-link active' : 'mission-link'} aria-current={!sandbox && selected === index ? 'step' : undefined} onClick={() => selectMission(index)}>
          <span className="mission-number">{completed.includes(m.id) ? '✓' : String(index + 1).padStart(2,'0')}</span>
          <span>{m.title}<small>{m.kind} · {m.lesson}</small></span>
        </button>)}
      </nav>
      <button className={sandbox ? 'mission-link active' : 'mission-link'} onClick={() => selectMission(selected, true)}>Free build <small>Explore with the solver</small></button>
      <p className="path-note">Progress is saved on this browser. You can revisit or skip ahead to any mission.</p>
      {saveError && <p role="status">Browser storage is unavailable. Progress will last for this session only.</p>}
    </aside>
    <section className="mission-workspace" aria-label="Circuit workspace">
      <header className="mission-brief">
        <p className="eyebrow">{sandbox ? 'SANDBOX' : `MISSION ${String(selected + 1).padStart(2,'0')} / ${mission.kind.toUpperCase()}`}</p>
        <h2>{sandbox ? 'Free build' : mission.title}</h2>
        <p>{sandbox ? 'Build a DC circuit or explore capacitor and timed-switch behaviour with transient analysis.' : mission.brief}</p>
        {capMission ? <p className="mission-limits">Click the {capMission.edit === 'resistor' ? 'top resistor' : 'capacitor'} to change its value in {capMission.edit === 'resistor' ? 'ohms (100–1,000,000 Ω)' : 'farads (1e-9–0.001 F; 10 µF = 0.00001 F)'}. Wiring, initial conditions and simulation timing are fixed.</p>
          : !sandbox && <p className="mission-limits">Use {mission.count} resistor{mission.count > 1 ? 's' : ''}, each 1–100 kΩ. {guided ? 'Wiring, supply and output are fixed. Click a resistor to edit its value in ohms.' : 'Use wires freely. Set the supply value in volts using its component menu.'}</p>}
      </header>
      <div className="mission-board"><CircuitGrid key={`${sandbox}-${selected}`} grid={grid} onGridChange={updateGrid} tool={tool} valuesOnly={guided} editableKeys={capMission ? [capMission.edit === 'resistor' ? '2,5' : '3,6'] : undefined} /></div>
      <div className="mission-tools">
        {!guided && <div className="controls">{[...tools, ...(sandbox ? sandboxTools : [])].map(t => <button key={t.tool} className={tool === t.tool ? 'tool active' : 'tool'} aria-pressed={tool === t.tool} onClick={() => { setTool(t.tool); if (t.tool === 'capacitor' || t.tool === 'switch') setAnalysis('transient') }}>[{t.key.toUpperCase()}] {t.label}</button>)}</div>}
        <p className="editor-instructions">{capMission ? 'Edit the requested component, then check your design to see its waveform and measurements.' : guided ? 'Click a resistor → enter resistance in Ω → Apply.' : 'Click between dots to place a component; click again to remove. Right-click to edit values, capacitor initial voltage, or switch toggle times. Place ground and output on dots.'}</p>
        {sandbox && <div className="analysis-controls">
          <div className="analysis-mode" role="group" aria-label="Analysis type">
            <button className={analysis === 'dc' ? 'active' : ''} aria-pressed={analysis === 'dc'} onClick={() => { setAnalysis('dc'); setTransient(null); setMessage('') }}>DC</button>
            <button className={analysis === 'transient' ? 'active' : ''} aria-pressed={analysis === 'transient'} onClick={() => { setAnalysis('transient'); setMessage('') }}>Transient</button>
          </div>
          {analysis === 'transient' && <div className="timing-fields">
            <label>Stop time (s)<input type="number" min="0" step="any" value={stopTime} onChange={e => { setStopTime(e.target.value); setTransient(null) }} /></label>
            <label>Time step (s)<input type="number" min="0" step="any" value={timeStep} onChange={e => { setTimeStep(e.target.value); setTransient(null) }} /></label>
          </div>}
        </div>}
        <div className="mission-actions">
          <button className="submit" disabled={busy} onClick={checkDesign}>{busy ? 'Solving…' : sandbox && analysis === 'transient' ? 'Run transient' : sandbox ? 'Solve DC' : 'Check design'}</button>
          <button onClick={() => { updateGrid(sandbox ? emptyGridState() : starter(mission)); setSolutionOpen(false) }}>Reset circuit</button>
          {!sandbox && hintCount < mission.hints.length && <button onClick={() => setHintCount(hintCount + 1)}>Reveal hint ({hintCount}/{mission.hints.length})</button>}
        </div>
      </div>
    </section>
    <aside className="mission-feedback" aria-label="Mission feedback">
      <h2>{sandbox ? 'Measurements' : 'Design checks'}</h2>
      {capMission && <p>Checks use the output waveform at the stated times. Discharging means reaching a threshold, not exactly zero volts.</p>}
      {!sandbox && !capMission && <ul className="requirements">
        <li>One {mission.supply} V supply; {mission.count} resistor{mission.count === 1 ? '' : 's'}</li>
        {mission.voltage !== undefined && <li>Output: {mission.voltage} V ±0.2 V</li>}
        {mission.current !== undefined && <li>Supply current: {mission.current} mA ±0.05 mA</li>}
        {mission.maxCurrent !== undefined && <li>Supply current below {mission.maxCurrent} mA</li>}
      </ul>}
      <div role="status" aria-live="polite">
        <p className={passed ? 'success' : ''}>{message || 'Run a check to see how your circuit performs.'}</p>
        <ul className="check-results">{checks.map(c => <li key={c.label} className={c.pass ? 'success' : 'needs-work'}>{c.pass ? '✓' : '×'} {c.label}</li>)}</ul>
      </div>
      {transient && <TransientPlot key={`${selected}-${transient.times.length}`} times={transient.times} voltages={transient.voltages} />}
      {!sandbox && <>
        {hintCount > 0 && <section><h3>Hints</h3><ol className="hints">{mission.hints.slice(0,hintCount).map(h => <li key={h}>{h}</li>)}</ol></section>}
        <button onClick={() => setSolutionOpen(!solutionOpen)}>{solutionOpen ? 'Hide explanation' : 'Show worked solution'}</button>
        {solutionOpen && <section className="worked-solution"><h3>One way to solve it</h3><p>{mission.explanation}</p><p>Try these values yourself, then check your design.</p></section>}
        {passed && <section className="completion"><h3>{selected === missions.length - 1 ? 'Final challenge solved' : 'Nicely solved'}</h3><p>{mission.explanation}</p>
          {selected < missions.length - 1 && <button className="submit" onClick={() => selectMission(selected + 1)}>Next mission →</button>}
          {completedCount === missions.length && <p className="success">All {missions.length} missions complete. You’ve finished {title}.</p>}
        </section>}
      </>}
    </aside>
  </div>
}
