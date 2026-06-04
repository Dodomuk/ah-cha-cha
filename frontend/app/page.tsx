'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import * as d3 from 'd3'

const WorldMap = dynamic(() => import('@/components/map/WorldMap'), {
  ssr: false,
})

interface Event {
  id: string
  title: string
  summary: string
  category: string
  keywords?: string[]
  threat_level: number
  countries: string[]
  animation_config?: string
  collected_at: string
}

const SLIDESHOW_INTERVAL = 12000

function getRelativeTime(dateString: string): string {
  if (!dateString) return ''
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

function chunkWords(words: string[], chunkSize: number = 2): string[] {
  const result = []
  for (let i = 0; i < words.length; i += chunkSize) {
    result.push(words.slice(i, i + chunkSize).join(' '))
  }
  return result
}

function getDateKey(dateString: string): string {
  if (!dateString) return 'Unknown'
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const twoDaysAgo = new Date(today)
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const threeDaysAgo = new Date(today)
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  const dateOnly = date.toDateString()
  const todayOnly = today.toDateString()
  const yesterdayOnly = yesterday.toDateString()
  const twoDaysAgoOnly = twoDaysAgo.toDateString()

  if (dateOnly === todayOnly) return 'Today'
  if (dateOnly === yesterdayOnly) return 'Yesterday'
  if (dateOnly === twoDaysAgoOnly) return '2 days ago'
  if (date > threeDaysAgo) return date.toLocaleDateString()
  return ''
}


const countryCoordinates: Record<string, [number, number]> = {
  US: [-95, 37], CA: [-106, 56], MX: [-102, 23], BR: [-51, -14], AR: [-63, -38],
  GB: [-3, 54], FR: [2, 46], DE: [10, 51], IT: [12, 42], ES: [-3, 40],
  RU: [105, 61], CN: [105, 35], IN: [78, 20], JP: [138, 36],
  AU: [133, -25], NZ: [174, -40], SG: [103, 1], TH: [100, 15], PH: [122, 12],
  TR: [35, 39], SA: [45, 24], AE: [54, 24], IL: [35, 31], EG: [30, 26],
  ZA: [24, -30], NG: [8, 9], KE: [36, 0], CO: [-74, 4],
}

export default function HomePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [currentEventId, setCurrentEventId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [displayedTitleWords, setDisplayedTitleWords] = useState<string[]>([])
  const [displayedSummaryWords, setDisplayedSummaryWords] = useState<string[]>([])
  const [isPlaying, setIsPlaying] = useState(true)
  const [resumeTimer, setResumeTimer] = useState<NodeJS.Timeout | null>(null)
  const [showNewEventBadge, setShowNewEventBadge] = useState(false)
  const [newEventTimer, setNewEventTimer] = useState<NodeJS.Timeout | null>(null)
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('Today')
  const slideshowIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    document.title = 'Ah-Cha-Cha — Breaking News'
  }, [])

  useEffect(() => {
    const isProduction = typeof window !== 'undefined' && window.location.hostname === 'ahchacha.com'
    const apiBase = process.env.NEXT_PUBLIC_API_URL || (isProduction ? 'https://ah-cha-cha.onrender.com' : 'http://localhost:8000')

    const fetchEvents = async () => {
      try {
        const res = await fetch(`${apiBase}/api/events?limit=50&language=en`)
        const data = await res.json()
        const newEvents = data.events || []
        setEvents(newEvents)
        if (newEvents.length > 0 && !currentEventId) {
          setCurrentEventId(newEvents[0].id)
        }
      } catch (e) {
        console.error('Failed to fetch events:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()

    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null

    const connectWebSocket = () => {
      try {
        const isProduction = typeof window !== 'undefined' && window.location.hostname === 'ahchacha.com'
        const apiBase = process.env.NEXT_PUBLIC_API_URL || (isProduction ? 'https://ah-cha-cha.onrender.com' : 'http://localhost:8000')
        const wsProtocol = apiBase.startsWith('https') ? 'wss:' : 'ws:'
        const wsHost = apiBase.replace(/^https?:\/\//, '')
        ws = new WebSocket(`${wsProtocol}//${wsHost}/ws`)

        ws.onopen = () => {
          console.log('WebSocket connected')
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === 'new_event') {
              const newEvent = message.event || message
              setEvents((prev) => [newEvent, ...prev].slice(0, 50))
              setCurrentEventId(newEvent.id)
              setShowNewEventBadge(true)
              if (newEventTimer) clearTimeout(newEventTimer)
              const timer = setTimeout(() => {
                setShowNewEventBadge(false)
              }, 3000)
              setNewEventTimer(timer)
            }
          } catch (e) {
            console.error('WebSocket message parse error:', e)
          }
        }

        ws.onerror = () => {
          console.warn('WebSocket error, falling back to polling')
        }

        ws.onclose = () => {
          console.warn('WebSocket closed, attempting reconnect in 5s')
          reconnectTimeout = setTimeout(connectWebSocket, 5000)
        }
      } catch (e) {
        console.error('WebSocket connection failed:', e)
      }
    }

    connectWebSocket()

    const interval = setInterval(fetchEvents, 30000)

    return () => {
      clearInterval(interval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (newEventTimer) clearTimeout(newEventTimer)
      if (resumeTimer) clearTimeout(resumeTimer)
      if (ws) ws.close()
    }
  }, [newEventTimer, resumeTimer])

  // 날짜 필터링된 이벤트
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      const dateKey = getDateKey(e.collected_at)
      return dateKey === selectedDateFilter
    })
  }, [events, selectedDateFilter])

  useEffect(() => {
    if (filteredEvents.length === 0 || !isPlaying) {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current)
        slideshowIntervalRef.current = null
      }
      return
    }

    const timer = setInterval(() => {
      setCurrentEventId((prevId) => {
        const currentIdx = filteredEvents.findIndex(e => e.id === prevId)
        const nextIdx = (currentIdx + 1) % filteredEvents.length
        return filteredEvents[nextIdx]?.id || filteredEvents[0]?.id || null
      })
    }, SLIDESHOW_INTERVAL)

    slideshowIntervalRef.current = timer

    return () => {
      if (slideshowIntervalRef.current) {
        clearInterval(slideshowIntervalRef.current)
        slideshowIntervalRef.current = null
      }
    }
  }, [filteredEvents, isPlaying])

  const currentEventIndex = useMemo(() => {
    if (!currentEventId || filteredEvents.length === 0) return 0
    const index = filteredEvents.findIndex(e => e.id === currentEventId)
    return index >= 0 ? index : 0
  }, [currentEventId, filteredEvents])

  const currentEvent = filteredEvents[currentEventIndex]

  // 단어별 애니메이션 (Word-by-word reveal with chunking)
  useEffect(() => {
    if (!currentEvent) return

    const rawTitleWords = (currentEvent.title || '')
      .split(' ')
      .filter(w => w.trim() && w.trim() !== 'undefined' && w !== 'undefined')
    const rawSummaryWords = (currentEvent.summary || '')
      .split(' ')
      .filter(w => w.trim() && w.trim() !== 'undefined' && w !== 'undefined')

    const titleWords = chunkWords(rawTitleWords, 2)
    const summaryWords = chunkWords(rawSummaryWords, 2)
    let titleIndex = 0
    let summaryIndex = 0

    setTimeout(() => {
      setDisplayedTitleWords([])
      setDisplayedSummaryWords([])
    }, 0)

    const titleTimer = setInterval(() => {
      if (titleIndex < titleWords.length) {
        setDisplayedTitleWords((prev) => [...prev, titleWords[titleIndex]])
        titleIndex++
      } else {
        clearInterval(titleTimer)
      }
    }, 250)

    const summaryTimer = setInterval(() => {
      if (summaryIndex < summaryWords.length) {
        setDisplayedSummaryWords((prev) => [...prev, summaryWords[summaryIndex]])
        summaryIndex++
      } else {
        clearInterval(summaryTimer)
      }
    }, 150)

    return () => {
      clearInterval(titleTimer)
      clearInterval(summaryTimer)
    }
  }, [currentEventId])

  const categoryEmoji: Record<string, string> = {
    security: '🔒',
    conflict: '⚔️',
    politics: '🏛️',
    tech: '💻',
    sports: '⚽',
    health: '🏥',
    environment: '🌍',
    economy: '📈',
    science: '🔬',
    entertainment: '🎬',
    disaster: '🚨',
    business: '💼',
    general: '📰',
  }

  const threatColor = (level: number) => {
    if (level >= 4) return '#ff5252'
    if (level >= 3) return '#ff9100'
    if (level >= 2) return '#ffc107'
    return '#4caf50'
  }

  // 팝업 위치 계산 (나라 위에 표시)
  const popupPosition = useMemo(() => {
    if (!currentEvent || currentEvent.countries.length === 0) {
      return { bottom: 20, left: 20 }
    }

    const firstCountry = currentEvent.countries[0]
    const coord = countryCoordinates[firstCountry]

    if (!coord || typeof window === 'undefined') {
      return { bottom: 20, left: 20 }
    }

    const width = window.innerWidth
    const height = window.innerHeight

    const projection = d3.geoMercator()
      .translate([width / 2, height / 2])
      .scale(width / 6.3)

    const projected = projection(coord as [number, number])

    if (!projected) {
      return { bottom: 20, left: 20 }
    }

    let top = projected[1] - 100
    let left = projected[0] - 240

    // 화면 경계 처리
    if (top < 20) top = 20
    if (left < 20) left = 20
    if (left + 480 > width) left = width - 500

    return { top, left, bottom: 'auto', right: 'auto' }
  }, [currentEvent])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', overflow: 'hidden' }}>
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
        @keyframes fadeInWord {
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
        @keyframes pulse {
          0%, 100% {
            opacity: 0.7;
            filter: drop-shadow(0 0 4px rgba(0, 230, 118, 0.3));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 8px rgba(0, 230, 118, 0.6));
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
          <div style={{ fontSize: 18, fontWeight: 700, color: '#00e676', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ animation: 'spin 20s linear infinite' }}>🌍</span> Ah-Cha-Cha
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
            Real-time Global News Intelligence
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/legacy" style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.3)',
            textDecoration: 'none',
          }}>
            Security →
          </Link>
        </div>
      </header>

      {/* 메인: 지도 전체 */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading ? (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#00e676',
            fontFamily: 'monospace',
            fontSize: 14,
            zIndex: 50,
          }}>
            Loading...
          </div>
        ) : currentEvent ? (
          <>
            {/* 세계 지도 (왼쪽으로 이동) */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translateX(-80px)', pointerEvents: 'none' }}>
              <WorldMap
                threatData={Object.fromEntries(
                  currentEvent.countries.map(code => [
                    code,
                    {
                      threat_level: Math.min(currentEvent.threat_level, 4) as 1 | 2 | 3 | 4,
                      confirmed: 0,
                      deaths: 0,
                      recovered: 0,
                      article_count: 1,
                    }
                  ])
                )}
                dateKey={`${currentEventIndex}`}
              />
            </div>

            {/* 팝업 카드 */}
            <div style={{
              position: 'absolute',
              ...popupPosition,
              width: 'min(100%, 480px)',
              background: 'rgba(10, 25, 47, 0.4)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(0, 230, 118, 0.2)',
              borderRadius: 12,
              padding: 20,
              zIndex: 50,
              boxShadow: '0 8px 32px rgba(0, 230, 118, 0.05), inset 0 0 20px rgba(0, 230, 118, 0.05)',
              animation: 'slideDown 0.5s ease-out, borderGlow 3s ease-in-out infinite',
            } as React.CSSProperties}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'start', marginBottom: 12 }}>
                <span style={{ fontSize: 32 }}>
                  {categoryEmoji[currentEvent.category as keyof typeof categoryEmoji] || '📰'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#00e676', textTransform: 'uppercase' }}>
                      {currentEvent.category}
                    </div>
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: threatColor(currentEvent.threat_level),
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8, lineHeight: 1.3 }}>
                    {displayedTitleWords.map((word, i) => (
                      <span key={i} style={{ animation: `fadeInWord 0.2s ease-in ${i * 0.07}s both`, display: 'inline' }}>
                        {word}{' '}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: 8 }}>
                    {displayedSummaryWords.map((word, i) => (
                      <span key={i} style={{ animation: `fadeInWord 0.2s ease-in ${i * 0.05}s both`, display: 'inline' }}>
                        {word}{' '}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {currentEvent.countries.map(c => (
                      <span
                        key={c}
                        style={{
                          background: 'rgba(0,230,118,0.1)',
                          border: '1px solid rgba(0,230,118,0.3)',
                          color: '#00e676',
                          padding: '2px 8px',
                          borderRadius: 3,
                          fontSize: 10,
                          fontWeight: 600,
                          fontFamily: 'monospace',
                        }}
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  {currentEvent.keywords && currentEvent.keywords.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {currentEvent.keywords.map((keyword, i) => (
                        <span
                          key={i}
                          style={{
                            background: 'rgba(100, 200, 255, 0.1)',
                            border: '1px solid rgba(100, 200, 255, 0.2)',
                            color: 'rgba(100, 200, 255, 0.8)',
                            padding: '2px 8px',
                            borderRadius: 3,
                            fontSize: 9,
                            fontWeight: 600,
                            fontFamily: 'monospace',
                          }}
                        >
                          #{keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 진행 표시 */}
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.4)',
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.1)',
                marginTop: 12,
              }}>
                <div>Auto-rotating ({currentEventIndex + 1}/{events.length})</div>
                {currentEvent.collected_at && (
                  <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
                    Collected: {getRelativeTime(currentEvent.collected_at)}
                  </div>
                )}
              </div>
            </div>

            {/* 이벤트 리스트 (우상단) */}
            <div style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 'min(100%, 300px)',
              maxHeight: 'calc(100% - 60px)',
              background: 'rgba(10, 25, 47, 0.5)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(0, 230, 118, 0.15)',
              borderRadius: 12,
              overflow: 'hidden',
              zIndex: 40,
              boxShadow: '0 8px 32px rgba(0, 230, 118, 0.02)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(0, 230, 118, 0.1)',
                background: 'rgba(10, 25, 47, 0.95)',
                backdropFilter: 'blur(10px)',
                position: 'sticky',
                top: 0,
                zIndex: 50,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderRadius: '12px 12px 0 0',
              }}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#00e676',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  {showNewEventBadge ? (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}>
                      <div style={{
                        width: 12,
                        height: 12,
                        border: '2px solid #00e676',
                        borderRadius: '50%',
                        borderTopColor: 'transparent',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      <span>New Event</span>
                    </div>
                  ) : (
                    'Latest News'
                  )}
                </div>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#00e676',
                    fontSize: 16,
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
              </div>

              {/* 날짜 필터 버튼 */}
              <div style={{
                display: 'flex',
                gap: 6,
                padding: '8px 12px',
                borderBottom: '1px solid rgba(0, 230, 118, 0.1)',
                background: 'rgba(10, 25, 47, 0.7)',
              }}>
                {['Today', 'Yesterday', '2 days ago'].map(dateLabel => (
                  <button
                    key={dateLabel}
                    onClick={() => setSelectedDateFilter(dateLabel)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 10,
                      fontWeight: 600,
                      border: `1px solid ${selectedDateFilter === dateLabel ? '#00e676' : 'rgba(0, 230, 118, 0.3)'}`,
                      borderRadius: 4,
                      background: selectedDateFilter === dateLabel ? 'rgba(0, 230, 118, 0.1)' : 'transparent',
                      color: selectedDateFilter === dateLabel ? '#00e676' : 'rgba(0, 230, 118, 0.6)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {dateLabel}
                  </button>
                ))}
              </div>

              <div style={{ padding: 8, overflow: 'auto', flex: 1 }}>
                {filteredEvents.map((event, idx) => {
                  const prevDate = idx > 0 ? getDateKey(filteredEvents[idx - 1].collected_at) : ''
                  const curDate = getDateKey(event.collected_at)
                  const showDateHeader = curDate && curDate !== prevDate

                  return (
                    <div key={`item-${event.id}`}>
                      {showDateHeader && (
                        <div style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'rgba(0,230,118,0.5)',
                          paddingLeft: 8,
                          marginTop: idx === 0 ? 0 : 8,
                          marginBottom: 4,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                        }}>
                          {curDate}
                        </div>
                      )}
                      <div
                        key={event.id}
                        onClick={() => {
                          if (event.id !== currentEventId) {
                            setCurrentEventId(event.id)
                            setIsPlaying(false)
                            if (slideshowIntervalRef.current) {
                              clearInterval(slideshowIntervalRef.current)
                              slideshowIntervalRef.current = null
                            }
                            if (resumeTimer) clearTimeout(resumeTimer)
                            const timer = setTimeout(() => {
                              setIsPlaying(true)
                            }, 20000)
                            setResumeTimer(timer)
                          }
                        }}
                        style={{
                          background: event.id === currentEventId ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.08)',
                          border: `1px solid ${event.id === currentEventId ? 'rgba(0,230,118,0.4)' : 'rgba(255,255,255,0.1)'}`,
                          padding: 8,
                          marginBottom: 6,
                          borderRadius: 4,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          const el = e.currentTarget as HTMLElement
                          if (event.id !== currentEventId) {
                            el.style.background = 'rgba(255,255,255,0.08)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget as HTMLElement
                          if (event.id !== currentEventId) {
                            el.style.background = 'rgba(255,255,255,0.05)'
                          }
                        }}
                      >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'start' }}>
                      <span style={{ fontSize: 12, flexShrink: 0 }}>
                        {categoryEmoji[event.category as keyof typeof categoryEmoji] || '📰'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: event.id === currentEventId ? '#00e676' : '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {event.title}
                        </div>
                        <div style={{
                          fontSize: 9,
                          color: 'rgba(255,255,255,0.4)',
                          marginTop: 2,
                        }}>
                          {event.countries.join(', ')}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: threatColor(event.threat_level),
                          flexShrink: 0,
                          animation: 'pulse 2s ease-in-out infinite',
                          boxShadow: `0 0 8px ${threatColor(event.threat_level)}`,
                        }}
                      />
                    </div>
                  </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 16,
            color: 'rgba(255,255,255,0.3)',
            fontFamily: 'monospace',
            zIndex: 50,
          }}>
            <div style={{ fontSize: 14 }}>No events available</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', maxWidth: 400, textAlign: 'center' }}>
              Backend service may be initializing. Please check Render dashboard if issue persists.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
