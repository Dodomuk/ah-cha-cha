'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useCountryNews } from '@/hooks/useCountryNews'
import { THREAT_STROKE, THREAT_CONFIG } from '@/lib/threatColors'
import { useLangStore } from '@/lib/langStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import NewsCard from './NewsCard'
import TrendChart from './TrendChart'
import { useCountryTrend } from '@/hooks/useCountryTrend'
import type { CountryNewsResponse, NewsArticle, TrendResponse } from '@/types'
import type { Translations } from '@/lib/i18n'

const POPUP_W = 520
const POPUP_MAX_H = 580

// ── 정렬 ────────────────────────────────────────────────────────

type SortMode = 'latest' | 'level'

function sortArticles(articles: NewsArticle[], mode: SortMode): NewsArticle[] {
  return [...articles].sort((a, b) => {
    if (mode === 'latest') {
      return new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
    }
    // 위험도 내림차순, 동일 시 최신순
    if (b.threat_level !== a.threat_level) return b.threat_level - a.threat_level
    return new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
  })
}

// ── 공통 유틸 ────────────────────────────────────────────────────

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

function getFlagEmoji(code: string): string {
  return code.toUpperCase().split('')
    .map(c => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('')
}

// ── 서브컴포넌트: 정렬 토글 ──────────────────────────────────────

function SortToggle({
  mode,
  onChange,
  t,
}: {
  mode: SortMode
  onChange: (m: SortMode) => void
  t: Translations
}) {
  const options: { key: SortMode; label: string }[] = [
    { key: 'latest', label: t.sortLatest },
    { key: 'level',  label: t.sortByLevel },
  ]
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '6px 20px 8px',
      flexShrink: 0,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      {options.map(({ key, label }) => {
        const active = mode === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${active ? 'rgba(0,180,216,0.5)' : 'rgba(255,255,255,0.1)'}`,
              background: active ? 'rgba(0,180,216,0.12)' : 'transparent',
              color: active ? '#00B4D8' : 'rgba(255,255,255,0.3)',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── 서브컴포넌트: 헤더 ───────────────────────────────────────────

function PanelHeader({
  countryCode, countryName, data, color, onClose, t,
}: {
  countryCode: string | null
  countryName: string | null
  data: CountryNewsResponse | undefined
  color: string
  onClose: () => void
  t: Translations
}) {
  return (
    <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0">
      <div className="flex flex-col gap-1.5 min-w-0 pr-3">
        <div className="flex items-center gap-2">
          {countryCode && (
            <span className="text-[18px] leading-none">{getFlagEmoji(countryCode)}</span>
          )}
          <span
            className="font-bold text-[17px] text-white truncate tracking-tight"
            style={{ textShadow: `0 0 20px ${color}50` }}
          >
            {countryName || '국가 선택'}
          </span>
        </div>
        {data && data.articles.length > 0 && (
          <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {t.securityIssues(data.articles.length)}
          </span>
        )}
      </div>
      <button
        onClick={onClose}
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full active:scale-95"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 18,
        }}
      >
        ×
      </button>
    </div>
  )
}

// ── 서브컴포넌트: 트렌드 ─────────────────────────────────────────

function PanelTrend({ trendData, t }: { trendData: TrendResponse; t: Translations }) {
  return (
    <div style={{ padding: '12px 20px 10px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 8 }}>
        {t.trendLabel}
      </div>
      <TrendChart points={trendData.points} />
    </div>
  )
}

// ── 서브컴포넌트: 뉴스 목록 (정렬 포함) ─────────────────────────

function PanelNewsList({
  isLoading, data, t,
}: {
  isLoading: boolean
  data: CountryNewsResponse | undefined
  t: Translations
}) {
  const [sortMode, setSortMode] = useState<SortMode>('latest')

  const sortedArticles = useMemo(
    () => sortArticles(data?.articles ?? [], sortMode),
    [data?.articles, sortMode]
  )

  const hasArticles = !isLoading && (data?.articles.length ?? 0) > 0

  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      {/* 정렬 토글 — 기사가 있을 때만 표시 */}
      {hasArticles && (
        <SortToggle mode={sortMode} onChange={setSortMode} t={t} />
      )}

      <div className="flex-1 overflow-y-auto" style={{ padding: '12px 20px' }}>
        {isLoading && (
          <div className="flex items-center justify-center h-32 font-mono text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>
            <span style={{ animation: 'fadeSlideIn 0.3s ease forwards' }}>{t.panelLoading}</span>
          </div>
        )}
        {!isLoading && sortedArticles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-3">
            <div style={{ fontSize: 28, opacity: 0.3 }}>🛡️</div>
            <span className="text-[12px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {t.noIssues}
            </span>
          </div>
        )}
        {!isLoading && sortedArticles.map((article, index) => (
          <NewsCard key={article.id} article={article} cardIndex={index} />
        ))}
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

export default function CountryPanel() {
  const { isPanelOpen, selectedCountryCode, selectedCountryName, clickPosition, closePanel, dateRange } = useAppStore()
  const { data, isLoading } = useCountryNews(selectedCountryCode, dateRange.start, dateRange.end)
  const { data: trendData } = useCountryTrend(selectedCountryCode)
  const t = useLangStore((s) => s.t)
  const isMobile = useIsMobile()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isPanelOpen) {
      const timer = setTimeout(() => setVisible(true), 10)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [isPanelOpen])

  if (!isPanelOpen || !clickPosition) return null

  const level = data?.threat_level ?? 0
  const color = THREAT_STROKE[level]
  const hasTrend = !!(trendData && trendData.points.some((p) => p.level > 0))

  const sharedContent = (
    <>
      <PanelHeader
        countryCode={selectedCountryCode}
        countryName={selectedCountryName}
        data={data}
        color={color}
        onClose={closePanel}
        t={t}
      />
      <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginInline: 20, flexShrink: 0 }} />
      {hasTrend && <PanelTrend trendData={trendData!} t={t} />}
      <PanelNewsList isLoading={isLoading} data={data} t={t} />
      <div style={{ height: 8, flexShrink: 0 }} />
    </>
  )

  // ── 모바일: 바텀시트 ─────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <div
          onClick={closePanel}
          style={{
            position: 'fixed', inset: 0,
            background: visible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
            transition: 'background 0.28s',
            zIndex: 49,
          }}
        />
        <div
          style={{
            position: 'fixed',
            bottom: 0, left: 0, right: 0,
            height: '74dvh',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '20px 20px 0 0',
            background: `radial-gradient(ellipse at top, ${color}0d 0%, transparent 45%), rgba(7,7,13,0.97)`,
            backdropFilter: 'blur(40px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            boxShadow: `0 0 0 1px ${color}25, 0 -8px 40px rgba(0,0,0,0.6)`,
            transform: visible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
          </div>
          <div style={{ height: 2, background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)`, flexShrink: 0 }} />
          {sharedContent}
        </div>
      </>
    )
  }

  // ── 데스크톱: 팝업 ───────────────────────────────────────────
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
        background: `radial-gradient(ellipse at top, ${color}0d 0%, transparent 55%), rgba(9,9,13,0.82)`,
        backdropFilter: 'blur(40px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: `
          0 0 0 1px ${color}30,
          0 8px 16px rgba(0,0,0,0.4),
          0 32px 80px rgba(0,0,0,0.75),
          inset 0 1px 0 rgba(255,255,255,0.06)
        `,
      }}
    >
      <div style={{ height: 3, borderRadius: '18px 18px 0 0', background: `linear-gradient(90deg, ${color}00, ${color}, ${color}00)`, flexShrink: 0 }} />
      {sharedContent}
    </div>
  )
}
