import { useEffect, useRef, useState } from 'react'
import init, { solve_circuit } from 'circuit_solver'
import CircuitGrid from '../components/CircuitGrid'
import { buildCircuitJson, emptyGridState, isBuildError } from '../circuit/grid'
import type { GridState, Tool } from '../circuit/grid'
import { missions, starter, requirements, measurements } from '../circuit/missions'
import type { Check, Solution } from '../circuit/missions'
import './Practice.css'

const tools: { key: string; tool: Tool; label: string }[] = [
  {key:'r',tool:'resistor',label:'Resistor'}, {key:'v',tool:'voltage',label:'Voltage supply'},
  {key:'w',tool:'wire',label:'Wire'}, {key:'g',tool:'ground',label:'Ground'}, {key:'o',tool:'output',label:'Output'},
]
const STORAGE = 'circuit-practice-v1'
function readProgress(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]')
    return Array.isArray(value) ? missions.filter(m => value.includes(m.id)).map(m => m.id) : []
  } catch { return [] }
}
let wasmReady: Promise<unknown> | null = null
function ensureWasm() {
  if (!wasmReady) wasmReady = init().catch(error => { wasmReady = null; throw error })
  return wasmReady
}

export default function Practice() {
  const [completed, setCompleted] = useState(readProgress)
  const [selected, setSelected] = useState(() => {
    const done = readProgress()
    const next = missions.findIndex(m => !done.includes(m.id))
    return next < 0 ? missions.length - 1 : next
  })
  const [sandbox, setSandbox] = useState(false)
  const mission = missions[selected]
  const [grid, setGrid] = useState<GridState>(() => starter(mission))
  const [tool, setTool] = useState<Tool>('wire')
  const [checks, setChecks] = useState<Check[]>([])
  const [message, setMessage] = useState('')
  const [hintCount, setHintCount] = useState(0)
  const [solutionOpen, setSolutionOpen] = useState(false)
  const [passed, setPassed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const revision = useRef(0)
  const guided = !sandbox && mission.kind !== 'Build it'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || target?.closest('input, textarea, select, [contenteditable]')) return
      const next = [...tools, ...(sandbox ? [{ key: 'i', tool: 'current' as Tool }] : [])].find(t => t.key === e.key.toLowerCase())
      if (next && !guided) setTool(next.tool)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [guided, sandbox])
  useEffect(() => () => { revision.current += 1 }, [])

  function updateGrid(next: GridState) {
    revision.current += 1
    setGrid(next); setChecks([]); setMessage(''); setPassed(false); setBusy(false)
  }
  function selectMission(index: number, free = false) {
    setSelected(index); setSandbox(free); setHintCount(0); setSolutionOpen(false)
    updateGrid(free ? emptyGridState() : starter(missions[index]))
  }
  async function checkDesign() {
    const version = ++revision.current
    setBusy(true); setMessage(''); setPassed(false)
    const initial = sandbox ? [] : requirements(mission, grid)
    setChecks(initial)
    const built = buildCircuitJson(grid)
    if (isBuildError(built)) {
      setMessage(built.kind === 'no-ground' ? 'Add a ground marker at your reference node before checking.' : 'Add a supply and resistors, then connect them with wires.')
      setBusy(false); return
    }
    try {
      await ensureWasm()
      if (version !== revision.current) return
      const solved: Solution = JSON.parse(solve_circuit(built.json))
      if (!solved.node_voltages.every(Number.isFinite) || !solved.source_currents.every(Number.isFinite)) throw new Error('Non-finite solution')
      if (sandbox) {
        const voltage = built.outputNode === null ? undefined : solved.node_voltages[built.outputNode]
        setMessage(`Output: ${voltage === undefined ? 'place a connected output marker' : voltage.toFixed(4) + ' V'}. Supply currents: ${solved.source_currents.map(i => (Math.abs(i)*1000).toFixed(3) + ' mA').join(', ')}`)
      } else {
        const results = [...initial, ...measurements(mission, solved, built.outputNode)]
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
    } catch {
      setMessage('This circuit could not be solved. Check for disconnected branches, a missing return path to ground, or a short across the supply. Connect the output marker to the circuit.')
    } finally {
      if (version === revision.current) setBusy(false)
    }
  }

  return <div className="practice learning-practice">
    <aside className="learning-path" aria-label="Learning path">
      <p className="eyebrow">PRACTICE / 01</p>
      <h1>DC fundamentals</h1>
      <p>Learn by making circuits work.</p>
      <label className="progress-label" htmlFor="path-progress">{completed.length} / {missions.length} missions complete</label>
      <progress id="path-progress" max={missions.length} value={completed.length} />
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
        <p>{sandbox ? 'Build a circuit and inspect its output with the solver.' : mission.brief}</p>
        {!sandbox && <p className="mission-limits">Use {mission.count} resistor{mission.count > 1 ? 's' : ''}, each 1–100 kΩ. {guided ? 'Wiring, supply and output are fixed. Click a resistor to edit its value in ohms.' : 'Use wires freely. Set the supply value in volts using its component menu.'}</p>}
      </header>
      <div className="mission-board"><CircuitGrid key={`${sandbox}-${selected}`} grid={grid} onGridChange={updateGrid} tool={tool} valuesOnly={guided} /></div>
      <div className="mission-tools">
        {!guided && <div className="controls">{[...tools, ...(sandbox ? [{key:'i',tool:'current' as Tool,label:'Current supply'}] : [])].map(t => <button key={t.tool} className={tool === t.tool ? 'tool active' : 'tool'} aria-pressed={tool === t.tool} onClick={() => setTool(t.tool)}>[{t.key.toUpperCase()}] {t.label}</button>)}</div>}
        <p className="editor-instructions">{guided ? 'Click a resistor → enter resistance in Ω → Apply.' : 'Click between dots to place a component; click again to remove. Right-click to edit values or flip a supply. Place ground and output on dots.'}</p>
        <div className="mission-actions">
          <button className="submit" disabled={busy} onClick={checkDesign}>{busy ? 'Checking…' : sandbox ? 'Solve circuit' : 'Check design'}</button>
          <button onClick={() => { updateGrid(sandbox ? emptyGridState() : starter(mission)); setSolutionOpen(false) }}>Reset circuit</button>
          {!sandbox && hintCount < mission.hints.length && <button onClick={() => setHintCount(hintCount + 1)}>Reveal hint ({hintCount}/{mission.hints.length})</button>}
        </div>
      </div>
    </section>
    <aside className="mission-feedback" aria-label="Mission feedback">
      <h2>{sandbox ? 'Measurements' : 'Design checks'}</h2>
      {!sandbox && <ul className="requirements">
        <li>One {mission.supply} V supply; {mission.count} resistor{mission.count === 1 ? '' : 's'}</li>
        {mission.voltage !== undefined && <li>Output: {mission.voltage} V ±0.2 V</li>}
        {mission.current !== undefined && <li>Supply current: {mission.current} mA ±0.05 mA</li>}
        {mission.maxCurrent !== undefined && <li>Supply current below {mission.maxCurrent} mA</li>}
      </ul>}
      <div role="status" aria-live="polite">
        <p className={passed ? 'success' : ''}>{message || 'Run a check to see how your circuit performs.'}</p>
        <ul className="check-results">{checks.map(c => <li key={c.label} className={c.pass ? 'success' : 'needs-work'}>{c.pass ? '✓' : '×'} {c.label}</li>)}</ul>
      </div>
      {!sandbox && <>
        {hintCount > 0 && <section><h3>Hints</h3><ol className="hints">{mission.hints.slice(0,hintCount).map(h => <li key={h}>{h}</li>)}</ol></section>}
        <button onClick={() => setSolutionOpen(!solutionOpen)}>{solutionOpen ? 'Hide explanation' : 'Show worked solution'}</button>
        {solutionOpen && <section className="worked-solution"><h3>One way to solve it</h3><p>{mission.explanation}</p><p>Try these values yourself, then check your design.</p></section>}
        {passed && <section className="completion"><h3>{selected === missions.length - 1 ? 'Final challenge solved' : 'Nicely solved'}</h3><p>{mission.explanation}</p>
          {selected < missions.length - 1 && <button className="submit" onClick={() => selectMission(selected + 1)}>Next mission →</button>}
          {completed.length === missions.length && <p className="success">All nine missions complete. You’ve finished DC fundamentals.</p>}
        </section>}
      </>}
    </aside>
  </div>
}
