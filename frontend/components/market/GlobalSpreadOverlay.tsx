'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { useStockDetail } from '@/hooks/useMarketData'
import { useLangStore } from '@/lib/langStore'
import { MarketSnapshot } from '@/types'

// 국가 중심 좌표 (위도, 경도)
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [-98, 39], KR: [127.5, 36], JP: [138, 36], CN: [105, 35], HK: [114.2, 22.3],
  DE: [10.5, 51.2], GB: [-2, 54], FR: [2.3, 46], IT: [12.8, 42.8], ES: [-3.7, 40.4],
  NL: [5.3, 52.1], CH: [8.2, 46.8], SE: [17.1, 63], PL: [19.1, 52], TR: [35, 39],
  IN: [78.9, 20.6], TW: [121, 23.5], SG: [103.8, 1.3], MY: [109.7, 4.2], ID: [113.9, -0.8],
  TH: [100.9, 15.9], VN: [107.6, 16.5], PH: [121.8, 12.9], AU: [133.8, -25.3],
  BR: [-51.9, -14.2], AR: [-63.6, -38.4], MX: [-102.5, 23.6], CA: [-96.8, 56.1],
  SA: [45.1, 23.9], ZA: [25.1, -29],
}

interface SpreadArrow {
  id: string
  fromCode: string
  toCode: string
  reason: string
  delay: number
}

interface Popup {
  code: string
  x: number
  y: number
  reason: string
}

interface Props {
  ticker: string
  markets: Record<string, MarketSnapshot>
  originCode: string
  onClose: () => void
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    obs.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => obs.disconnect()
  }, [ref])
  return size
}

