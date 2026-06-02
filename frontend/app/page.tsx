'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect } from 'react'
import { useMarkets } from '@/hooks/useMarketData'
import { useLangStore } from '@/lib/langStore'
import MarketPanel from '@/components/market/MarketPanel'
import StockDetailPanel from '@/components/market/StockDetailPanel'
import GlobalSpreadOverlay from '@/components/market/GlobalSpreadOverlay'
import Link from 'next/link'

const MarketWorldMap = dynamic(() => import('@/components/market/MarketWorldMap'), { ssr: false })

function fmtTime(isoStr: string | undefined, locale: string): string {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleString(locale, {
    timeZone: 'Asia/Seoul',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function HomePage() {
  const { data, isFetching, isLoading } = useMarkets()
  const { lang, setLang } = useLangStore()

  useEffect(() => {
    document.title = lang === 'ko'
      ? '아차차 — 아는 순간 차이 나는 차세대 글로벌 증시'
      : 'Ah-Cha-Cha — World Markets at a Glance'
  }, [lang])

  // ── 국가 패널 ──────────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null)

  // ── 종목 상세 패널 ─────────────────────────────────────────────
  const [stockTicker, setStockTicker] = useState<string | null>(null)
  const [stockPanelOpen, setStockPanelOpen] = useState(false)

  // ── 글로벌 스프레드 오버레이 ───────────────────────────────────
  const [spreadTicker, setSpreadTicker] = useState<string | null>(null)
  const [spreadOrigin, setSpreadOrigin] = useState<string | null>(null)
  const [spreadOpen, setSpreadOpen] = useState(false)

  const handleCountryClick = useCallback((code: string, name: string, x: number, y: number) => {
    setSelectedCode(code)
    setSelectedName(name)
    setClickPos({ x, y })
    setPanelOpen(true)
    setStockPanelOpen(false)
    setSpreadOpen(false)
  }, [])

  const handleCloseCountry = useCallback(() => setPanelOpen(false), [])

  const handleSelectStock = useCallback((ticker: string) => {
    setStockTicker(ticker)
    setStockPanelOpen(true)
    setSpreadOpen(false)
  }, [])

  const handleCloseStock = useCallback(() => setStockPanelOpen(false), [])

  const handleShowSpread = useCallback((ticker: string) => {
    setSpreadTicker(ticker)
    setSpreadOrigin(selectedCode)
    setSpreadOpen(true)
  }, [selectedCode])

  const handleCloseSpread = useCallback(() => setSpreadOpen(false), [])

  const markets = data?.markets ?? {}
  const updatedAt = fmtTime(data?.updated_at, lang === 'ko' ? 'ko-KR' : 'en-US')

  return (
    <div className="flex flex-col h-full w-full" style={{ background: '#000000' }}>
      {/* 헤더 */}
      <header style={{
        height: 52, paddingInline: '20px',
        background: 'rgba(0,0,0,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <span style={{
              fontSize: 17, fontWeight: 700, fontFamily: 'monospace',
              color: '#00e676', textShadow: '0 0 12px #00e67680',
              letterSpacing: '-0.5px',
            }}>
              Ah-Cha-Cha
            </span>
            <div style={{ display: 'flex', gap: 4, marginTop: 1 }}>
              {(['en', 'ko'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)} style={{
                  fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                  padding: '1px 2px', borderRadius: 3,
                  opacity: lang === l ? 1 : 0.35, transition: 'opacity 0.15s',
                  filter: lang === l ? 'drop-shadow(0 0 4px rgba(0,230,118,0.5))' : 'none',
                }}>
                  {l === 'en' ? '🇺🇸' : '🇰🇷'}
                </button>
              ))}
            </div>
          </div>
          <span style={{ fontSize: 10, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.2)' }}>
            {lang === 'ko' ? '전 세계 증시' : 'WORLD MARKETS'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {updatedAt && (
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)' }}>
              {lang === 'ko' ? '갱신:' : 'Updated:'} {updatedAt}
            </span>
          )}
          {isFetching && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#00e676" strokeWidth="2.5" strokeLinecap="round"
              style={{ animation: 'spin 0.8s linear infinite' }}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          )}
          <Link href="/legacy" style={{
            fontSize: 11, fontFamily: 'monospace',
            color: 'rgba(255,255,255,0.2)', textDecoration: 'none',
          }}>
            Security →
          </Link>
        </div>
      </header>

      {/* 지도 영역 */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <span style={{ color: '#00e676', fontFamily: 'monospace', fontSize: 13, textShadow: '0 0 10px #00e67680' }}>
              {lang === 'ko' ? '시장 데이터 로딩 중...' : 'Loading market data...'}
            </span>
          </div>
        ) : Object.keys(markets).length === 0 ? (
          <div className="flex flex-col items-center justify-center w-full h-full gap-4">
            <span style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 13 }}>
              {lang === 'ko' ? '데이터 수집 중입니다.' : 'Fetching market data...'}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontFamily: 'monospace', fontSize: 11 }}>
              {lang === 'ko' ? '첫 수집은 최대 1분 소요됩니다' : 'First fetch may take up to 1 minute'}
            </span>
          </div>
        ) : (
          <MarketWorldMap markets={markets} onCountryClick={handleCountryClick} />
        )}

        {/* 글로벌 스프레드 오버레이 (지도 위) */}
        {spreadOpen && spreadTicker && spreadOrigin && (
          <GlobalSpreadOverlay
            ticker={spreadTicker}
            markets={markets}
            originCode={spreadOrigin}
            onClose={handleCloseSpread}
          />
        )}

        {/* 국가 패널 */}
        <MarketPanel
          countryCode={selectedCode}
          countryName={selectedName}
          clickPosition={clickPos}
          onClose={handleCloseCountry}
          isOpen={panelOpen && !spreadOpen}
          onSelectStock={handleSelectStock}
        />

        {/* 종목 상세 패널 */}
        <StockDetailPanel
          ticker={stockTicker}
          onClose={handleCloseStock}
          onShowSpread={handleShowSpread}
          isOpen={stockPanelOpen && !spreadOpen}
        />
      </div>
    </div>
  )
}
