import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import {
  CELL,
  DEFAULT_VALUE,
  GRID_COLS,
  GRID_ROWS,
  cellKind,
  edgeEndpoints,
  key,
  pixel,
  withElement,
  withElementFlipped,
  withGroundToggled,
  withOutput,
} from '../circuit/grid'
import type { ElementType, GridState, NodeCoord, PlacedElement, Tool } from '../circuit/grid'
import './CircuitGrid.css'

interface Props {
  grid: GridState
  onGridChange: (grid: GridState) => void
  tool: Tool
  valuesOnly?: boolean
}

const VALUE_UNIT: Record<Exclude<ElementType, 'wire'>, string> = {
  resistor: 'Ω',
  voltage: 'V',
  current: 'A',
}

function formatValue(el: PlacedElement): string {
  if (el.type === 'wire') return ''

  const absolute = Math.abs(el.value)
  let scaled = el.value
  let prefix = ''

  if (absolute >= 1_000_000) {
    scaled = el.value / 1_000_000
    prefix = 'M'
  } else if (absolute >= 1_000) {
    scaled = el.value / 1_000
    prefix = 'k'
  } else if (absolute > 0 && absolute < 0.001) {
    scaled = el.value * 1_000_000
    prefix = 'µ'
  } else if (absolute > 0 && absolute < 1) {
    scaled = el.value * 1_000
    prefix = 'm'
  }

  return `${Number.parseFloat(scaled.toPrecision(4))} ${prefix}${VALUE_UNIT[el.type]}`
}

/** A resistor's zigzag body, leads running straight from each node. */
function zigzagPath(x1: number, y1: number, x2: number, y2: number): string {
  const horizontal = y1 === y2
  const amp = 8
  const peaks = 6
  const leadFrac = 0.3
  const bodyFrac = 0.4

  if (horizontal) {
    const bodyStart = x1 + (x2 - x1) * leadFrac
    const bodyEnd = x1 + (x2 - x1) * (leadFrac + bodyFrac)
    const step = (bodyEnd - bodyStart) / peaks
    let d = `M ${x1} ${y1} L ${bodyStart} ${y1}`
    for (let i = 0; i < peaks; i++) {
      d += ` L ${bodyStart + step * (i + 1)} ${y1 + (i % 2 === 0 ? -amp : amp)}`
    }
    return `${d} L ${bodyEnd} ${y1} L ${x2} ${y2}`
  }

  const bodyStart = y1 + (y2 - y1) * leadFrac
  const bodyEnd = y1 + (y2 - y1) * (leadFrac + bodyFrac)
  const step = (bodyEnd - bodyStart) / peaks
  let d = `M ${x1} ${y1} L ${x1} ${bodyStart}`
  for (let i = 0; i < peaks; i++) {
    d += ` L ${x1 + (i % 2 === 0 ? -amp : amp)} ${bodyStart + step * (i + 1)}`
  }
  return `${d} L ${x1} ${bodyEnd} L ${x2} ${y2}`
}

function ElementGlyph({ row, col, el }: { row: number; col: number; el: PlacedElement }) {
  const kind = cellKind(row, col)
  const horizontal = kind === 'edge-h'
  const [a, b] = edgeEndpoints(row, col) as [NodeCoord, NodeCoord]
  const [x1, y1] = pixel(...a)
  const [x2, y2] = pixel(...b)
  const [cx, cy] = pixel(row, col)
  const labelOnLeft = !horizontal && col === GRID_COLS - 1

  const valueLabel = el.type === 'wire' ? null : (
    <text
      x={horizontal ? cx : cx + (labelOnLeft ? -22 : 22)}
      y={horizontal ? cy + (row === 0 ? 30 : -18) : cy + 4}
      className={`component-value ${horizontal ? 'horizontal' : labelOnLeft ? 'vertical align-end' : 'vertical'}`}
    >
      {formatValue(el)}
    </text>
  )

  if (el.type === 'wire') {
    return (
      <g className="element-glyph">
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="wire-line" />
      </g>
    )
  }

  if (el.type === 'resistor') {
    return (
      <g className="element-glyph">
        <path d={zigzagPath(x1, y1, x2, y2)} className="resistor-path" fill="none" />
        {valueLabel}
      </g>
    )
  }

  // voltage / current source: leads to a circle, +/- or an arrow inside.
  const r = 13
  const lead1: [number, number] = horizontal ? [cx - r, cy] : [cx, cy - r]
  const lead2: [number, number] = horizontal ? [cx + r, cy] : [cx, cy + r]

  return (
    <g className="element-glyph">
      <line x1={x1} y1={y1} x2={lead1[0]} y2={lead1[1]} className="source-lead" />
      <line x1={lead2[0]} y1={lead2[1]} x2={x2} y2={y2} className="source-lead" />
      <circle cx={cx} cy={cy} r={r} className="source-circle" />
      {el.type === 'voltage' ? (
        <>
          <text x={horizontal ? cx - 5 : cx} y={horizontal ? cy : cy - 5} className="source-label">
            {el.reversed ? '−' : '+'}
          </text>
          <text x={horizontal ? cx + 5 : cx} y={horizontal ? cy : cy + 5} className="source-label">
            {el.reversed ? '+' : '−'}
          </text>
        </>
      ) : (
        <line
          x1={horizontal ? cx + (el.reversed ? 5 : -5) : cx}
          y1={horizontal ? cy : cy + (el.reversed ? 5 : -5)}
          x2={horizontal ? cx + (el.reversed ? -5 : 5) : cx}
          y2={horizontal ? cy : cy + (el.reversed ? -5 : 5)}
          className="source-arrow"
          markerEnd="url(#arrowhead)"
        />
      )}
      {valueLabel}
    </g>
  )
}

