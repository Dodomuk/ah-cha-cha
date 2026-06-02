'use client'

import { useEffect, useState } from 'react'
import { useStockDetail } from '@/hooks/useMarketData'
import { useLangStore } from '@/lib/langStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { OHLCPoint, NewsSegment } from '@/types'

function fmtPct(v: number | null) {
  if (v === null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function fmtPrice(v: number | null) {
  if (v === null) return '—'
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function fmtBig(v: number | null) {
  if (v === null) return '—'
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}

function pctColor(v: number | null) {
  if (!v) return 'rgba(255,255,255,0.4)'
  if (v > 2) return '#00e676'
  if (v > 0) return '#69f0ae'
  if (v < -2) return '#ff1744'
  return '#ff6d6d'
}

// ── 30일 라인 차트 ───────────────────────────────────────────────────
function StockChart({ history }: { history: OHLCPoint[] }) {
  const closes = history.map(p => p.close).filter((c): c is number => c !== null)
  if (closes.length < 2) return (
    <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontFamily: 'monospace' }}>No chart data</span>
    </div>
  )
  const min = Math.min(...closes), max = Math.max(...closes)
  const range = max - min || 1
  const isUp = closes[closes.length - 1] >= closes[0]
  const color = isUp ? '#00e676' : '#ff5252'
  const fillColor = isUp ? 'rgba(0,230,118,0.08)' : 'rgba(255,82,82,0.08)'

  const W = 340, H = 100
  const pts = closes.map((c, i) => ({
    x: (i / (closes.length - 1)) * W,
    y: H - ((c - min) / range) * (H - 4) - 2,
  }))

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length - 1].x},${H} L0,${H} Z`

  // 날짜 레이블
  const labelIdxs = [0, Math.floor(history.length / 2), history.length - 1]
  const labels = labelIdxs.map(i => {
    const d = history[i]?.date
    return d ? { x: pts[i]?.x ?? 0, label: d.slice(5) } : null
  }).filter(Boolean)

  return (
    <svg width={W} height={H + 18} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#chartGrad)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color}60)` }} />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={color} />
      {labels.map((l, i) => l && (
        <text key={i} x={l.x} y={H + 14} textAnchor="middle"
          style={{ fontSize: 9, fill: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
          {l.label}
        </text>
      ))}
    </svg>
  )
}

// ── 뉴스 아이템 ──────────────────────────────────────────────────────
function NewsItem({ segments, publisher, link, delay }: {
  segments: NewsSegment[]
  publisher: string
  link: string
  delay: number
}) {
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{
      display: 'block', padding: '8px 10px', borderRadius: 7,
      background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)',
      textDecoration: 'none', cursor: 'pointer',
      opacity: 0, animation: 'fadeSlideIn 0.22s ease forwards',
      animationDelay: `${delay}ms`,
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)' }}
    >
      <p style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 4px', color: 'rgba(255,255,255,0.75)' }}>
        {segments.map((seg, i) => (
          <span key={i} style={seg.highlight ? {
            background: 'rgba(250,200,30,0.2)',
            color: '#fcd34d',
            borderRadius: 3,
            padding: '0 2px',
            fontWeight: 600,
          } : {}}>
            {seg.text}
          </span>
        ))}
      </p>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
        {publisher}
      </span>
    </a>
  )
}

// ── 지표 행 ──────────────────────────────────────────────────────────
function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 600, color: color ?? 'rgba(255,255,255,0.75)' }}>{value}</span>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────
interface Props {
  ticker: string | null
  onClose: () => void
  onShowSpread: (ticker: string) => void
  isOpen: boolean
}

