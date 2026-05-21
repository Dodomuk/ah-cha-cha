'use client'

import { NewsArticle } from '@/types'
import { THREAT_STROKE, THREAT_LABEL, THREAT_CONFIG } from '@/lib/threatColors'

interface Props {
  article: NewsArticle
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return '방금 전'
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export default function NewsCard({ article }: Props) {
  const color = THREAT_STROKE[article.threat_level]
  const label = THREAT_LABEL[article.threat_level]
  const badgeClass = THREAT_CONFIG[article.threat_level].badge

  return (
    <div
      className="rounded p-3 mb-2 text-sm"
      style={{
        background: '#0D1B2A',
        borderLeft: `3px solid ${color}`,
        boxShadow: `inset 0 0 20px ${color}08`,
      }}
    >
      {/* 배지 + 제목 */}
      <div className="flex items-start gap-2 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 font-mono font-bold ${badgeClass}`}>
          {label}
        </span>
        <p className="text-[#E0FBFC] font-medium leading-snug text-[13px]">
          {article.summary_title}
        </p>
      </div>

      {/* 사건 개요 */}
      {article.summary_what && (
        <div className="mb-2">
          <span className="text-[10px] text-[#7FBBCC] font-mono">무슨 일</span>
          <p className="text-[#A8C8D8] text-[12px] leading-relaxed mt-0.5">
            {article.summary_what}
          </p>
        </div>
      )}

      {/* 영향 */}
      {article.summary_impact && (
        <div className="mb-2">
          <span className="text-[10px] text-[#7FBBCC] font-mono">영향</span>
          <p className="text-[#A8C8D8] text-[12px] leading-relaxed mt-0.5">
            {article.summary_impact}
          </p>
        </div>
      )}

      {/* 출처 + 링크 */}
      <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid #1E3448' }}>
        <span className="text-[11px] text-[#4A7A8A]">{article.source_domain}</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#4A7A8A]">{timeAgo(article.collected_at)}</span>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono hover:underline"
            style={{ color }}
          >
            원문 보기 →
          </a>
        </div>
      </div>
    </div>
  )
}
