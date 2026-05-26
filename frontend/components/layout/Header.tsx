'use client'

import { useLangStore } from '@/lib/langStore'
import { useSearchStore } from '@/lib/searchStore'
import type { Lang } from '@/lib/i18n'

interface HeaderProps {
  snapshotAt?: string
}

const FLAGS: { lang: Lang; flag: string; label: string }[] = [
  { lang: 'ko', flag: '🇰🇷', label: '한국어' },
  { lang: 'en', flag: '🇺🇸', label: 'English' },
]

export default function Header({ snapshotAt }: HeaderProps) {
  const { lang, setLang, t } = useLangStore()
  const setSearchOpen = useSearchStore((s) => s.setOpen)

  const formatted = snapshotAt
    ? new Date(snapshotAt).toLocaleString(t.dateLocale, {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : t.headerLoading

  return (
    <header
      className="flex items-center justify-between shrink-0 z-20"
      style={{
        height: 52,
        paddingInline: '28px',
        background: 'rgba(0,0,0,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* 로고 + 언어 선택 */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-lg font-bold tracking-tight leading-none"
            style={{
              color: '#00B4D8',
              textShadow: '0 0 12px #00B4D880',
              fontFamily: 'monospace',
            }}
          >
            {t.title}
          </span>
          <div className="flex items-center gap-1.5">
            {FLAGS.map(({ lang: l, flag, label }) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                title={label}
                style={{
                  fontSize: 13,
                  lineHeight: 1,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '1px 2px',
                  borderRadius: 3,
                  opacity: lang === l ? 1 : 0.35,
                  transition: 'opacity 0.15s',
                  filter: lang === l ? 'drop-shadow(0 0 4px rgba(0,180,216,0.5))' : 'none',
                }}
                onMouseEnter={e => { if (lang !== l) (e.currentTarget as HTMLButtonElement).style.opacity = '0.65' }}
                onMouseLeave={e => { if (lang !== l) (e.currentTarget as HTMLButtonElement).style.opacity = '0.35' }}
              >
                {flag}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[10px] tracking-widest hidden sm:block" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {t.subtitle}
        </span>
      </div>

      {/* 검색 버튼 + 갱신 시각 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSearchOpen(true)}
          title={`${t.searchTitle} (⌘K)`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 7,
            background: 'rgba(0,180,216,0.07)',
            border: '1px solid rgba(0,180,216,0.2)',
            cursor: 'pointer',
            color: 'rgba(0,180,216,0.6)',
            fontFamily: 'monospace',
            fontSize: 11,
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = 'rgba(0,180,216,0.5)'
            el.style.color = 'rgba(0,180,216,0.9)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = 'rgba(0,180,216,0.2)'
            el.style.color = 'rgba(0,180,216,0.6)'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="hidden sm:inline">⌘K</span>
        </button>
        <div className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {t.lastUpdated} {formatted}
        </div>
      </div>

      {/* 광고 슬롯 */}
      <div
        className="hidden lg:flex items-center justify-center text-[10px]"
        style={{
          width: 200,
          height: 34,
          borderRadius: 6,
          border: '1px dashed rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.15)',
          marginRight: 4,
        }}
      >
        AD
      </div>
    </header>
  )
}