export default function StockDetailPanel({ ticker, onClose, onShowSpread, isOpen }: Props) {
  const { data, isLoading } = useStockDetail(ticker)
  const lang = useLangStore(s => s.lang)
  const isMobile = useIsMobile()
  const [visible, setVisible] = useState(false)
  const [newsExpanded, setNewsExpanded] = useState(false)

  useEffect(() => {
    if (isOpen) { const t = setTimeout(() => setVisible(true), 10); return () => clearTimeout(t) }
    else { setVisible(false); setNewsExpanded(false) }
  }, [isOpen])

  if (!isOpen) return null

  const color = pctColor(data?.change_pct ?? null)
  const hasSpread = !!data?.spread

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e0fbfc', fontFamily: 'monospace' }}>
              {isLoading ? '...' : (data?.name ?? ticker)}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 1 }}>
              {ticker} {data?.sector ? `· ${data.sector}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {hasSpread && (
              <button
                onClick={() => ticker && onShowSpread(ticker)}
                style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 10, fontFamily: 'monospace',
                  fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em',
                  background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                  border: '1px solid rgba(139,92,246,0.4)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.3)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.15)' }}
              >
                🌍 {lang === 'ko' ? '글로벌 영향' : 'Global Impact'}
              </button>
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
        {isLoading ? (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', padding: '30px 0' }}>
            {lang === 'ko' ? '데이터 불러오는 중...' : 'Loading...'}
          </div>
        ) : data && !data.error ? (
          <>
            {/* 현재가 + 등락률 */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'monospace', color }}>
                {fmtPct(data.change_pct)}
              </span>
              <span style={{ fontSize: 16, fontFamily: 'monospace', color: 'rgba(255,255,255,0.8)' }}>
                {fmtPrice(data.current_price)}
              </span>
            </div>

            {/* 30일 차트 */}
            <div style={{ marginBottom: 14, opacity: 0, animation: 'fadeSlideIn 0.3s ease forwards', animationDelay: '100ms' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginBottom: 6, letterSpacing: '0.06em' }}>
                {lang === 'ko' ? '30일 주가 추이' : '30-day price trend'}
              </div>
              <StockChart history={data.history} />
            </div>

            {/* 핵심 지표 */}
            <div style={{ marginBottom: 14, opacity: 0, animation: 'fadeSlideIn 0.3s ease forwards', animationDelay: '200ms' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', marginBottom: 6, letterSpacing: '0.06em' }}>
                {lang === 'ko' ? '핵심 지표' : 'KEY METRICS'}
              </div>
              <MetricRow label={lang === 'ko' ? '시가총액' : 'Market Cap'} value={fmtBig(data.market_cap)} />
              <MetricRow label="P/E" value={data.pe_ratio?.toFixed(2) ?? '—'} />
              <MetricRow label={lang === 'ko' ? '선행 P/E' : 'Forward P/E'} value={data.forward_pe?.toFixed(2) ?? '—'} />
              <MetricRow label={lang === 'ko' ? '52주 고가' : '52W High'} value={fmtPrice(data['52w_high'])} color="#69f0ae" />
              <MetricRow label={lang === 'ko' ? '52주 저가' : '52W Low'} value={fmtPrice(data['52w_low'])} color="#ff6d6d" />
              {data.dividend_yield && (
                <MetricRow label={lang === 'ko' ? '배당수익률' : 'Dividend'} value={`${(data.dividend_yield * 100).toFixed(2)}%`} color="#fbbf24" />
              )}
              {data.beta && (
                <MetricRow label="Beta" value={data.beta.toFixed(2)} />
              )}
            </div>

            {/* 뉴스 */}
            {data.news.length > 0 && (
              <div style={{ opacity: 0, animation: 'fadeSlideIn 0.3s ease forwards', animationDelay: '300ms' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                    {lang === 'ko' ? '관련 뉴스' : 'NEWS'} · {lang === 'ko' ? '노란 하이라이트 = 핵심 키워드' : 'yellow = key terms'}
                  </div>
                  {data.news.length > 3 && (
                    <button onClick={() => setNewsExpanded(v => !v)} style={{
                      fontSize: 9, fontFamily: 'monospace', color: 'rgba(0,180,216,0.6)',
                      background: 'none', border: 'none', cursor: 'pointer',
                    }}>
                      {newsExpanded
                        ? (lang === 'ko' ? '접기' : 'Less')
                        : (lang === 'ko' ? `더 보기 (+${data.news.length - 3})` : `More (+${data.news.length - 3})`)}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(newsExpanded ? data.news : data.news.slice(0, 3)).map((n, i) => (
                    <NewsItem key={i} segments={n.segments} publisher={n.publisher} link={n.link} delay={350 + i * 80} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 11, textAlign: 'center', padding: '30px 0' }}>
            {lang === 'ko' ? '데이터를 불러올 수 없습니다' : 'Unable to load data'}
          </div>
        )}
      </div>
    </div>
  )

  const panelStyle = {
    background: 'rgba(6,6,12,0.96)',
    backdropFilter: 'blur(40px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex', flexDirection: 'column' as const,
  }

  if (isMobile) {
    return (
      <>
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0,
          background: visible ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
          transition: 'background 0.28s', zIndex: 51,
        }} />
        <div style={{
          ...panelStyle, position: 'fixed', bottom: 0, left: 0, right: 0, height: '88dvh',
          zIndex: 52, borderRadius: '20px 20px 0 0', borderBottom: 'none',
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

  return (
    <div style={{
      ...panelStyle, position: 'fixed', top: 52, right: 0, bottom: 0, width: 380, zIndex: 51,
      boxShadow: `0 0 0 1px ${color}20, -8px 0 40px rgba(0,0,0,0.5)`,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateX(0)' : 'translateX(30px)',
      transition: 'opacity 0.22s ease, transform 0.22s ease',
    }}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)`, flexShrink: 0 }} />
      {content}
    </div>
  )
}