function GroundGlyph({ row, col }: { row: number; col: number }) {
  const [cx, cy] = pixel(row, col)
  return (
    <g className="ground-glyph">
      <line x1={cx} y1={cy} x2={cx} y2={cy + 8} />
      <line x1={cx - 8} y1={cy + 8} x2={cx + 8} y2={cy + 8} />
      <line x1={cx - 5} y1={cy + 12} x2={cx + 5} y2={cy + 12} />
      <line x1={cx - 2} y1={cy + 16} x2={cx + 2} y2={cy + 16} />
    </g>
  )
}

function OutputGlyph({ row, col }: { row: number; col: number }) {
  const [cx, cy] = pixel(row, col)
  return <circle cx={cx} cy={cy} r={6} className="output-glyph" />
}

function CircuitGrid({ grid, onGridChange, tool, valuesOnly = false }: Props) {
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panFrame = useRef<number | null>(null)
  const panVelocity = useRef({ x: 0, y: 0 })

  const stopAutoPan = () => {
    panVelocity.current = { x: 0, y: 0 }
    if (panFrame.current !== null) {
      window.cancelAnimationFrame(panFrame.current)
      panFrame.current = null
    }
  }

  const autoPan = () => {
    const scroller = scrollRef.current
    const { x, y } = panVelocity.current
    if (!scroller || (x === 0 && y === 0)) {
      panFrame.current = null
      return
    }

    scroller.scrollBy(x, y)
    panFrame.current = window.requestAnimationFrame(autoPan)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const edgeZone = 72
    const maxSpeed = 18
    const axisSpeed = (position: number, start: number, end: number) => {
      if (position < start + edgeZone) {
        return -maxSpeed * (1 - Math.max(0, position - start) / edgeZone)
      }
      if (position > end - edgeZone) {
        return maxSpeed * (1 - Math.max(0, end - position) / edgeZone)
      }
      return 0
    }

    panVelocity.current = {
      x: axisSpeed(event.clientX, bounds.left, bounds.right),
      y: axisSpeed(event.clientY, bounds.top, bounds.bottom),
    }

    if ((panVelocity.current.x !== 0 || panVelocity.current.y !== 0) && panFrame.current === null) {
      panFrame.current = window.requestAnimationFrame(autoPan)
    } else if (panVelocity.current.x === 0 && panVelocity.current.y === 0) {
      stopAutoPan()
    }
  }

  useEffect(() => stopAutoPan, [])

  const handleClick = (row: number, col: number) => {
    if (valuesOnly) {
      const k = key(row, col)
      const el = grid.elements.get(k)
      if (el?.type === 'resistor') setEditing({ key: k, value: String(el.value) })
      return
    }
    const kind = cellKind(row, col)
    const k = key(row, col)

    if (kind === 'node') {
      if (tool === 'ground') onGridChange(withGroundToggled(grid, k))
      else if (tool === 'output') onGridChange(withOutput(grid, k))
      return
    }

    if (kind === 'edge-h' || kind === 'edge-v') {
      if (tool === 'ground' || tool === 'output') return
      const existing = grid.elements.get(k)
      if (existing?.type === tool) {
        onGridChange(withElement(grid, k, null))
      } else {
        onGridChange(withElement(grid, k, { type: tool, value: DEFAULT_VALUE[tool as ElementType] }))
      }
    }
  }

  const handleContextMenu = (e: MouseEvent<SVGRectElement>, row: number, col: number) => {
    e.preventDefault()
    const kind = cellKind(row, col)
    if (kind !== 'edge-h' && kind !== 'edge-v') return
    const k = key(row, col)
    const el = grid.elements.get(k)
    if (!el || (valuesOnly && el.type !== 'resistor')) return
    setEditing({ key: k, value: String(el.value) })
  }

  const commitEdit = () => {
    if (!editing) return
    const el = grid.elements.get(editing.key)
    if (el) {
      const value = Number(editing.value)
      if (editing.value.trim() && Number.isFinite(value) && (el.type !== 'resistor' || value > 0)) {
        onGridChange(withElement(grid, editing.key, { ...el, value }))
      }
    }
    setEditing(null)
  }

  const flipEditing = () => {
    if (!editing) return
    onGridChange(withElementFlipped(grid, editing.key))
    setEditing(null)
  }

  const deleteEditing = () => {
    if (!editing) return
    onGridChange(withElement(grid, editing.key, null))
    setEditing(null)
  }

  const width = GRID_COLS * CELL
  const height = GRID_ROWS * CELL

  const editingPixel = editing ? pixel(...(editing.key.split(',').map(Number) as NodeCoord)) : null
  const editingElement = editing ? grid.elements.get(editing.key) : null

  const dots = []
  const glyphs = []
  const hitRects = []

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const kind = cellKind(row, col)
      if (kind === 'gap') continue

      const k = key(row, col)
      const [cx, cy] = pixel(row, col)

      if (kind === 'node') {
        if (grid.ground.has(k)) glyphs.push(<GroundGlyph key={k} row={row} col={col} />)
        else if (grid.output === k) glyphs.push(<OutputGlyph key={k} row={row} col={col} />)
        else dots.push(<circle key={k} cx={cx} cy={cy} r={2.2} className="grid-dot node-dot" />)
      } else {
        const el = grid.elements.get(k)
        if (el) glyphs.push(<ElementGlyph key={k} row={row} col={col} el={el} />)
      }

      hitRects.push(
        <rect
          key={k}
          x={cx - CELL / 2}
          y={cy - CELL / 2}
          width={CELL}
          height={CELL}
          className={`hit ${kind}`}
          aria-label={
            kind === 'node'
              ? `Circuit node at row ${row / 2 + 1}, column ${col / 2 + 1}`
              : `${kind === 'edge-h' ? 'Horizontal' : 'Vertical'} component position`
          }
          onClick={() => handleClick(row, col)}
          onContextMenu={(e) => handleContextMenu(e, row, col)}
        />,
      )
    }
  }

  return (
    <div
      ref={scrollRef}
      className="circuit-grid-scroll"
      onPointerMove={handlePointerMove}
      onPointerLeave={stopAutoPan}
    >
      <div className="circuit-grid-wrap">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="circuit-grid"
          role="img"
          aria-label="Circuit editor. Place components between adjacent grid dots."
        >
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" className="arrowhead-fill" />
          </marker>
        </defs>
        <rect x={0} y={0} width={width} height={height} className="grid-bg" />
        <g>{dots}</g>
        <g>{glyphs}</g>
        <g>{hitRects}</g>
        </svg>
      {editing && editingPixel && editingElement && (
        <div
          className="component-menu"
          style={{
            left: `${Math.min(editingPixel[0] + CELL, width - 220)}px`,
            top: `${Math.max(8, editingPixel[1] - 18)}px`,
          }}
        >
          <div className="component-menu-heading">
            <span>{editingElement.type}</span>
            <button type="button" aria-label="Close component menu" onClick={() => setEditing(null)}>
              ×
            </button>
          </div>

          {editingElement.type !== 'wire' && (
            <label className="component-value-field">
              <span>Value ({VALUE_UNIT[editingElement.type]})</span>
              <input
                autoFocus
                value={editing.value}
                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditing(null)
                }}
              />
            </label>
          )}

          <div className="component-menu-actions">
            {editingElement.type !== 'wire' && (
              <button type="button" onClick={commitEdit}>
                Apply
              </button>
            )}
            {!valuesOnly && (editingElement.type === 'voltage' || editingElement.type === 'current') && (
              <button type="button" onClick={flipEditing}>
                Flip 180°
              </button>
            )}
            {!valuesOnly && <button type="button" className="danger" onClick={deleteEditing}>
              Delete
            </button>}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default CircuitGrid
