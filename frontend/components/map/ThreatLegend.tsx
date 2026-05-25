'use client'

import { THREAT_STROKE, THREAT_LABEL } from '@/lib/threatColors'
import { ThreatLevel } from '@/types'

const LEVEL_LABEL: Record<ThreatLevel, string> = {
  4: 'Critical',
  3: 'High',
  2: 'Medium',
  1: 'Low',
  0: 'None',
}

export default function ThreatLegend() {
  const levels: ThreatLevel[] = [4, 3, 2, 1, 0]

  return (
    <div
      className="absolute bottom-6 left-6"
      style={{
        background: 'rgba(8, 8, 12, 0.72)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        fontFamily: 'monospace',
        minWidth: 160,
      }}
    >
      {/* 헤더 */}
      <div
        className="flex items-center gap-2 mb-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 10 }}
      >
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00B4D8', boxShadow: '0 0 6px #00B4D8' }} />
        <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
          Threat Level
        </span>
      </div>

      {/* 레벨 목록 */}
      <div className="flex flex-col gap-2">
        {levels.map((level) => {
          const color = THREAT_STROKE[level]
          return (
            <div key={level} className="flex items-center gap-2.5">
              {/* 컬러 인디케이터 */}
              <div style={{ position: 'relative', width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* 외부 링 */}
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: `1px solid ${color}40`,
                  background: `${color}10`,
                }} />
                {/* 내부 점 */}
                <div style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 6px ${color}, 0 0 12px ${color}60`,
                }} />
              </div>

              {/* 텍스트 */}
              <div className="flex items-baseline gap-1.5">
                <span style={{ fontSize: 12, color, fontWeight: 600 }}>
                  {LEVEL_LABEL[level]}
                </span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
                  LV.{level}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
