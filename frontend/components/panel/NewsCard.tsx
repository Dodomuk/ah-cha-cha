'use client'

import { NewsArticle } from '@/types'
import { THREAT_STROKE } from '@/lib/threatColors'

interface Props {
  article: NewsArticle
  cardIndex?: number
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return '방금 전'
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function AnimatedWord({ word, delay }: { word: string; delay: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: 0,
        animation: 'wordFadeIn 0.18s ease forwards',
        animationDelay: `${delay}ms`,
      }}
    >
      {word}&nbsp;
    </span>
  )
}

interface SectionProps {
  icon: string
  label: string
  text: string
  color: string
  startDelay: number
  isLast?: boolean
}

function AnimatedSection({ icon, label, text, color, startDelay, isLast }: SectionProps) {
  const words = text.split(' ')
  const labelDelay = startDelay
  const lineDelay = startDelay + 100
  const wordBaseDelay = startDelay + 200

  return (
    <div className="relative pl-5 mb-3">
      {/* 타임라인 점 */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 3,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 6px ${color}`,
          opacity: 0,
          animation: 'dotPop 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards',
          animationDelay: `${labelDelay}ms`,
        }}
      />

      {/* 수직 연결선 (마지막 섹션 제외) */}
      {!isLast && (
        <div
          style={{
            position: 'absolute',
            left: 3.5,
            top: 14,
            bottom: -6,
            width: 1,
            background: `linear-gradient(to bottom, ${color}50, transparent)`,
            transformOrigin: 'top',
            transform: 'scaleY(0)',
            animation: 'lineGrow 0.4s ease forwards',
            animationDelay: `${lineDelay}ms`,
          }}
        />
      )}

      {/* 섹션 레이블 + 수평선 */}
      <div className="flex items-center gap-2 mb-1.5 overflow-hidden">
        <span
          style={{
            fontSize: 10,
            color: `${color}cc`,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            opacity: 0,
            animation: 'fadeSlideIn 0.2s ease forwards',
            animationDelay: `${labelDelay}ms`,
          }}
        >
          {icon} {label}
        </span>
        <div
          style={{
            flex: 1,
            height: 1,
            background: `linear-gradient(to right, ${color}40, transparent)`,
            transformOrigin: 'left',
            transform: 'scaleX(0)',
            animation: 'lineExpand 0.35s ease forwards',
            animationDelay: `${lineDelay}ms`,
          }}
        />
      </div>

      {/* 단어별 애니메이션 텍스트 */}
      <p className="text-[13px] font-medium leading-relaxed" style={{ color: '#c8dfe8' }}>
        {words.map((word, i) => (
          <AnimatedWord key={i} word={word} delay={wordBaseDelay + i * 45} />
        ))}
      </p>
    </div>
  )
}

export default function NewsCard({ article, cardIndex = 0 }: Props) {
  const color = THREAT_STROKE[article.threat_level]

  // 카드 인덱스에 따라 전체 타임라인 오프셋
  const base = Math.min(cardIndex, 2) * 180

  const titleWords = (article.summary_title ?? '').split(' ')
  const titleEndDelay = base + titleWords.length * 50

  const whatWords = (article.summary_what ?? '').split(' ')
  const whatEndDelay = titleEndDelay + 200 + whatWords.length * 45

  return (
    <div
      className="rounded-xl text-sm"
      style={{
        padding: 18,
        marginBottom: 28,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderLeft: `2px solid ${color}60`,
      }}
    >
      {/* 컬러 닷 + 제목 */}
      <div className="flex items-start gap-2.5 mb-3">
        <div
          style={{
            flexShrink: 0,
            marginTop: 4,
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}, 0 0 12px ${color}60`,
            opacity: 0,
            animation: 'dotPop 0.2s cubic-bezier(0.34,1.56,0.64,1) forwards',
            animationDelay: `${base}ms`,
          }}
        />
        <p className="text-[#E0FBFC] font-semibold leading-snug text-[13px]">
          {titleWords.map((word, i) => (
            <AnimatedWord key={i} word={word} delay={base + 60 + i * 50} />
          ))}
        </p>
      </div>

      {/* 섹션들 */}
      {article.summary_what && (
        <AnimatedSection
          icon="◈"
          label="무슨 일"
          text={article.summary_what}
          color={color}
          startDelay={titleEndDelay + 80}
          isLast={!article.summary_impact}
        />
      )}

      {article.summary_impact && (
        <AnimatedSection
          icon="◉"
          label="영향"
          text={article.summary_impact}
          color={color}
          startDelay={whatEndDelay + 80}
          isLast
        />
      )}

      {/* 출처 + 링크 */}
      <div
        className="flex items-center justify-between"
        style={{
          marginTop: 20,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          opacity: 0,
          animation: 'fadeSlideIn 0.2s ease forwards',
          animationDelay: `${whatEndDelay + 200}ms`,
        }}
      >
        <span className="text-[11px] text-[#4A7A8A]">{article.source_domain}</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[#4A7A8A]">{timeAgo(article.published_at ?? article.collected_at)}</span>
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
