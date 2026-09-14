import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import init, { solve_circuit, solve_transient_circuit } from '../../pkg/circuit_solver.js'

const temp = await mkdtemp(join(tmpdir(), 'circuit-missions-'))
try {
  for (const name of ['grid', 'missions', 'capacitorMissions']) {
    const source = await readFile(new URL('../src/circuit/' + name + '.ts', import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext}}).outputText
    await writeFile(join(temp, name + '.mjs'), compiled.replaceAll("'./grid'", "'./grid.mjs'"))
  }
  const { missions, starter, requirements, measurements } = await import(pathToFileURL(join(temp, 'missions.mjs')))
  const { capacitorMissions, capacitorMeasurements } = await import(pathToFileURL(join(temp, 'capacitorMissions.mjs')))
  const { buildCircuitJson, isBuildError } = await import(pathToFileURL(join(temp, 'grid.mjs')))
  await init({module_or_path: await readFile(new URL('../../pkg/circuit_solver_bg.wasm', import.meta.url))})
  function grade(m, grid) {
    const built = buildCircuitJson(grid)
    if (isBuildError(built)) return false
    const solved = JSON.parse(solve_circuit(built.json))
    return [...requirements(m, grid), ...measurements(m, solved, built.outputNode)].every(c => c.pass)
  }
  for (const m of missions) {
    assert.equal(grade(m, starter(m, true)), true, m.id + ': worked solution passes real WASM solver')
    assert.equal(grade(m, starter(m)), false, m.id + ': starter does not pass')
    const bad = starter(m, true)
    bad.output = null
    assert.equal(grade(m, bad), false, m.id + ': output required')
    bad.output = '0,0'
    assert.equal(grade(m, bad), false, m.id + ': detached output fails')
    const wrongSource = starter(m, true)
    wrongSource.elements.set('3,2', {type:'voltage', value:m.supply + 1})
    assert.equal(grade(m, wrongSource), false, m.id + ': wrong supply fails')
    const invalid = starter(m, true)
    const resistor = [...invalid.elements].find(([,p]) => p.type === 'resistor')[0]
    invalid.elements.set(resistor, {type:'resistor', value:999})
    assert.equal(requirements(m, invalid).every(c => c.pass), false, m.id + ': range enforced')
  }
  const final = missions.at(-1)
  const alternative = starter(final, true)
  for (const [key, value] of alternative.elements) if (value.type === 'resistor') alternative.elements.set(key, {...value, value:value.value * 2})
  assert.equal(grade(final, alternative), true, 'Alternative valid design passes')
  const excessive = starter(final, true)
  for (const [key,value] of excessive.elements) if (value.type === 'resistor') excessive.elements.set(key,{...value,value:value.value/10})
  assert.equal(grade(final, excessive), false, 'Correct voltage with excessive current fails')
  assert.equal(measurements(final, {node_voltages:[0,4],source_currents:[-0.001]},1).every(c=>c.pass), false, 'Strict current boundary')
  assert.equal(measurements(final, {node_voltages:[0,NaN],source_currents:[NaN]},1).every(c=>c.pass), false, 'Non-finite results fail')

  const transientGrid = {
    elements: new Map([
      ['2,1', {type:'voltage', value:5, reversed:true}],
      ['2,3', {type:'switch', value:0, initiallyClosed:false, transitionTimes:[0.001]}],
      ['2,5', {type:'resistor', value:1000}],
      ['3,6', {type:'capacitor', value:0.000001, initialVoltage:0}],
    ]),
    ground: new Set(['2,0', '4,6']),
    output: '2,6',
  }
  const transientBuilt = buildCircuitJson(transientGrid)
  assert.equal(isBuildError(transientBuilt), false, 'Transient grid serializes')
  const transientJson = JSON.parse(transientBuilt.json)
  assert.equal(transientJson.some(component => component.type === 'capacitor'), true, 'Capacitor emitted')
  assert.deepEqual(transientJson.find(component => component.type === 'switch').transitions, [{time:0.001, closed:true}], 'Switch toggle emitted')
  const transientSolved = JSON.parse(solve_transient_circuit(transientBuilt.json, 0, 0.005, 0.0001))
  const eventIndex = transientSolved.times.indexOf(0.001)
  assert.ok(eventIndex >= 0, 'Switch event is sampled exactly')
  assert.ok(Math.abs(transientSolved.node_voltages[eventIndex][transientBuilt.outputNode]) < 1e-8, 'Capacitor voltage is continuous at switch event')
  assert.ok(transientSolved.node_voltages.at(-1)[transientBuilt.outputNode] > 4.8, 'RC output charges after switch closes')
  function gradeCap(m, grid) {
    const built = buildCircuitJson(grid)
    if (isBuildError(built)) return false
    const solved = JSON.parse(solve_transient_circuit(built.json, 0, m.transient.stop, 0.0001))
    return [...requirements(m, grid), ...capacitorMeasurements(m, solved, built.outputNode)].every(c => c.pass)
  }
  for (const m of capacitorMissions) {
    assert.equal(gradeCap(m, starter(m, true)), true, m.id + ': worked solution passes')
    assert.equal(gradeCap(m, starter(m)), false, m.id + ': starter fails')
    const modified = starter(m, true)
    modified.elements.get('3,6').initialVoltage = 4
    assert.equal(requirements(m, modified).every(c => c.pass), false, m.id + ': initial voltage cannot bypass challenge')
    const detached = starter(m, true)
    detached.output = '0,0'
    assert.equal(gradeCap(m, detached), false, m.id + ': disconnected output fails')
  }
  const alternativeCap = starter(capacitorMissions[3], true)
  alternativeCap.elements.get('2,5').value = 5000
  assert.equal(gradeCap(capacitorMissions[3], alternativeCap), true, 'Alternative discharge solution accepted')
  console.log('Passed: all 9 DC missions, all 6 capacitor missions, invalid circuits and alternative answers through real WASM.')
} finally {
  await rm(temp, {recursive:true, force:true})
}
