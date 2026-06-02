'use client'

import { useEffect, useState, useRef } from 'react'
import { useCountryMarket, useCountryMovers } from '@/hooks/useMarketData'
import { useLangStore } from '@/lib/langStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { HistoryPoint, StockMover } from '@/types'

const POPUP_W = 380
const POPUP_MAX_H = 560

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
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

function fmtValue(val: number | null): string {
  if (val === null) return '—'
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function pctColor(pct: number | null): string {
  if (pct === null) return 'rgba(255,255,255,0.4)'
  if (pct > 2) return '#00e676'
  if (pct > 0) return '#69f0ae'
  if (pct < -2) return '#ff1744'
  if (pct < 0) return '#ff6d6d'
  return 'rgba(255,255,255,0.4)'
}

// ── 스파크라인 ────────────────────────────────────────────────────────
function SparkLine({ history }: { history: HistoryPoint[] }) {
  const closes = history.map(p => p.close).filter((c): c is number => c !== null)
  if (closes.length < 2) return null
  const min = Math.min(...closes), max = Math.max(...closes)
  const range = max - min || 1
  const w = 320, h = 52
  const step = w / (closes.length - 1)
  const pts = closes.map((c, i) => `${i * step},${h - ((c - min) / range) * h}`).join(' ')
  const isUp = closes[closes.length - 1] >= closes[0]
  const color = isUp ? '#00e676' : '#ff5252'
  const last = closes[closes.length - 1]
  const lastX = (closes.length - 1) * step
  const lastY = h - ((last - min) / range) * h
  return (
    <svg width={w} height={h} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}80)` }} />
      <circle cx={lastX} cy={lastY} r={3} fill={color} />
    </svg>
  )
}

// ── 마켓 타이머 ──────────────────────────────────────────────────────
function MarketTimer({ isOpen, updatedAt, lang }: { isOpen: boolean; updatedAt: string; lang: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const updated = new Date(updatedAt)
  const diffMin = Math.round((now.getTime() - updated.getTime()) / 60_000)
  const ago = diffMin < 1
    ? (lang === 'ko' ? '방금 전' : 'just now')
    : (lang === 'ko' ? `${diffMin}분 전` : `${diffMin}m ago`)
  return (
    <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
      {isOpen
        ? (lang === 'ko' ? `🟢 장 운영 중 · ${ago} 갱신` : `🟢 Market open · updated ${ago}`)
        : (lang === 'ko' ? `⚫ 장 마감 · ${ago} 갱신` : `⚫ Market closed · updated ${ago}`)}
    </div>
  )
}

// ── 종목 카드 ────────────────────────────────────────────────────────
function StockCard({ stock, index, lang, onSelect }: {
  stock: StockMover
  index: number
  lang: string
  onSelect: (ticker: string) => void
}) {
  const color = pctColor(stock.change_pct)
  const delay = 200 + index * 120

  return (
    <div
      onClick={() => onSelect(stock.ticker)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 12px', borderRadius: 8, cursor: 'pointer', gap: 8,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid rgba(255,255,255,0.05)`,
        borderLeft: `2px solid ${stock.sector_color}60`,
        opacity: 0,
        animation: 'fadeSlideIn 0.25s ease forwards',
        animationDelay: `${delay}ms`,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#e0fbfc', fontFamily: 'monospace' }}>
            {lang === 'ko' ? stock.name_ko : stock.name}
          </span>
          {stock.has_spread && (
            <span style={{
              fontSize: 8, padding: '1px 4px', borderRadius: 3,
              background: 'rgba(139,92,246,0.2)', color: '#a78bfa',
              border: '1px solid rgba(139,92,246,0.3)', fontFamily: 'monospace',
              letterSpacing: '0.05em',
            }}>
              GLOBAL
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 9, padding: '1px 5px', borderRadius: 10,
            background: `${stock.sector_color}20`, color: `${stock.sector_color}`,
            border: `1px solid ${stock.sector_color}30`, fontFamily: 'monospace',
          }}>
            {lang === 'ko' ? stock.sector_ko : stock.sector}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
            {stock.ticker}
          </span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color }}>
          {fmtPct(stock.change_pct)}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
          {fmtValue(stock.current_price)}
        </div>
      </div>
    </div>
  )
}

