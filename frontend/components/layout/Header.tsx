'use client'

import { useLangStore } from '@/lib/langStore'
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

      {/* 갱신 시각 */}
      <div className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {t.lastUpdated} {formatted}
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
