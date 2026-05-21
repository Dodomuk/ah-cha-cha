'use client'

import { useAppStore } from '@/lib/store'
import { useCountryNews } from '@/hooks/useCountryNews'
import { THREAT_STROKE, THREAT_CONFIG } from '@/lib/threatColors'
import NewsCard from './NewsCard'

export default function CountryPanel() {
  const { isPanelOpen, selectedCountryCode, selectedCountryName, closePanel } = useAppStore()
  const { data, isLoading } = useCountryNews(selectedCountryCode)

  const level = data?.threat_level ?? 0
  const color = THREAT_STROKE[level]
  const config = THREAT_CONFIG[level]

  return (
    <div
      className="absolute top-0 right-0 h-full flex flex-col z-30 transition-transform duration-300"
      style={{
        width: 380,
        transform: isPanelOpen ? 'translateX(0)' : 'translateX(100%)',
        background: 'rgba(13,27,42,0.96)',
        borderLeft: `2px solid ${color}`,
        boxShadow: `-4px 0 24px ${color}30`,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* 패널 헤더 */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${color}30` }}
      >
        <div>
          <div className="text-[#E0FBFC] font-semibold text-base">
            {selectedCountryName || '국가 선택'}
          </div>
          {data && (
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-mono font-bold ${config.badge}`}
                style={{ boxShadow: `0 0 6px ${color}60` }}
              >
                {config.label}
              </span>
              <span className="text-[11px] text-[#4A7A8A]">
                뉴스 {data.articles.length}건
              </span>
            </div>
          )}
        </div>
        <button
          onClick={closePanel}
          className="text-[#4A7A8A] hover:text-[#E0FBFC] transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded"
          style={{ border: '1px solid #1E3448' }}
        >
          ×
        </button>
      </div>

      {/* 뉴스 목록 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {isLoading && (
          <div className="flex items-center justify-center h-32 text-[#4A7A8A] font-mono text-sm">
            로딩 중...
          </div>
        )}

        {!isLoading && data?.articles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-[#4A7A8A] font-mono text-sm gap-2">
            <span style={{ color, textShadow: `0 0 8px ${color}` }}>●</span>
            <span>최근 24시간 내 보안 이슈 없음</span>
          </div>
        )}

        {!isLoading && data?.articles.map((article) => (
          <NewsCard key={article.id} article={article} />
        ))}
      </div>

      {/* 광고 슬롯 */}
      <div
        className="flex-shrink-0 mx-3 mb-3 flex items-center justify-center text-[10px] text-[#30363D] rounded"
        style={{ height: 60, border: '1px dashed #30363D' }}
      >
        AD (300×60)
      </div>
    </div>
  )
}
