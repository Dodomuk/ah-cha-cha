'use client'

import { TrendPoint } from '@/types'

interface Props {
  points: TrendPoint[]
}

const LEVEL_COLOR: Record<number, string> = {
  0: '#1e3d52',
  1: '#39FF14',
  2: '#FFD700',
  3: '#FF8C00',
  4: '#FF2D2D',
}

export default function TrendChart({ points }: Props) {
  if (!points.length) return null

  const W = 196
  const H = 36
  const PAD_X = 4
  const PAD_Y = 4
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_Y * 2
  const maxLevel = 4
  const step = points.length > 1 ? innerW / (points.length - 1) : 0

  const pts = points.map((p, i) => ({
    x: PAD_X + i * step,
    y: PAD_Y + innerH - (p.level / maxLevel) * innerH,
    level: p.level,
  }))

  const polyline = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const lastActive = [...pts].reverse().find((p) => p.level > 0)
  const lineColor = lastActive ? LEVEL_COLOR[lastActive.level] : LEVEL_COLOR[0]

  const areaD = [
    `M ${pts[0].x} ${PAD_Y + innerH}`,
    ...pts.map((p) => `L ${p.x} ${p.y}`),
    `L ${pts[pts.length - 1].x} ${PAD_Y + innerH}`,
    'Z',
  ].join(' ')

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Baseline */}
      <line
        x1={PAD_X}
        y1={PAD_Y + innerH}
        x2={PAD_X + innerW}
        y2={PAD_Y + innerH}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />
      {/* Area fill */}
      <path d={areaD} fill={`${lineColor}18`} />
      {/* Sparkline */}
      <polyline
        points={polyline}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Dots for non-zero days */}
      {pts.map((p, i) =>
        p.level > 0 ? (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill={LEVEL_COLOR[p.level]}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={1}
          />
        ) : null
      )}
    </svg>
  )
}