// ── 애니메이션 텍스트 ────────────────────────────────────────────────
function AnimatedSummary({ text, color }: { text: string; color: string }) {
  const words = text.split(' ')
  return (
    <p style={{ fontSize: 12, lineHeight: 1.7, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
      {words.map((w, i) => (
        <span key={i} style={{
          display: 'inline-block', opacity: 0,
          animation: 'wordFadeIn 0.18s ease forwards',
          animationDelay: `${i * 55}ms`,
          marginRight: 3,
          color: (w.includes('%') || w.includes('섹터') || w.includes('sector')) ? color : undefined,
        }}>
          {w}
        </span>
      ))}
    </p>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
interface MarketPanelProps {
  countryCode: string | null
  countryName: string | null
  clickPosition: { x: number; y: number } | null
  onClose: () => void
  isOpen: boolean
  onSelectStock: (ticker: string) => void
}

export default function MarketPanel({
  countryCode, countryName, clickPosition, onClose, isOpen, onSelectStock,
}: MarketPanelProps) {
  const { data: marketData, isLoading: marketLoading } = useCountryMarket(countryCode)
  const { data: moversData, isLoading: moversLoading } = useCountryMovers(countryCode)
  const lang = useLangStore(s => s.lang)
  const isMobile = useIsMobile()
  const [visible, setVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<'gainers' | 'losers'>('gainers')

  useEffect(() => {
    if (isOpen) { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t) }
    else setVisible(false)
  }, [isOpen])

  if (!isOpen || !clickPosition) return null

  const snap = marketData?.snapshot
  const history = marketData?.history ?? []
  const color = snap ? pctColor(snap.change_pct) : 'rgba(255,255,255,0.4)'
  const sectorColor = moversData?.leading_sector_color ?? color

  const displayMovers = activeTab === 'gainers'
    ? (moversData?.gainers ?? [])
    : (moversData?.losers ?? [])

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e0fbfc', fontFamily: 'monospace' }}>
              {countryName}
            </div>
            {snap && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', marginTop: 1 }}>
                {lang === 'ko' ? snap.index_name_ko : snap.index_name} · {snap.ticker}
              </div>
            )}
            {snap && <MarketTimer isOpen={snap.is_open} updatedAt={snap.updated_at} lang={lang} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {snap?.is_open && (
              <span style={{
                fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: '#00e676',
                border: '1px solid rgba(0,230,118,0.4)', borderRadius: 3, padding: '2px 5px',
              }}>LIVE</span>
            )}
            <button onClick={onClose} style={{
              width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* 등락률 + 지수값 */}
        {marketLoading ? (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', padding: '20px 0' }}>
            Loading...
          </div>
        ) : snap ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color, lineHeight: 1 }}>
                {fmtPct(snap.change_pct)}
              </span>
              <div>
                <span style={{ fontSize: 15, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)' }}>
                  {fmtValue(snap.current_value)}
                </span>
                {snap.change_abs !== null && (
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color, marginLeft: 6 }}>
                    {snap.change_abs >= 0 ? '+' : ''}{snap.change_abs.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            {/* 스파크라인 */}
            {history.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginBottom: 5, letterSpacing: '0.06em' }}>
                  {lang === 'ko' ? '30일 추이' : '30-day trend'}
                </div>
                <SparkLine history={history} />
              </div>
            )}

            {/* 구분선 */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '10px 0' }} />
          </>
        ) : null}

        {/* 종목 무버스 섹션 */}
        {moversLoading && (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', padding: '12px 0' }}>
            {lang === 'ko' ? '종목 분석 중...' : 'Analyzing stocks...'}
          </div>
        )}

        {!moversLoading && moversData?.supported && (
          <>
            {/* 섹터 요약 텍스트 */}
            {moversData.leading_sector && (
              <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: `${sectorColor}10`, border: `1px solid ${sectorColor}25` }}>
                <AnimatedSummary
                  text={lang === 'ko' ? moversData.summary_ko : moversData.summary_en}
                  color={sectorColor}
                />
              </div>
            )}

            {/* 탭: 상승 / 하락 */}
            {(moversData.gainers.length > 0 || moversData.losers.length > 0) && (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                  {(['gainers', 'losers'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                      flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10,
                      fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${activeTab === tab
                        ? (tab === 'gainers' ? 'rgba(0,230,118,0.5)' : 'rgba(255,23,68,0.5)')
                        : 'rgba(255,255,255,0.1)'}`,
                      background: activeTab === tab
                        ? (tab === 'gainers' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)')
                        : 'transparent',
                      color: activeTab === tab
                        ? (tab === 'gainers' ? '#00e676' : '#ff1744')
                        : 'rgba(255,255,255,0.3)',
                    }}>
                      {tab === 'gainers'
                        ? (lang === 'ko' ? `▲ 상승 (${moversData.gainers.length})` : `▲ Gainers (${moversData.gainers.length})`)
                        : (lang === 'ko' ? `▼ 하락 (${moversData.losers.length})` : `▼ Losers (${moversData.losers.length})`)}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {displayMovers.map((stock, i) => (
                    <StockCard key={stock.ticker} stock={stock} index={i} lang={lang} onSelect={onSelectStock} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {!moversLoading && moversData && !moversData.supported && (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
            {lang === 'ko' ? '종목 데이터 준비 중' : 'Stock data coming soon'}
          </div>
        )}
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <>
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0,
          background: visible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
          transition: 'background 0.28s', zIndex: 49,
        }} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: '80dvh', zIndex: 50,
          display: 'flex', flexDirection: 'column', borderRadius: '20px 20px 0 0',
          background: 'rgba(6,6,12,0.97)',
          backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none',
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

  const pos = calcPosition(clickPosition.x, clickPosition.y)
  return (
    <div style={{
      position: 'fixed', left: pos.left, top: pos.top,
      width: POPUP_W, maxHeight: POPUP_MAX_H, zIndex: 50,
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(10px)',
      transition: 'opacity 0.22s cubic-bezier(0.22,1,0.36,1), transform 0.22s cubic-bezier(0.22,1,0.36,1)',
      display: 'flex', flexDirection: 'column', borderRadius: 16,
      background: 'rgba(6,6,12,0.92)',
      backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: `0 0 0 1px ${color}30, 0 8px 16px rgba(0,0,0,0.4), 0 32px 80px rgba(0,0,0,0.75)`,
    }}>
      <div style={{ height: 3, borderRadius: '16px 16px 0 0', background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)`, flexShrink: 0 }} />
      {content}
    </div>
  )
}
