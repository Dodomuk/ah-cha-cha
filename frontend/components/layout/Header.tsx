'use client'

interface HeaderProps {
  snapshotAt?: string
}

export default function Header({ snapshotAt }: HeaderProps) {
  const formatted = snapshotAt
    ? new Date(snapshotAt).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '로딩 중...'

  return (
    <header
      className="flex items-center justify-between h-12 shrink-0 z-20"
      style={{
        paddingInline: '28px',
        background: 'rgba(0,0,0,0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* 로고 */}
      <div className="flex items-center gap-3">
        <span
          className="text-lg font-bold tracking-tight"
          style={{
            color: '#00B4D8',
            textShadow: '0 0 12px #00B4D880',
            fontFamily: 'monospace',
          }}
        >
          아차차
        </span>
        <span className="text-[10px] tracking-widest hidden sm:block" style={{ color: 'rgba(255,255,255,0.2)' }}>
          SECURITY INTELLIGENCE
        </span>
      </div>

      {/* 갱신 시각 */}
      <div
        className="text-[11px] font-mono"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        마지막 업데이트: {formatted}
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
