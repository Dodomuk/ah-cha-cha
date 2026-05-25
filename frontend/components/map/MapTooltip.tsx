'use client'

import { TooltipState } from '@/types'

interface Props {
  tooltip: TooltipState
}

export default function MapTooltip({ tooltip }: Props) {
  if (!tooltip.visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 50,
        pointerEvents: 'none',
        left: tooltip.x + 16,
        top: tooltip.y,
        transform: 'translateY(-50%)',
        padding: '7px 12px',
        borderRadius: 10,
        background: 'rgba(10,12,20,0.72)',
        backdropFilter: 'blur(16px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        color: '#e0fbfc',
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {tooltip.countryName}
    </div>
  )
}
