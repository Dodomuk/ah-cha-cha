'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearch } from '@/hooks/useSearch'
import { useSearchStore } from '@/lib/searchStore'
import { useLangStore } from '@/lib/langStore'
import { THREAT_STROKE } from '@/lib/threatColors'

export default function SearchModal() {
  const { open, setOpen } = useSearchStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const t = useLangStore((s) => s.t)

  const { data, isLoading } = useSearch(query)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setOpen])

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(id)
    } else {
      setQuery('')
    }
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
      }}
    >
      <div
        style={{
          width: 560,
          maxWidth: '92vw',
          maxHeight: '68vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(7,7,13,0.98)',
          border: '1px solid rgba(0,180,216,0.22)',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,180,216,0.08)',
        }}
      >
        {/* Input row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="rgba(0,180,216,0.55)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#e0fbfc',
              fontSize: 14,
              fontFamily: 'monospace',
            }}
          />
          <span style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.18)',
            fontFamily: 'monospace',
            padding: '2px 5px',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4,
          }}>
            ESC
          </span>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {query.trim().length < 2 ? (
            <div style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.2)',
              fontSize: 12,
              fontFamily: 'monospace',
            }}>
              {t.searchTip}
            </div>
          ) : isLoading ? (
            <div style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'rgba(0,180,216,0.5)',
              fontSize: 12,
              fontFamily: 'monospace',
            }}>
              {t.reportLoading}
            </div>
          ) : !data?.articles.length ? (
            <div style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.2)',
              fontSize: 12,
              fontFamily: 'monospace',
            }}>
              {t.searchNoResults}
            </div>
          ) : (
            data.articles.map((article) => {
              const color = THREAT_STROKE[article.threat_level]
              return (
                <a
                  key={article.id}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    padding: '11px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    textDecoration: 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      flexShrink: 0,
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 5px',
                      borderRadius: 3,
                      background: `${color}1a`,
                      color,
                      fontFamily: 'monospace',
                    }}>
                      LV.{article.threat_level}
                    </span>
                    <span style={{
                      color: '#e0fbfc',
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}>
                      {article.summary_title}
                    </span>
                  </div>
                  <div style={{
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                  }}>
                    {article.source_domain}
                  </div>
                </a>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
