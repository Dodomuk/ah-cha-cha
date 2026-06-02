'use client'

import { MarketTooltipState } from '@/types'

function fmtPct(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function pctColor(pct: number | null): string {
  if (pct === null) return 'rgba(255,255,255,0.4)'
  return pct >= 0 ? '#00e676' : '#ff5252'
}

export default function MarketTooltip({ tooltip }: { tooltip: MarketTooltipState }) {
  if (!tooltip.visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: tooltip.x + 14,
        top: tooltip.y - 36,
        pointerEvents: 'none',
        zIndex: 60,
        background: 'rgba(6,6,12,0.92)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '6px 10px',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
        {tooltip.countryName}
      </span>
      {tooltip.changePct !== null && (
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: pctColor(tooltip.changePct) }}>
          {fmtPct(tooltip.changePct)}
        </span>
      )}
      {tooltip.isOpen && (
        <span style={{
          fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
          color: '#00e676', letterSpacing: '0.08em',
          border: '1px solid rgba(0,230,118,0.4)',
          borderRadius: 3, padding: '1px 4px',
        }}>
          LIVE
        </span>
      )}
    </div>
  )
}
