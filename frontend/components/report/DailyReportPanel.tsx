'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchLatestNews } from '@/lib/api'
import { NewsArticle } from '@/types'
import { useLangStore } from '@/lib/langStore'
import type { Translations } from '@/lib/i18n'
import { CATEGORIES, Category, detectCategories, filterByCategories } from '@/lib/categories'

const LEVEL_COLOR: Record<number, string> = {
  4: '#FF2D2D',
  3: '#FF8C00',
  2: '#FFD700',
  1: '#39FF14',
}

const LEVEL_LABEL: Record<number, string> = {
  4: 'Critical',
  3: 'High',
  2: 'Medium',
  1: 'Low',
}

const CATEGORY_LABEL_KEY: Record<Category, keyof Translations> = {
  mobile:         'categoryMobile',
  ransomware:     'categoryRansomware',
  apt:            'categoryApt',
  vulnerability:  'categoryVulnerability',
  breach:         'categoryBreach',
  finance:        'categoryFinance',
  infrastructure: 'categoryInfrastructure',
  cloud:          'categoryCloud',
  korea:          'categoryKorea',
}

function generateReportText(articles: NewsArticle[], t: Translations): string {
  const today = new Date().toLocaleDateString(t.dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const lines = [
    t.reportHeader,
    t.reportDateLine(today, articles.length),
    '='.repeat(52),
    '',
  ]

  for (const a of articles) {
    const label = LEVEL_LABEL[a.threat_level] ?? 'Unknown'
    lines.push(`[LV.${a.threat_level} ${label}] ${a.summary_title ?? ''}`)
    lines.push('')
    if (a.summary_what) {
      lines.push(t.reportOverview)
      lines.push(a.summary_what)
      lines.push('')
    }
    if (a.summary_impact) {
      lines.push(t.reportImpact)
      lines.push(a.summary_impact)
      lines.push('')
    }
    lines.push(`${t.reportSource} ${a.url}`)
    lines.push('-'.repeat(52))
    lines.push('')
  }

  return lines.join('\n')
}

export default function DailyReportPanel() {
  const [open, setOpen] = useState(false)
  const [selectedCats, setSelectedCats] = useState<Set<Category>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['latest-news'],
    queryFn: () => fetchLatestNews(100),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })

  const allArticles = data?.articles ?? []
  const t = useLangStore((s) => s.t)

  const articles = filterByCategories(allArticles, selectedCats)

  const catCounts = Object.fromEntries(
    CATEGORIES.map((cat) => [
      cat.id,
      allArticles.filter((a) => detectCategories(a).includes(cat.id)).length,
    ])
  ) as Record<Category, number>

  const toggleCat = (cat: Category) => {
    setSelectedCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const handleDownload = () => {
    const text = generateReportText(articles, t)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ahchacha-report-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(true)}
        title="일일 보안 리포트"
        style={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: 'rgba(0,180,216,0.12)',
          border: '1px solid rgba(0,180,216,0.35)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 18px rgba(0,180,216,0.18)',
          transition: 'box-shadow 0.2s, border-color 0.2s',
          zIndex: 40,
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.boxShadow = '0 0 28px rgba(0,180,216,0.45)'
          el.style.borderColor = 'rgba(0,180,216,0.75)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.boxShadow = '0 0 18px rgba(0,180,216,0.18)'
          el.style.borderColor = 'rgba(0,180,216,0.35)'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="rgba(0,180,216,0.85)" strokeWidth="1.7"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      </button>

      {/* 패널 오버레이 */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 50,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div style={{
            width: 480,
            maxWidth: '100vw',
            height: '100vh',
            background: 'rgba(7,7,13,0.96)',
            borderLeft: '1px solid rgba(0,180,216,0.18)',
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.28s cubic-bezier(0.22,1,0.36,1)',
          }}>

            {/* 헤더 */}
            <div style={{
              padding: '20px 22px 18px',
              borderBottom: '1px solid rgba(0,180,216,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <div style={{
                  color: '#e0fbfc',
                  fontSize: 15,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  letterSpacing: '0.04em',
                }}>
                  {t.dailyReport}
                </div>
                <div style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: 11,
                  marginTop: 3,
                  fontFamily: 'monospace',
                }}>
                  {t.dailyReportDate(
                    new Date().toLocaleDateString(t.dateLocale),
                    articles.length
                  )}
                  {selectedCats.size > 0 && (
                    <span style={{ color: 'rgba(0,180,216,0.6)', marginLeft: 6 }}>
                      · {t.categoryAll} {allArticles.length}건 중
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDownload}
                  disabled={articles.length === 0}
                  title="리포트 다운로드"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: 'rgba(0,180,216,0.1)',
                    border: '1px solid rgba(0,180,216,0.28)',
                    cursor: articles.length > 0 ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: articles.length > 0 ? 1 : 0.35,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(0,180,216,0.85)" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>

                <button
                  onClick={() => setOpen(false)}
                  title="닫기"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 카테고리 필터 칩 */}
            <div style={{
              padding: '10px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}>
              {/* 전체 칩 */}
              <button
                onClick={() => setSelectedCats(new Set())}
                style={{
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${selectedCats.size === 0 ? 'rgba(0,180,216,0.7)' : 'rgba(255,255,255,0.12)'}`,
                  background: selectedCats.size === 0 ? 'rgba(0,180,216,0.15)' : 'transparent',
                  color: selectedCats.size === 0 ? '#00B4D8' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s',
                }}
              >
                {t.categoryAll}{allArticles.length > 0 ? ` (${allArticles.length})` : ''}
              </button>

              {CATEGORIES.map((cat) => {
                const isActive = selectedCats.has(cat.id)
                const count = catCounts[cat.id]
                if (count === 0) return null
                const label = t[CATEGORY_LABEL_KEY[cat.id]] as string
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleCat(cat.id)}
                    style={{
                      flexShrink: 0,
                      padding: '4px 10px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1px solid ${isActive ? cat.color : 'rgba(255,255,255,0.12)'}`,
                      background: isActive ? `${cat.color}20` : 'transparent',
                      color: isActive ? cat.color : 'rgba(255,255,255,0.4)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {cat.icon} {label} ({count})
                  </button>
                )
              })}
            </div>

            {/* 기사 목록 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
              {isLoading ? (
                <div style={{
                  color: 'rgba(0,180,216,0.6)',
                  textAlign: 'center',
                  marginTop: 64,
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}>
                  {t.reportLoading}
                </div>
              ) : articles.length === 0 ? (
                <div style={{
                  color: 'rgba(255,255,255,0.25)',
                  textAlign: 'center',
                  marginTop: 64,
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}>
                  {selectedCats.size > 0
                    ? '선택한 카테고리의 기사가 없습니다'
                    : t.noArticles}
                </div>
              ) : (
                articles.map((article, i) => {
                  const color = LEVEL_COLOR[article.threat_level] ?? '#555'
                  const cats = detectCategories(article)
                  return (
                    <div key={String(article.id ?? i)} style={{
                      marginBottom: 12,
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.025)',
                      border: `1px solid ${color}1a`,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 10,
                    }}>
                      {/* 레벨 + 제목 */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          flexShrink: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: `${color}1a`,
                          color,
                          fontFamily: 'monospace',
                          letterSpacing: '0.05em',
                        }}>
                          LV.{article.threat_level}
                        </span>
                        <span style={{
                          color: '#e0fbfc',
                          fontSize: 13,
                          fontWeight: 600,
                          lineHeight: 1.45,
                        }}>
                          {article.summary_title}
                        </span>
                      </div>

                      {/* 카테고리 태그 */}
                      {cats.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {cats.map((catId) => {
                            const catDef = CATEGORIES.find((c) => c.id === catId)
                            if (!catDef) return null
                            return (
                              <span key={catId} style={{
                                fontSize: 10,
                                padding: '1px 6px',
                                borderRadius: 10,
                                background: `${catDef.color}15`,
                                color: `${catDef.color}cc`,
                                border: `1px solid ${catDef.color}30`,
                                fontFamily: 'monospace',
                              }}>
                                {catDef.icon} {t[CATEGORY_LABEL_KEY[catId]] as string}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {/* 사건 개요 */}
                      {article.summary_what && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{
                            color: 'rgba(0,180,216,0.55)',
                            fontSize: 10,
                            fontFamily: 'monospace',
                            marginBottom: 4,
                            letterSpacing: '0.06em',
                          }}>
                            {t.overviewLabel}
                          </div>
                          <div style={{
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 12,
                            lineHeight: 1.65,
                          }}>
                            {article.summary_what}
                          </div>
                        </div>
                      )}

                      {/* 피해/영향 */}
                      {article.summary_impact && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{
                            color: 'rgba(255,140,0,0.55)',
                            fontSize: 10,
                            fontFamily: 'monospace',
                            marginBottom: 4,
                            letterSpacing: '0.06em',
                          }}>
                            {t.damagesLabel}
                          </div>
                          <div style={{
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: 12,
                            lineHeight: 1.65,
                          }}>
                            {article.summary_impact}
                          </div>
                        </div>
                      )}

                      {/* 원문 링크 */}
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: 'rgba(0,180,216,0.5)',
                          fontSize: 11,
                          fontFamily: 'monospace',
                          textDecoration: 'none',
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        {t.viewSourceLink}
                      </a>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
