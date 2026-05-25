'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useCountryNews } from '@/hooks/useCountryNews'
import { THREAT_STROKE, THREAT_CONFIG, THREAT_LABEL } from '@/lib/threatColors'
import NewsCard from './NewsCard'

const POPUP_W = 520
const POPUP_MAX_H = 580

function calcPosition(cx: number, cy: number): { left: number; top: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const offset = 20

  let left = cx + offset
  if (left + POPUP_W > vw - 16) left = cx - POPUP_W - offset

  let top = cy - POPUP_MAX_H / 2
  top = Math.max(60, Math.min(top, vh - POPUP_MAX_H - 16))

  return { left, top }
}

const LEVEL_ICON: Record<number, string> = { 4: '🔴', 3: '🟠', 2: '🟡', 1: '🟢', 0: '⚪' }

function getFlagEmoji(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map(c => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('')
}

export default function CountryPanel() {
  const { isPanelOpen, selectedCountryCode, selectedCountryName, clickPosition, closePanel, hours } = useAppStore()
  const { data, isLoading } = useCountryNews(selectedCountryCode, hours)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isPanelOpen) {
      const t = setTimeout(() => setVisible(true), 10)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
    }
  }, [isPanelOpen])

  if (!isPanelOpen || !clickPosition) return null

  const level = data?.threat_level ?? 0
  const color = THREAT_STROKE[level]
  const config = THREAT_CONFIG[level]
  const pos = calcPosition(clickPosition.x, clickPosition.y)

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: POPUP_W,
        maxHeight: POPUP_MAX_H,
        zIndex: 50,
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
        transition: 'opacity 0.22s cubic-bezier(0.22,1,0.36,1), transform 0.22s cubic-bezier(0.22,1,0.36,1)',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 18,
        // 위협 레벨 색상이 배경에 은은하게 베이는 radial gradient
        background: `radial-gradient(ellipse at top, ${color}0d 0%, transparent 55%), rgba(9, 9, 13, 0.82)`,
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        border: `1px solid rgba(255,255,255,0.07)`,
        // 상단 라인을 gradient로
        outline: `1.5px solid transparent`,
        boxShadow: `
          0 0 0 1px ${color}30,
          0 8px 16px rgba(0,0,0,0.4),
          0 32px 80px rgba(0,0,0,0.75),
          inset 0 1px 0 rgba(255,255,255,0.06)
        `,
      }}
    >
      {/* 상단 컬러 액센트 바 */}
      <div
        style={{
          height: 3,
          borderRadius: '18px 18px 0 0',
          background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)`,
          flexShrink: 0,
        }}
      />

      {/* 헤더 */}
      <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0">
        <div className="flex flex-col gap-1.5 min-w-0 pr-3">
          {/* 국가명 + 국기 */}
          <div className="flex items-center gap-2">
            {selectedCountryCode && (
              <span className="text-[18px] leading-none">
                {getFlagEmoji(selectedCountryCode)}
              </span>
            )}
            <span
              className="font-bold text-[17px] text-white truncate tracking-tight"
              style={{ textShadow: `0 0 20px ${color}50` }}
            >
              {selectedCountryName || '국가 선택'}
            </span>
          </div>
          {/* 기사 수 */}
          {data && data.articles.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                보안 이슈 {data.articles.length}건
              </span>
            </div>
          )}
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={closePanel}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-150 hover:scale-110"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 16,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'white')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
        >
          ×
        </button>
      </div>

      {/* 구분선 */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginInline: 20, flexShrink: 0 }} />

      {/* 뉴스 목록 */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0, padding: '12px 20px' }}>
        {isLoading && (
          <div className="flex items-center justify-center h-32 font-mono text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>
            <span style={{ animation: 'fadeSlideIn 0.3s ease forwards' }}>로딩 중...</span>
          </div>
        )}

        {!isLoading && data?.articles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <div style={{ fontSize: 28, opacity: 0.3 }}>🛡️</div>
            <span className="text-[12px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
              최근 7일 내 보안 이슈 없음
            </span>
          </div>
        )}

        {!isLoading && data?.articles.map((article, index) => (
          <NewsCard key={article.id} article={article} cardIndex={index} />
        ))}
      </div>

      {/* 하단 여백 */}
      <div style={{ height: 8, flexShrink: 0 }} />
    </div>
  )
}
