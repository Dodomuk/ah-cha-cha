'use client'

import { TooltipState } from '@/types'
import { THREAT_STROKE, THREAT_LABEL } from '@/lib/threatColors'

interface Props {
  tooltip: TooltipState
}

export default function MapTooltip({ tooltip }: Props) {
  if (!tooltip.visible) return null

  const color = THREAT_STROKE[tooltip.threatLevel]
  const label = THREAT_LABEL[tooltip.threatLevel]

  return (
    <div
      className="fixed z-50 pointer-events-none px-3 py-2 rounded text-sm"
      style={{
        left: tooltip.x + 14,
        top: tooltip.y - 10,
        background: 'rgba(13,27,42,0.92)',
        border: `1px solid ${color}`,
        boxShadow: `0 0 8px ${color}40`,
        color: '#E0FBFC',
        fontFamily: 'monospace',
        transform: 'translateY(-100%)',
        marginTop: '-4px',
      }}
    >
      <div className="font-semibold">{tooltip.countryName}</div>
      <div style={{ color }} className="text-xs mt-0.5">
        {label}
        {tooltip.threatLevel === 0 ? '' : ` (Level ${tooltip.threatLevel})`}
      </div>
    </div>
  )
}
