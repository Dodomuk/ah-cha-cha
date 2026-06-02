'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import Header from '@/components/layout/Header'
import CountryPanel from '@/components/panel/CountryPanel'
import DailyReportPanel from '@/components/report/DailyReportPanel'
import StatsBar from '@/components/map/StatsBar'
import SearchModal from '@/components/search/SearchModal'
import { useCountries } from '@/hooks/useCountries'
import { useAppStore } from '@/lib/store'
import { useLangStore } from '@/lib/langStore'

const WorldMap = dynamic(() => import('@/components/map/WorldMap'), {
  ssr: false,
})

export default function LegacyPage() {
  const dateRange = useAppStore((s) => s.dateRange)
  const { data, isFetching } = useCountries(dateRange.start, dateRange.end)
  const { setLang, t } = useLangStore()

  // 레거시 페이지는 항상 한국어
  useEffect(() => {
    setLang('ko')
  }, [setLang])

  const threatData = data?.countries ?? {}
  const isLoading = !data
  const dateKey = `${dateRange.start}_${dateRange.end}`

  return (
    <div className="flex flex-col h-full w-full" style={{ background: '#000000' }}>
      <Header snapshotAt={data?.snapshot_at} hideLangToggle />

      <div className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <div className="text-sm font-mono" style={{ color: '#00B4D8', textShadow: '0 0 10px #00B4D8' }}>
              {t.loadingMap}
            </div>
          </div>
        ) : (
          <WorldMap key={dateKey} threatData={threatData} dateKey={dateKey} />
        )}

        {isFetching && !isLoading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            zIndex: 30,
            animation: 'fadeSlideIn 0.15s ease forwards',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 20px', borderRadius: 12,
              background: 'rgba(8,8,14,0.82)',
              border: '1px solid rgba(0,180,216,0.25)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#00B4D8" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <span style={{ color: '#00B4D8', fontFamily: 'monospace', fontSize: 13 }}>
                {t.updatingMap}
              </span>
            </div>
          </div>
        )}

        <StatsBar />
        <CountryPanel />
        <DailyReportPanel />
        <SearchModal />
      </div>
    </div>
  )
}
