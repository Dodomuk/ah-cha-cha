'use client'

import dynamic from 'next/dynamic'
import Header from '@/components/layout/Header'
import CountryPanel from '@/components/panel/CountryPanel'
import DailyReportPanel from '@/components/report/DailyReportPanel'
import { useCountries } from '@/hooks/useCountries'

// Canvas 컴포넌트는 SSR 불가
const WorldMap = dynamic(() => import('@/components/map/WorldMap'), { ssr: false })

export default function HomePage() {
  const { data, isLoading } = useCountries()
  const threatData = data?.countries ?? {}

  return (
    <div className="flex flex-col h-full w-full" style={{ background: '#000000' }}>
      <Header snapshotAt={data?.snapshot_at} />

      {/* 지도 + 패널 영역 */}
      <div className="flex-1 relative overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center w-full h-full">
            <div
              className="text-sm font-mono"
              style={{ color: '#00B4D8', textShadow: '0 0 10px #00B4D8' }}
            >
              보안 위협 데이터 로딩 중...
            </div>
          </div>
        ) : (
          <WorldMap threatData={threatData} />
        )}

        {/* 국가 상세 패널 */}
        <CountryPanel />

        {/* 일일 보안 리포트 */}
        <DailyReportPanel />
      </div>
    </div>
  )
}
