'use client'

import { useState, useEffect } from 'react'
import { useLangStore } from '@/lib/langStore'
import Link from 'next/link'
import EventMap from './components/EventMap'

interface Event {
  id: string
  title: string
  summary: string
  category: string
  threat_level: number
  countries: string[]
  animation_config?: string
  collected_at: string
}

export default function HomePage() {
  const { lang, setLang } = useLangStore()
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'latest' | 'history'>('latest')
  const [animationKey, setAnimationKey] = useState(0)

  useEffect(() => {
    document.title = lang === 'ko' ? 'Ah-Cha-Cha — 실시간 속보' : 'Ah-Cha-Cha — Breaking News'
  }, [lang])

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api-ah-cha-cha.onrender.com'

    const fetchEvents = async () => {
      try {
        const limit = tab === 'latest' ? 50 : 200
        const res = await fetch(`${apiBase}/api/events?limit=${limit}`)
        const data = await res.json()
        setEvents(data.events || [])
      } catch (e) {
        console.error('Failed to fetch events:', e)
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()

    // WebSocket 연결
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null

    const connectWebSocket = () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://api-ah-cha-cha.onrender.com'
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
              setEvents((prev) => [message, ...prev].slice(0, 50))
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

    // Fallback: 30초 폴링
    const interval = setInterval(fetchEvents, 30000)

    return () => {
      clearInterval(interval)
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [tab])

  const categoryEmoji: Record<string, string> = {
    security: '🔒',
    conflict: '⚔️',
    politics: '🏛️',
    tech: '💻',
    sports: '⚽',
    general: '📰',
  }

  const threatColor = (level: number) => {
    if (level >= 4) return '#ff5252'
    if (level >= 3) return '#ff9100'
    if (level >= 2) return '#ffc107'
    return '#4caf50'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000' }}>
      {/* 헤더 */}
      <header style={{
        background: 'rgba(0,0,0,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#00e676', fontFamily: 'monospace' }}>
            Ah-Cha-Cha
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            {lang === 'ko' ? '실시간 속보' : 'BREAKING NEWS'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['en', 'ko'] as const).map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                style={{
                  background: lang === l ? 'rgba(0,230,118,0.2)' : 'transparent',
                  border: `1px solid ${lang === l ? '#00e676' : 'rgba(255,255,255,0.1)'}`,
                  color: lang === l ? '#00e676' : 'rgba(255,255,255,0.5)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {l === 'en' ? '🇺🇸' : '🇰🇷'}
              </button>
            ))}
          </div>
          <Link href="/legacy" style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.3)',
            textDecoration: 'none',
          }}>
            Security →
          </Link>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 이벤트 목록 */}
        <div style={{
          flex: '1',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* 탭 */}
          <div style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '0 20px',
            background: 'rgba(0,0,0,0.3)',
          }}>
            {(['latest', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                onMouseEnter={(e) => {
                  if (tab !== t) {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = 'rgba(255,255,255,0.6)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (tab !== t) {
                    const el = e.currentTarget as HTMLElement
                    el.style.color = 'rgba(255,255,255,0.3)'
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: tab === t ? '#00e676' : 'rgba(255,255,255,0.3)',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  borderBottom: tab === t ? '2px solid #00e676' : 'none',
                  transition: 'color 0.2s',
                }}
              >
                {t === 'latest' ? (lang === 'ko' ? '최신' : 'Latest') : (lang === 'ko' ? '이력' : 'History')}
              </button>
            ))}
          </div>

          {/* 이벤트 목록 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
            {loading ? (
              <div style={{ color: '#00e676', fontFamily: 'monospace' }}>
                {lang === 'ko' ? '로딩 중...' : 'Loading...'}
              </div>
            ) : events.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                {lang === 'ko' ? '이벤트가 없습니다' : 'No events'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {events.map(event => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = 'rgba(255,255,255,0.08)'
                      el.style.borderColor = 'rgba(0,230,118,0.2)'
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement
                      el.style.background = 'rgba(255,255,255,0.05)'
                      el.style.borderColor = 'rgba(255,255,255,0.08)'
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid rgba(255,255,255,0.08)`,
                      padding: '12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'start', marginBottom: 6 }}>
                      <span style={{ fontSize: 18 }}>
                        {categoryEmoji[event.category as keyof typeof categoryEmoji] || '📰'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                          {event.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                          {event.countries.join(', ')} {event.category}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: threatColor(event.threat_level),
                          opacity: 0.8,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#000',
                        }}
                      >
                        {event.threat_level}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                      {event.summary.substring(0, 100)}...
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 상세 정보 패널 */}
        {selectedEvent && (
          <div style={{
            width: 'min(100%, 450px)',
            minWidth: '280px',
            background: 'rgba(0,0,0,0.6)',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            padding: '20px',
            overflow: 'auto',
            maxHeight: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#00e676' }}>
                {categoryEmoji[selectedEvent.category as keyof typeof categoryEmoji] || '📰'} {selectedEvent.category.toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setAnimationKey(k => k + 1)}
                  style={{
                    background: 'rgba(0,230,118,0.1)',
                    border: '1px solid rgba(0,230,118,0.3)',
                    color: '#00e676',
                    padding: '4px 8px',
                    borderRadius: 3,
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                >
                  {lang === 'ko' ? '재생' : 'Replay'}
                </button>
                <button
                  onClick={() => setSelectedEvent(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.3)',
                    cursor: 'pointer',
                    fontSize: 18,
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
                {selectedEvent.title}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                {selectedEvent.summary}
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                {lang === 'ko' ? '관련 국가' : 'Countries'}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selectedEvent.countries.map(c => (
                  <span
                    key={c}
                    style={{
                      background: 'rgba(0,230,118,0.1)',
                      border: '1px solid rgba(0,230,118,0.3)',
                      color: '#00e676',
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontSize: 10,
                      fontFamily: 'monospace',
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            <EventMap
              key={`${selectedEvent.id}-${animationKey}`}
              title={selectedEvent.title}
              countries={selectedEvent.countries}
              animationConfig={selectedEvent.animation_config}
              threatLevel={selectedEvent.threat_level}
            />
          </div>
        )}
      </div>
    </div>
  )
}
