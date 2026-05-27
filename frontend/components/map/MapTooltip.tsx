'use client'

import { TooltipState, ThreatLevel } from '@/types'
import { THREAT_STROKE } from '@/lib/threatColors'
import { useLangStore } from '@/lib/langStore'

interface Props {
  tooltip: TooltipState
}

const ROLE_LABEL: Record<string, { ko: string; color: string }> = {
  attacker: { ko: '공격자', color: '#CC00FF' },
  victim:   { ko: '피해국', color: '#FF8C00' },
  both:     { ko: '공격자·피해국', color: '#FF6030' },
}

export default function MapTooltip({ tooltip }: Props) {
  const t = useLangStore((s) => s.t)

  if (!tooltip.visible) return null

  const hasThreat = tooltip.threatLevel > 0
  const color = THREAT_STROKE[tooltip.threatLevel]
  const delta = tooltip.delta
  const roleInfo = tooltip.role ? ROLE_LABEL[tooltip.role] : null

  // 레벨 → 표시 이름
  const LEVEL_NAME: Record<number, string> = {
    4: t.levelCritical,
    3: t.levelHigh,
    2: t.levelMedium,
    1: t.levelLow,
    0: '-',
  }
  const LEVEL_COLOR: Record<number, string> = {
    4: '#FF2D2D',
    3: '#FF8C00',
    2: '#FFD700',
    1: '#39FF14',
    0: 'rgba(255,255,255,0.3)',
  }

  // 전날 레벨 계산
  const currentLevel = tooltip.threatLevel as number
  const prevLevel = delta != null ? Math.max(0, currentLevel - delta) : null

  const showDelta = hasThreat && delta != null && delta !== 0 && prevLevel != null

  return (
    <div
      style={{
        position: 'fixed',
        zIndex: 50,
        pointerEvents: 'none',
        left: tooltip.x + 16,
        top: tooltip.y,
        transform: 'translateY(-50%)',
        padding: '8px 14px',
        borderRadius: 10,
        background: 'rgba(10,12,20,0.82)',
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
        gap: 5,
      }}
    >
      {/* 국가명 */}
      <span>{tooltip.countryName}</span>

      {/* 전날 대비 레벨 변화 */}
      {showDelta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          {/* 이전 레벨명 */}
          <span style={{ color: LEVEL_COLOR[prevLevel as number], fontWeight: 700 }}>
            {LEVEL_NAME[prevLevel as number]}
          </span>
          {/* 구분 화살표 (중립 회색) */}
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>→</span>
          {/* 현재 레벨명 */}
          <span style={{ color: LEVEL_COLOR[currentLevel], fontWeight: 700 }}>
            {LEVEL_NAME[currentLevel]}
          </span>
          {/* n단계 + 방향 아이콘 (색상으로 상승/하락 구분) */}
          <span style={{
            color: delta! > 0 ? '#FF2D2D' : '#39FF14',
            fontWeight: 700,
            fontSize: 11,
            marginLeft: 2,
          }}>
            {Math.abs(delta!)}단계 {delta! > 0 ? '▲' : '▼'}
          </span>
        </div>
      )}

      {/* 역할 배지 */}
      {roleInfo && (
        <span style={{ fontSize: 10, fontWeight: 700, color: roleInfo.color, letterSpacing: '0.04em' }}>
          {roleInfo.ko}
        </span>
      )}
    </div>
  )
}
