import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

interface Props {
  times: number[]
  voltages: number[]
}

const WIDTH = 260
const HEIGHT = 170
const LEFT = 42
const RIGHT = 10
const TOP = 12
const BOTTOM = 32

function engineering(value: number, unit: string): string {
  const absolute = Math.abs(value)
  if (absolute > 0 && absolute < 1e-3) return `${Number.parseFloat((value * 1e6).toPrecision(4))} µ${unit}`
  if (absolute > 0 && absolute < 1) return `${Number.parseFloat((value * 1e3).toPrecision(4))} m${unit}`
  return `${Number.parseFloat(value.toPrecision(4))} ${unit}`
}

export default function TransientPlot({ times, voltages }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (times.length < 2 || times.length !== voltages.length) return null

  let minVoltage = voltages[0]
  let maxVoltage = voltages[0]
  for (const voltage of voltages) {
    minVoltage = Math.min(minVoltage, voltage)
    maxVoltage = Math.max(maxVoltage, voltage)
  }
  if (minVoltage === maxVoltage) {
    const margin = Math.max(Math.abs(minVoltage) * 0.1, 1)
    minVoltage -= margin
    maxVoltage += margin
  }
  const start = times[0]
  const stop = times[times.length - 1]
  const plotWidth = WIDTH - LEFT - RIGHT
  const plotHeight = HEIGHT - TOP - BOTTOM
  const x = (time: number) => LEFT + ((time - start) / (stop - start)) * plotWidth
  const y = (voltage: number) => TOP + ((maxVoltage - voltage) / (maxVoltage - minVoltage)) * plotHeight

  const stride = Math.max(1, Math.ceil(times.length / 600))
  const plottedIndices: number[] = []
  for (let index = 0; index < times.length; index += stride) plottedIndices.push(index)
  if (plottedIndices.at(-1) !== times.length - 1) plottedIndices.push(times.length - 1)
  const points = plottedIndices.map(index => `${x(times[index])},${y(voltages[index])}`).join(' ')

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const svgX = ((event.clientX - bounds.left) / bounds.width) * WIDTH
    const ratio = Math.min(1, Math.max(0, (svgX - LEFT) / plotWidth))
    const target = start + ratio * (stop - start)
    let low = 0
    let high = times.length - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (times[middle] < target) low = middle + 1
      else high = middle
    }
    if (low > 0 && Math.abs(times[low - 1] - target) < Math.abs(times[low] - target)) low -= 1
    setHovered(low)
  }

  return <figure className="transient-plot">
    <figcaption>Output voltage over time</figcaption>
    <div className="transient-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Output waveform from ${engineering(start, 's')} to ${engineering(stop, 's')}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <line x1={LEFT} y1={TOP} x2={LEFT} y2={TOP + plotHeight} className="plot-axis" />
        <line x1={LEFT} y1={TOP + plotHeight} x2={LEFT + plotWidth} y2={TOP + plotHeight} className="plot-axis" />
        <line x1={LEFT} y1={TOP} x2={LEFT + plotWidth} y2={TOP} className="plot-guide" />
        <text x={LEFT - 5} y={TOP + 4} className="plot-label" textAnchor="end">{engineering(maxVoltage, 'V')}</text>
        <text x={LEFT - 5} y={TOP + plotHeight + 4} className="plot-label" textAnchor="end">{engineering(minVoltage, 'V')}</text>
        <text x={LEFT} y={HEIGHT - 8} className="plot-label">{engineering(start, 's')}</text>
        <text x={LEFT + plotWidth} y={HEIGHT - 8} className="plot-label" textAnchor="end">{engineering(stop, 's')}</text>
        <polyline points={points} className="plot-trace" />
        {hovered !== null && <>
          <line x1={x(times[hovered])} y1={TOP} x2={x(times[hovered])} y2={TOP + plotHeight} className="plot-cursor" />
          <circle cx={x(times[hovered])} cy={y(voltages[hovered])} r={3} className="plot-point" />
        </>}
      </svg>
      {hovered !== null && <output className="plot-tooltip">
        {engineering(times[hovered], 's')} · {engineering(voltages[hovered], 'V')}
      </output>}
    </div>
  </figure>
}
