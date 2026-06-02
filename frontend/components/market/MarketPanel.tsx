'use client'

import { useEffect, useState } from 'react'
import { useCountryMarket } from '@/hooks/useMarketData'
import { useLangStore } from '@/lib/langStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { HistoryPoint } from '@/types'

const POPUP_W = 340
const POPUP_MAX_H = 420

function calcPosition(cx: number, cy: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const offset = 20
  let left = cx + offset
  if (left + POPUP_W > vw - 16) left = cx - POPUP_W - offset
  let top = cy - POPUP_MAX_H / 2
  top = Math.max(60, Math.min(top, vh - POPUP_MAX_H - 16))
  return { left, top }
}

function fmtPct(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function fmtValue(val: number | null): string {
  if (val === null) return '—'
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function pctColor(pct: number | null): string {
  if (pct === null) return 'rgba(255,255,255,0.4)'
  return pct >= 0 ? '#00e676' : '#ff5252'
}

function SparkLine({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) return null
  const closes = history.map(p => p.close).filter((c): c is number => c !== null)
  if (closes.length < 2) return null

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const w = 280
  const h = 56
  const step = w / (closes.length - 1)
  const pts = closes.map((c, i) => `${i * step},${h - ((c - min) / range) * h}`).join(' ')
  const isUp = closes[closes.length - 1] >= closes[0]
  const color = isUp ? '#00e676' : '#ff5252'

  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
      />
      <circle
        cx={(closes.length - 1) * step}
        cy={h - ((closes[closes.length - 1] - min) / range) * h}
        r={3}
        fill={color}
      />
    </svg>
  )
}

interface MarketPanelProps {
  countryCode: string | null
  countryName: string | null
  clickPosition: { x: number; y: number } | null
  onClose: () => void
  isOpen: boolean
}

export default function MarketPanel({
  countryCode, countryName, clickPosition, onClose, isOpen,
}: MarketPanelProps) {
  const { data, isLoading } = useCountryMarket(countryCode)
  const lang = useLangStore(s => s.lang)
  const isMobile = useIsMobile()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setVisible(true), 10)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
    }
  }, [isOpen])

  if (!isOpen || !clickPosition) return null

  const snap = data?.snapshot
  const history = data?.history ?? []
  const indexName = lang === 'ko' ? snap?.index_name_ko : snap?.index_name
  const isMarketOpen = snap?.is_open ?? false
  const color = snap ? pctColor(snap.change_pct) : 'rgba(255,255,255,0.4)'

  const updatedAt = snap
    ? new Date(snap.updated_at).toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', {
        timeZone: 'Asia/Seoul',
        month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* 헤더 */}
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#e0fbfc', fontFamily: 'monospace' }}>
              {countryName}
            </div>
            {indexName && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', marginTop: 2 }}>
                {indexName} · {snap?.ticker}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMarketOpen && (
              <span style={{
                fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                color: '#00e676', border: '1px solid rgba(0,230,118,0.4)',
                borderRadius: 3, padding: '2px 5px', letterSpacing: '0.08em',
              }}>
                LIVE
              </span>
            )}
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer', fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div style={{ padding: '14px 18px', flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            Loading...
          </div>
        ) : snap ? (
          <>
            {/* 등락률 + 지수값 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1 }}>
                {fmtPct(snap.change_pct)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 16, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)' }}>
                  {fmtValue(snap.current_value)}
                </span>
                {snap.change_abs !== null && (
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color }}>
                    {snap.change_abs >= 0 ? '+' : ''}{snap.change_abs.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {/* 스파크라인 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', marginBottom: 8, letterSpacing: '0.06em' }}>
                {lang === 'ko' ? '30일 추이' : '30-day trend'}
              </div>
              <SparkLine history={history} />
            </div>

            {/* 전일 종가 + 갱신 시각 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {snap.prev_close !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
                    {lang === 'ko' ? '전일 종가' : 'Prev close'}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.6)' }}>
                    {fmtValue(snap.prev_close)}
                  </span>
                </div>
              )}
              {updatedAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
                    {lang === 'ko' ? (isMarketOpen ? '장 운영 중' : '장 마감') : (isMarketOpen ? 'Market open' : 'Market closed')}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.35)' }}>
                    {updatedAt}
                  </span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            {lang === 'ko' ? '데이터 없음' : 'No data'}
          </div>
        )}
      </div>
    </div>
  )

  // 모바일: 바텀시트
  if (isMobile) {
    return (
      <>
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0,
          background: visible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
          transition: 'background 0.28s', zIndex: 49,
        }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: '60dvh', zIndex: 50, display: 'flex', flexDirection: 'column',
          borderRadius: '20px 20px 0 0',
          background: 'rgba(6,6,12,0.97)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderBottom: 'none',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
          </div>
          <div style={{ height: 2, background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)`, flexShrink: 0 }} />
          {content}
        </div>
      </>
    )
  }

  // 데스크톱: 팝업
  const pos = calcPosition(clickPosition.x, clickPosition.y)
  return (
    <div style={{
      position: 'fixed', left: pos.left, top: pos.top,
      width: POPUP_W, maxHeight: POPUP_MAX_H, zIndex: 50,
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
      transition: 'opacity 0.22s cubic-bezier(0.22,1,0.36,1), transform 0.22s cubic-bezier(0.22,1,0.36,1)',
      display: 'flex', flexDirection: 'column',
      borderRadius: 16,
      background: 'rgba(6,6,12,0.88)',
      backdropFilter: 'blur(40px) saturate(1.8)',
      WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: `0 0 0 1px ${color}30, 0 8px 16px rgba(0,0,0,0.4), 0 32px 80px rgba(0,0,0,0.75)`,
    }}>
      <div style={{ height: 3, borderRadius: '16px 16px 0 0', background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)`, flexShrink: 0 }} />
      {content}
    </div>
  )
}
