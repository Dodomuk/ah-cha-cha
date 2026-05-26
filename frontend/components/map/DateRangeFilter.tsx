'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'

const KST_MS = 9 * 3600 * 1000
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function todayKST(): string {
  return new Date(Date.now() + KST_MS).toISOString().slice(0, 10)
}

function shiftDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00+09:00')
  return DAY_NAMES[d.getDay()]
}

function dayNum(dateStr: string): number {
  return parseInt(dateStr.slice(8), 10)
}

function getLast7Days(): string[] {
  const today = todayKST()
  return Array.from({ length: 7 }, (_, i) => shiftDays(today, i - 6))
}

export default function DateRangeFilter() {
  const { dateRange, setDateRange } = useAppStore()
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [hoverDay, setHoverDay] = useState<string | null>(null)

  const days = getLast7Days()

  // Show a preview range while the user is picking the second date
  const previewStart = pendingStart
    ? (hoverDay && hoverDay < pendingStart ? hoverDay : pendingStart)
    : dateRange.start
  const previewEnd = pendingStart
    ? (hoverDay && hoverDay > pendingStart ? hoverDay : pendingStart)
    : dateRange.end

  const handleClick = (day: string) => {
    if (!pendingStart) {
      setPendingStart(day)
    } else {
      const s = day < pendingStart ? day : pendingStart
      const e = day > pendingStart ? day : pendingStart
      setDateRange({ start: s, end: e })
      setPendingStart(null)
      setHoverDay(null)
    }
  }

  const handleCancel = () => {
    setPendingStart(null)
    setHoverDay(null)
  }

  // Month header label
  const firstMonth = parseInt(days[0].slice(5, 7), 10)
  const lastMonth = parseInt(days[6].slice(5, 7), 10)
  const monthLabel = firstMonth === lastMonth ? `${firstMonth}월` : `${firstMonth}월 · ${lastMonth}월`

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px 8px',
        borderRadius: 14,
        background: 'rgba(8,8,14,0.82)',
        backdropFilter: 'blur(24px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
        userSelect: 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 2, minHeight: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 }}>
            {monthLabel}
          </span>
        </div>
        {pendingStart ? (
          <button
            onClick={handleCancel}
            style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(0,180,216,0.55)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            취소
          </button>
        ) : (
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)' }}>
            {dateRange.start === dateRange.end
              ? `${dayNum(dateRange.start)}일`
              : `${dayNum(dateRange.start)}일 – ${dayNum(dateRange.end)}일`}
          </span>
        )}
      </div>

      {/* Day cells */}
      <div
        style={{ display: 'flex', gap: 1 }}
        onMouseLeave={() => pendingStart && setHoverDay(null)}
      >
        {days.map((day) => {
          const inRange = day >= previewStart && day <= previewEnd
          const isStart = day === previewStart
          const isEnd = day === previewEnd
          const isSingle = previewStart === previewEnd
          const isPending = day === pendingStart && !hoverDay

          let bg = 'transparent'
          let radius: string | number = 6

          if (inRange) {
            if (isSingle) {
              bg = 'rgba(0,180,216,0.28)'
              radius = 6
            } else if (isStart) {
              bg = 'rgba(0,180,216,0.25)'
              radius = '6px 0 0 6px'
            } else if (isEnd) {
              bg = 'rgba(0,180,216,0.25)'
              radius = '0 6px 6px 0'
            } else {
              bg = 'rgba(0,180,216,0.12)'
              radius = 0
            }
          }

          const isEdge = (isStart || isEnd) && inRange
          const numColor = inRange
            ? (isEdge ? '#00E0FF' : 'rgba(0,224,255,0.7)')
            : 'rgba(255,255,255,0.45)'
          const dotColor = inRange
            ? (isEdge ? 'rgba(0,224,255,0.5)' : 'rgba(0,224,255,0.3)')
            : 'rgba(255,255,255,0.18)'

          // Month boundary: show "M/D" for the 1st of a month
          const d = dayNum(day)
          const m = parseInt(day.slice(5, 7), 10)
          const label = d === 1 ? `${m}/${d}` : String(d)

          return (
            <button
              key={day}
              onClick={() => handleClick(day)}
              onMouseEnter={() => pendingStart && setHoverDay(day)}
              style={{
                width: 34,
                padding: '4px 0 5px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                background: bg,
                borderRadius: radius,
                border: 'none',
                cursor: 'pointer',
                outline: isPending ? '1.5px solid rgba(0,180,216,0.45)' : 'none',
                outlineOffset: -1,
                transition: 'background 0.08s',
              }}
            >
              <span style={{ fontSize: 9, fontFamily: 'monospace', color: dotColor, lineHeight: 1 }}>
                {dayOfWeek(day)}
              </span>
              <span style={{ fontSize: d === 1 ? 10 : 13, fontFamily: 'monospace', fontWeight: isEdge ? 700 : 400, color: numColor, lineHeight: 1 }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Hint while selecting */}
      {pendingStart && (
        <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(0,180,216,0.45)', textAlign: 'center' }}>
          {hoverDay ? `${previewStart} ~ ${previewEnd}` : '종료일 선택'}
        </div>
      )}
    </div>
  )
}