export default function GlobalSpreadOverlay({ ticker, markets, originCode, onClose }: Props) {
  const { data } = useStockDetail(ticker)
  const lang = useLangStore(s => s.lang)
  const containerRef = useRef<HTMLDivElement>(null)
  const { w, h } = useContainerSize(containerRef)
  const [activePopup, setActivePopup] = useState<Popup | null>(null)
  const [animStep, setAnimStep] = useState(0)

  const spread = data?.spread
  const affected = spread?.affected ?? []

  // 애니메이션 단계별 화살표 등장
  useEffect(() => {
    if (!spread) return
    setAnimStep(0)
    const timers: ReturnType<typeof setTimeout>[] = []
    affected.forEach((_, i) => {
      timers.push(setTimeout(() => setAnimStep(i + 1), 400 + i * 600))
    })
    return () => timers.forEach(clearTimeout)
  }, [spread, affected])

  // D3 projection (지도와 동일한 파라미터)
  const projection = useCallback(() => {
    if (!w || !h) return null
    return d3.geoNaturalEarth1().scale(w / 6.5).translate([w / 2, h / 2])
  }, [w, h])

  const getXY = useCallback((code: string): [number, number] | null => {
    const coords = COUNTRY_CENTROIDS[code]
    if (!coords) return null
    const proj = projection()
    if (!proj) return null
    const pt = proj(coords)
    return pt ? [pt[0], pt[1]] : null
  }, [projection])

  if (!spread) return null

  const originXY = getXY(originCode)

  // 베지어 곡선 경로
  function arcPath(from: [number, number], to: [number, number]): string {
    const mx = (from[0] + to[0]) / 2
    const my = (from[1] + to[1]) / 2 - Math.abs(to[0] - from[0]) * 0.35
    return `M${from[0]},${from[1]} Q${mx},${my} ${to[0]},${to[1]}`
  }

  const changePct = data?.change_pct
  const isUp = (changePct ?? 0) >= 0
  const arrowColor = isUp ? '#00e676' : '#ff5252'
  const glowColor = isUp ? 'rgba(0,230,118,0.4)' : 'rgba(255,82,82,0.4)'

  return (
    <div ref={containerRef} style={{
      position: 'absolute', inset: 0, zIndex: 45, pointerEvents: 'none',
    }}>
      {/* 오버레이 배경 dim */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        animation: 'fadeSlideIn 0.3s ease forwards',
        pointerEvents: 'auto',
      }} onClick={onClose} />

      {/* 상단 정보 카드 */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(6,6,12,0.92)', backdropFilter: 'blur(20px)',
        border: `1px solid ${arrowColor}40`, borderRadius: 12,
        padding: '10px 18px', zIndex: 46, pointerEvents: 'auto',
        opacity: 0, animation: 'fadeSlideIn 0.3s ease forwards',
        maxWidth: 480, textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: arrowColor, fontFamily: 'monospace', marginBottom: 3 }}>
          {ticker} · {changePct !== null && changePct !== undefined ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          {lang === 'ko' ? spread.desc_ko : spread.desc_en}
        </div>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 8, right: 8, width: 22, height: 22,
            borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* SVG 화살표 레이어 */}
      {w > 0 && h > 0 && originXY && (
        <svg
          width={w} height={h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="arrowhead-up" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#00e676" />
            </marker>
            <marker id="arrowhead-down" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#ff5252" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* 원점 국가 강조 */}
          <circle cx={originXY[0]} cy={originXY[1]} r={10}
            fill={`${arrowColor}30`} stroke={arrowColor} strokeWidth={1.5}
            style={{ filter: `drop-shadow(0 0 8px ${arrowColor})` }} />
          <circle cx={originXY[0]} cy={originXY[1]} r={4}
            fill={arrowColor}
            style={{ filter: `drop-shadow(0 0 4px ${arrowColor})` }} />

          {/* 화살표 */}
          {affected.slice(0, animStep).map((aff, i) => {
            const toXY = getXY(aff.country)
            if (!toXY) return null
            const path = arcPath(originXY, toXY)
            const pathLen = 300 // 근사값

            return (
              <g key={aff.country}>
                {/* 글로우 경로 */}
                <path d={path} fill="none" stroke={glowColor} strokeWidth={4}
                  strokeDasharray={pathLen} strokeDashoffset={pathLen}
                  style={{
                    animation: `drawLine 0.6s ease forwards`,
                    animationDelay: '0ms',
                  }} />
                {/* 실선 */}
                <path d={path} fill="none" stroke={arrowColor} strokeWidth={1.5}
                  strokeDasharray={pathLen} strokeDashoffset={pathLen}
                  markerEnd={isUp ? 'url(#arrowhead-up)' : 'url(#arrowhead-down)'}
                  style={{
                    animation: `drawLine 0.6s ease forwards`,
                    filter: 'url(#glow)',
                  }} />
                {/* 목적지 국가 점 */}
                <circle cx={toXY[0]} cy={toXY[1]} r={6}
                  fill={`${arrowColor}25`} stroke={arrowColor} strokeWidth={1}
                  style={{
                    opacity: 0,
                    animation: `fadeSlideIn 0.3s ease forwards`,
                    animationDelay: '500ms',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                  }}
                  onClick={e => {
                    e.stopPropagation()
                    setActivePopup(prev =>
                      prev?.code === aff.country ? null : {
                        code: aff.country, x: toXY[0], y: toXY[1],
                        reason: lang === 'ko' ? aff.reason_ko : aff.reason_en,
                      }
                    )
                  }}
                />
                <circle cx={toXY[0]} cy={toXY[1]} r={3}
                  fill={arrowColor}
                  style={{ opacity: 0, animation: `fadeSlideIn 0.3s ease forwards`, animationDelay: '500ms', pointerEvents: 'none' }} />
              </g>
            )
          })}
        </svg>
      )}

      {/* 국가 팝업 */}
      {activePopup && (() => {
        const snap = markets[activePopup.code]
        const pct = snap?.change_pct
        const pctStr = pct !== null && pct !== undefined ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : null
        const pc = pct !== null && pct !== undefined ? (pct >= 0 ? '#00e676' : '#ff5252') : 'rgba(255,255,255,0.5)'
        return (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: Math.min(activePopup.x + 12, w - 200),
              top: Math.max(activePopup.y - 70, 60),
              background: 'rgba(6,6,12,0.95)', backdropFilter: 'blur(16px)',
              border: `1px solid ${arrowColor}40`, borderRadius: 10,
              padding: '10px 12px', zIndex: 47, pointerEvents: 'auto',
              minWidth: 160,
              animation: 'fadeSlideIn 0.2s ease forwards',
              boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${arrowColor}20`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#e0fbfc', fontFamily: 'monospace' }}>
                {activePopup.code}
              </span>
              {pctStr && (
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: pc }}>
                  {pctStr}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              {activePopup.reason}
            </div>
            <button onClick={() => setActivePopup(null)} style={{
              position: 'absolute', top: 5, right: 5, width: 18, height: 18,
              borderRadius: '50%', background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        )
      })()}

      <style>{`
        @keyframes drawLine {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}
