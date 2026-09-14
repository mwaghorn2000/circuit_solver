// The circuit board is a "double resolution" grid: logical circuit nodes
// sit at even (row, col); the cell directly between two adjacent nodes
// (where exactly one of row/col is odd) is where a 2-terminal element
// (wire/resistor/voltage/current) can be placed spanning them. Cells where
// both row and col are odd are unused gaps, purely for spacing.

export const NODE_COLS = 24
export const NODE_ROWS = 16

export const GRID_ROWS = NODE_ROWS * 2 - 1
export const GRID_COLS = NODE_COLS * 2 - 1

export type CellKind = 'node' | 'edge-h' | 'edge-v' | 'gap'

export function cellKind(row: number, col: number): CellKind {
  const rowIsNode = row % 2 === 0
  const colIsNode = col % 2 === 0
  if (rowIsNode && colIsNode) return 'node'
  if (rowIsNode && !colIsNode) return 'edge-h'
  if (!rowIsNode && colIsNode) return 'edge-v'
  return 'gap'
}

export type NodeCoord = [row: number, col: number]

/** The two node cells a given edge cell connects, or null if not an edge. */
export function edgeEndpoints(row: number, col: number): [NodeCoord, NodeCoord] | null {
  const kind = cellKind(row, col)
  if (kind === 'edge-h') return [[row, col - 1], [row, col + 1]]
  if (kind === 'edge-v') return [[row - 1, col], [row + 1, col]]
  return null
}

export const key = (row: number, col: number): string => `${row},${col}`

// Pixel geometry for rendering. A circuit node occurs every two internal
// cells, so adjacent visible dots are 84 px apart. The internal edge cell is
// still the click target between them, but is no longer drawn as a misleading
// second grid dot.
export const CELL = 42

export function pixel(row: number, col: number): [number, number] {
  return [col * CELL + CELL / 2, row * CELL + CELL / 2]
}

export type ElementType = 'resistor' | 'voltage' | 'current' | 'wire'
export type Tool = ElementType | 'ground' | 'output'

export interface PlacedElement {
  type: ElementType
  /** ohms / volts / amps; unused for wire. */
  value: number
  /** Reverses source polarity/direction without changing its grid position. */
  reversed?: boolean
}

export const DEFAULT_VALUE: Record<ElementType, number> = {
  resistor: 100,
  voltage: 5,
  current: 1,
  wire: 0,
}

export interface GridState {
  elements: Map<string, PlacedElement>
  ground: Set<string>
  output: string | null
}

export function emptyGridState(): GridState {
  return { elements: new Map(), ground: new Set(), output: null }
}

export function withElement(grid: GridState, edgeKey: string, element: PlacedElement | null): GridState {
  const elements = new Map(grid.elements)
  if (element) elements.set(edgeKey, element)
  else elements.delete(edgeKey)
  return { ...grid, elements }
}

/** Flip a source 180 degrees in place, reversing its electrical terminals. */
export function withElementFlipped(grid: GridState, edgeKey: string): GridState {
  const element = grid.elements.get(edgeKey)
  if (!element || (element.type !== 'voltage' && element.type !== 'current')) return grid

  const elements = new Map(grid.elements)
  elements.set(edgeKey, { ...element, reversed: !element.reversed })
  return { ...grid, elements }
}

export function withGroundToggled(grid: GridState, nodeKey: string): GridState {
  const ground = new Set(grid.ground)
  if (ground.has(nodeKey)) ground.delete(nodeKey)
  else ground.add(nodeKey)
  return { ...grid, ground }
}

export function withOutput(grid: GridState, nodeKey: string): GridState {
  return { ...grid, output: grid.output === nodeKey ? null : nodeKey }
}

class UnionFind {
  private parent = new Map<string, string>()

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    const p = this.parent.get(x) as string
    if (p === x) return x
    const root = this.find(p)
    this.parent.set(x, root)
    return root
  }

  union(a: string, b: string) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

export interface BuildResult {
  json: string
  outputNode: number | null
}

export type BuildError = { kind: 'no-ground' } | { kind: 'no-components' }

export function isBuildError(r: BuildResult | BuildError): r is BuildError {
  return 'kind' in r
}

/**
 * Turns placed grid elements into the JSON array shape Circuit::from_json
 * expects. Wires aren't emitted as components -- they collapse their two
 * endpoint node cells into a single electrical node via union-find, same
 * as any direct connection, rather than being modeled as 0V sources.
 */
export function buildCircuitJson(grid: GridState): BuildResult | BuildError {
  if (grid.ground.size === 0) return { kind: 'no-ground' }
  if (grid.elements.size === 0) return { kind: 'no-components' }

  const uf = new UnionFind()

  for (const [k, el] of grid.elements) {
    const [row, col] = k.split(',').map(Number)
    const [a, b] = edgeEndpoints(row, col) as [NodeCoord, NodeCoord]
    const ak = key(...a)
    const bk = key(...b)
    uf.find(ak)
    uf.find(bk)
    if (el.type === 'wire') uf.union(ak, bk)
  }

  // Every ground marker is the same electrical node, whether or not
  // they're wired together -- that's what a ground symbol means.
  const groundCells = [...grid.ground]
  for (const g of groundCells) uf.find(g)
  for (let i = 1; i < groundCells.length; i++) uf.union(groundCells[0], groundCells[i])
  const groundRoot = uf.find(groundCells[0])

  const nodeIndex = new Map<string, number>()
  nodeIndex.set(groundRoot, 0)
  let nextIndex = 1
  const resolve = (cellKey: string): number => {
    const root = uf.find(cellKey)
    let idx = nodeIndex.get(root)
    if (idx === undefined) {
      idx = nextIndex
      nextIndex += 1
      nodeIndex.set(root, idx)
    }
    return idx
  }

  const components: Record<string, unknown>[] = []
  for (const [k, el] of grid.elements) {
    if (el.type === 'wire') continue
    const [row, col] = k.split(',').map(Number)
    const [a, b] = edgeEndpoints(row, col) as [NodeCoord, NodeCoord]
    const [first, second] = el.reversed ? [b, a] : [a, b]
    const n1 = resolve(key(...first))
    const n2 = resolve(key(...second))

    if (el.type === 'resistor') {
      components.push({ type: 'resistor', n1, n2, resistance: el.value })
    } else if (el.type === 'voltage') {
      components.push({ type: 'voltage_source', n_pos: n1, n_neg: n2, voltage: el.value })
    } else if (el.type === 'current') {
      components.push({ type: 'current_source', n_from: n1, n_to: n2, current: el.value })
    }
  }

  if (components.length === 0) return { kind: 'no-components' }

  const outputNode = grid.output ? resolve(grid.output) : null

  return { json: JSON.stringify(components), outputNode }
}
