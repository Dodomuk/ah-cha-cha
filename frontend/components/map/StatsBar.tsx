'use client'

import { useStats } from '@/hooks/useStats'
import { useLangStore } from '@/lib/langStore'
import { useIsMobile } from '@/hooks/useIsMobile'

function HDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginInline: -2 }} />
}

export default function StatsBar() {
  const { data } = useStats()
  const t = useLangStore((s) => s.t)
  const isMobile = useIsMobile()

  // 모바일에서는 지도 위에 겹쳐 공간 확보 — 숨김
  if (isMobile) return null

  const LEVELS = [
    { key: '4', label: t.levelCritical, color: '#FF2D2D' },
    { key: '3', label: t.levelHigh,     color: '#FF8C00' },
    { key: '2', label: t.levelMedium,   color: '#FFD700' },
    { key: '1', label: t.levelLow,      color: '#39FF14' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        width: 108,
        borderRadius: 14,
        background: 'rgba(8,8,14,0.78)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* 7일 수집 */}
      <div style={{ padding: '10px 12px 9px' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.28)', marginBottom: 3, letterSpacing: 0.4 }}>
          {t.stats7d}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 700, color: '#00B4D8', lineHeight: 1, letterSpacing: -1 }}>
            {data ? data.total_7d.toLocaleString() : '—'}
          </span>
          {t.statsUnit && <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(0,180,216,0.45)' }}>{t.statsUnit}</span>}
        </div>
      </div>

      <HDivider />

      {/* 오늘 탐지 */}
      <div style={{ padding: '9px 12px 10px' }}>
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.28)', marginBottom: 3, letterSpacing: 0.4 }}>
          {t.statsToday}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
          <span style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 700, color: '#00E5FF', lineHeight: 1, letterSpacing: -1 }}>
            {data ? data.today.toLocaleString() : '—'}
          </span>
          {t.statsUnit && <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(0,229,255,0.45)' }}>{t.statsUnit}</span>}
        </div>
      </div>

      <HDivider />

      {/* 레벨별 */}
      <div style={{ padding: '8px 12px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {LEVELS.map(({ key, label, color }) => {
          const count = data?.by_level[key] ?? 0
          const active = !!data && count > 0
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 6, color: active ? color : 'rgba(255,255,255,0.15)', lineHeight: 1 }}>●</span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)' }}>
                  {label}
                </span>
              </div>
              <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: active ? color : 'rgba(255,255,255,0.18)', letterSpacing: -0.5 }}>
                {data ? count : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
