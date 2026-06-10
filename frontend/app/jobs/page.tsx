'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface JobTrendData {
  category: string
  posting_count: number
  change_pct: number | null
}

interface WeeklySummary {
  week_date: string
  total_postings: number
  categories: JobTrendData[]
  top_keywords: string[]
}

interface HistoryData {
  [week: string]: {
    total_postings: number
    categories: {
      [category: string]: {
        count: number
        change_pct: number | null
      }
    }
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  ai_ml: '#ff6b6b',
  frontend: '#4ecdc4',
  backend: '#45b7d1',
  devops: '#f9ca24',
  security: '#6c5ce7',
}

const CATEGORY_LABELS: Record<string, string> = {
  ai_ml: 'AI/ML',
  frontend: 'Frontend',
  backend: 'Backend',
  devops: 'DevOps',
  security: 'Security',
}

export default function JobMarketPage() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null)
  const [history, setHistory] = useState<HistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Job Market Trends — Ah-Cha-Cha'
  }, [])

  useEffect(() => {
    const isProduction = typeof window !== 'undefined' && window.location.hostname === 'ahchacha.com'
    const apiBase = process.env.NEXT_PUBLIC_API_URL || (isProduction ? 'https://ah-cha-cha.onrender.com' : 'http://localhost:8000')

    const fetchData = async () => {
      try {
        setLoading(true)
        const [summaryRes, historyRes] = await Promise.all([
          fetch(`${apiBase}/api/jobs/trends/weekly`),
          fetch(`${apiBase}/api/jobs/trends/history?weeks=12`),
        ])

        if (!summaryRes.ok || !historyRes.ok) {
          throw new Error('Failed to fetch data')
        }

        const summaryData = await summaryRes.json()
        const historyData = await historyRes.json()

        if (summaryData.success) {
          setSummary(summaryData.data)
        }
        if (historyData.success) {
          setHistory(historyData.data)
        }
      } catch (e) {
        console.error('Failed to fetch job trends:', e)
        setError('Failed to load job market data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 60000) // Refresh every minute

    return () => clearInterval(interval)
  }, [])

  const chartData = summary?.categories.map(cat => ({
    name: CATEGORY_LABELS[cat.category] || cat.category,
    count: cat.posting_count,
    change: cat.change_pct || 0,
  })) || []

  const timelineData = history ? Object.entries(history)
    .sort(([dateA], [dateB]) => new Date(dateA).getTime() - new Date(dateB).getTime())
    .slice(-12)
    .map(([week, data]) => ({
      week: new Date(week).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      total: data.total_postings,
    })) : []

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#000',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes borderGlow {
          0%, 100% {
            border-color: rgba(0, 230, 118, 0.2);
            box-shadow: 0 8px 32px rgba(0, 230, 118, 0.05), inset 0 0 20px rgba(0, 230, 118, 0.05);
          }
          50% {
            border-color: rgba(0, 230, 118, 0.4);
            box-shadow: 0 8px 32px rgba(0, 230, 118, 0.2), inset 0 0 20px rgba(0, 230, 118, 0.1);
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      {/* 헤더 */}
      <header style={{
        background: 'rgba(0,0,0,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 100,
      }}>
        <div>
          <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: '#00e676',
            fontFamily: 'monospace',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ animation: 'spin 20s linear infinite' }}>📊</span> Job Market Trends
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            IT Job Posting Analytics
          </div>
        </div>
        <a href="/" style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          textDecoration: 'none',
        }}>
          ← Back to News
        </a>
      </header>

      {/* 메인 컨텐츠 */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#00e676',
            fontFamily: 'monospace',
            fontSize: 14,
          }}>
            Loading job market data...
          </div>
        ) : error ? (
          <div style={{
            padding: 20,
            background: 'rgba(255, 100, 100, 0.1)',
            border: '1px solid rgba(255, 100, 100, 0.3)',
            borderRadius: 12,
            color: '#ff6464',
            fontSize: 14,
            fontFamily: 'monospace',
          }}>
            {error}
          </div>
        ) : summary ? (
          <>
            {/* 주간 요약 카드 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: 16,
            }}>
              {/* 총 공고 수 */}
              <div style={{
                background: 'rgba(10, 25, 47, 0.5)',
                border: '1px solid rgba(0, 230, 118, 0.2)',
                borderRadius: 12,
                padding: 20,
                backdropFilter: 'blur(10px)',
                animation: 'slideDown 0.5s ease-out, borderGlow 3s ease-in-out infinite',
              }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                  Total Job Postings
                </div>
                <div style={{ fontSize: 32, fontWeight: 700, color: '#00e676' }}>
                  {summary.total_postings.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                  Week of {new Date(summary.week_date).toLocaleDateString()}
                </div>
              </div>

              {/* 직군별 카드 */}
              {summary.categories.map(cat => (
                <div
                  key={cat.category}
                  style={{
                    background: 'rgba(10, 25, 47, 0.5)',
                    border: `1px solid ${CATEGORY_COLORS[cat.category] || '#00e676'}33`,
                    borderRadius: 12,
                    padding: 20,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div style={{
                    fontSize: 12,
                    color: CATEGORY_COLORS[cat.category] || '#00e676',
                    fontWeight: 600,
                    marginBottom: 8,
                  }}>
                    {CATEGORY_LABELS[cat.category]}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
                    {cat.posting_count.toLocaleString()}
                  </div>
                  {cat.change_pct !== null && (
                    <div style={{
                      fontSize: 12,
                      color: cat.change_pct >= 0 ? '#4caf50' : '#ff5252',
                      marginTop: 8,
                      fontWeight: 600,
                    }}>
                      {cat.change_pct >= 0 ? '📈' : '📉'} {cat.change_pct > 0 ? '+' : ''}{cat.change_pct.toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 차트 섹션 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: 24,
            }}>
              {/* 직군별 공고 수 비교 */}
              <div style={{
                background: 'rgba(10, 25, 47, 0.5)',
                border: '1px solid rgba(0, 230, 118, 0.15)',
                borderRadius: 12,
                padding: 20,
                backdropFilter: 'blur(10px)',
              }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#00e676',
                  marginBottom: 16,
                }}>
                  Job Postings by Category
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,230,118,0.1)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                    <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(10, 25, 47, 0.8)',
                        border: '1px solid rgba(0, 230, 118, 0.3)',
                        borderRadius: 8,
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="count" fill="#00e676" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* 주간 트렌드 */}
              {timelineData.length > 0 && (
                <div style={{
                  background: 'rgba(10, 25, 47, 0.5)',
                  border: '1px solid rgba(0, 230, 118, 0.15)',
                  borderRadius: 12,
                  padding: 20,
                  backdropFilter: 'blur(10px)',
                }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#00e676',
                    marginBottom: 16,
                  }}>
                    12-Week Trend
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,230,118,0.1)" />
                      <XAxis dataKey="week" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                      <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(10, 25, 47, 0.8)',
                          border: '1px solid rgba(0, 230, 118, 0.3)',
                          borderRadius: 8,
                          color: '#fff',
                        }}
                      />
                      <Line type="monotone" dataKey="total" stroke="#00e676" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* 키워드 섹션 */}
            {summary.top_keywords && summary.top_keywords.length > 0 && (
              <div style={{
                background: 'rgba(10, 25, 47, 0.5)',
                border: '1px solid rgba(0, 230, 118, 0.15)',
                borderRadius: 12,
                padding: 20,
                backdropFilter: 'blur(10px)',
              }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#00e676',
                  marginBottom: 16,
                }}>
                  🔥 Trending Keywords
                </div>
                <div style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}>
                  {summary.top_keywords.map((keyword, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: '8px 16px',
                        background: `linear-gradient(135deg, ${CATEGORY_COLORS[Object.keys(CATEGORY_COLORS)[idx % 5]]}22, ${CATEGORY_COLORS[Object.keys(CATEGORY_COLORS)[idx % 5]]}11)`,
                        border: `1px solid ${CATEGORY_COLORS[Object.keys(CATEGORY_COLORS)[idx % 5]]}55`,
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'monospace',
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(255,255,255,0.3)',
            fontSize: 14,
            fontFamily: 'monospace',
          }}>
            No data available
          </div>
        )}
      </div>
    </div>
  )
}
