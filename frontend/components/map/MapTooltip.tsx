'use client'

import { TooltipState } from '@/types'
import { THREAT_STROKE } from '@/lib/threatColors'

interface Props {
  tooltip: TooltipState
}

const ROLE_LABEL: Record<string, { ko: string; color: string }> = {
  attacker: { ko: '공격자', color: '#CC00FF' },
  victim:   { ko: '피해국', color: '#FF8C00' },
  both:     { ko: '공격자·피해국', color: '#FF6030' },
}

export default function MapTooltip({ tooltip }: Props) {
  if (!tooltip.visible) return null

  const hasThreat = tooltip.threatLevel > 0
  const color = THREAT_STROKE[tooltip.threatLevel]
  const delta = tooltip.delta
  const roleInfo = tooltip.role ? ROLE_LABEL[tooltip.role] : null

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
        border: `1px solid ${hasThreat ? `${color}40` : 'rgba(255,255,255,0.1)'}`,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
        color: '#e0fbfc',
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {/* Country name + delta badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{tooltip.countryName}</span>
        {hasThreat && delta != null && delta !== 0 && (
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: delta > 0 ? '#FF2D2D' : '#39FF14',
            letterSpacing: 0,
          }}>
            {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
          </span>
        )}
      </div>
      {/* Role badge */}
      {roleInfo && (
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: roleInfo.color,
          letterSpacing: '0.04em',
        }}>
          {roleInfo.ko}
        </span>
      )}
    </div>
  )
}
