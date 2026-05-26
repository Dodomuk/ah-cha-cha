'use client'

import dynamic from 'next/dynamic'
import Header from '@/components/layout/Header'
import CountryPanel from '@/components/panel/CountryPanel'
import DailyReportPanel from '@/components/report/DailyReportPanel'
import DateRangeFilter from '@/components/map/DateRangeFilter'
import { useCountries } from '@/hooks/useCountries'
import { useAppStore } from '@/lib/store'

const WorldMap = dynamic(() => import('@/components/map/WorldMap'), { ssr: false })

export default function HomePage() {
  const hours = useAppStore((s) => s.hours)
  const { data, isFetching } = useCountries(hours)

  // keepPreviousData: hours 변경 중에도 이전 데이터 유지, isFetching으로 전환 감지
  const isTransitioning = isFetching && !!data
  const threatData = data?.countries ?? {}
  const isInitialLoad = !data && isFetching

  return (
    <div className="flex flex-col h-full w-full" style={{ background: '#000000' }}>
      <Header snapshotAt={data?.snapshot_at} />

      <div className="flex-1 relative overflow-hidden">
        {/* 초기 로딩 전에는 WorldMap 숨김 */}
        {isInitialLoad ? (
          <div className="flex items-center justify-center w-full h-full">
            <div
              className="text-sm font-mono"
              style={{ color: '#00B4D8', textShadow: '0 0 10px #00B4D8' }}
            >
              보안 위협 데이터 로딩 중...
            </div>
          </div>
        ) : (
          <WorldMap threatData={threatData} hours={hours} isFetching={isFetching} />
        )}

        {/* 날짜 전환 중 오버레이 */}
        {isTransitioning && !isInitialLoad && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              zIndex: 30,
              animation: 'fadeSlideIn 0.15s ease forwards',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 20px',
                borderRadius: 12,
                background: 'rgba(8,8,14,0.82)',
                border: '1px solid rgba(0,180,216,0.25)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              }}
            >
              {/* 스피너 */}
              <svg
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="#00B4D8" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              <span style={{
                color: '#00B4D8',
                fontFamily: 'monospace',
                fontSize: 13,
              }}>
                지도 갱신 중...
              </span>
            </div>
          </div>
        )}

        <DateRangeFilter />
        <CountryPanel />
        <DailyReportPanel />
      </div>
    </div>
  )
}
