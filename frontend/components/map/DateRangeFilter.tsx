'use client'

import { useAppStore } from '@/lib/store'

const OPTIONS = [
  { label: '오늘', hours: 24 },
  { label: '3일', hours: 72 },
  { label: '7일', hours: 168 },
]

export default function DateRangeFilter() {
  const { hours, setHours } = useAppStore()

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 12,
        background: 'rgba(8,8,14,0.72)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {/* 캘린더 아이콘 */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>

      {OPTIONS.map((opt) => {
        const active = hours === opt.hours
        return (
          <button
            key={opt.hours}
            onClick={() => setHours(opt.hours)}
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 11,
              fontFamily: 'monospace',
              fontWeight: active ? 700 : 400,
              cursor: 'pointer',
              border: active
                ? '1px solid rgba(0,180,216,0.5)'
                : '1px solid transparent',
              background: active
                ? 'rgba(0,180,216,0.15)'
                : 'transparent',
              color: active
                ? '#00B4D8'
                : 'rgba(255,255,255,0.35)',
              transition: 'all 0.15s',
              boxShadow: active ? '0 0 10px rgba(0,180,216,0.2)' : 'none',
            }}
            onMouseEnter={e => {
              if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)'
            }}
            onMouseLeave={e => {
              if (!active) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.35)'
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
