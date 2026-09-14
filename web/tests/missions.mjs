import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import init, { solve_circuit } from '../../pkg/circuit_solver.js'

const temp = await mkdtemp(join(tmpdir(), 'circuit-missions-'))
try {
  for (const name of ['grid', 'missions']) {
    const source = await readFile(new URL('../src/circuit/' + name + '.ts', import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext}}).outputText
    await writeFile(join(temp, name + '.mjs'), compiled.replaceAll("'./grid'", "'./grid.mjs'"))
  }
  const { missions, starter, requirements, measurements } = await import(pathToFileURL(join(temp, 'missions.mjs')))
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
  console.log('Passed: all 9 mission solutions and starters, missing/detached outputs, supply and resistor constraints, alternative design, current boundary and non-finite results.')
} finally {
  await rm(temp, {recursive:true, force:true})
}
