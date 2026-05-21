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
      className="flex items-center justify-between px-5 h-12 flex-shrink-0 z-20"
      style={{
        background: 'rgba(3,7,30,0.95)',
        borderBottom: '1px solid #00B4D820',
      }}
    >
      {/* 로고 */}
      <div className="flex items-center gap-3">
        <span
          className="text-lg font-bold tracking-tight"
          style={{
            color: '#00B4D8',
            textShadow: '0 0 10px #00B4D8',
            fontFamily: 'monospace',
          }}
        >
          아차차
        </span>
        <span className="text-[10px] text-[#7FBBCC] tracking-widest hidden sm:block">
          SECURITY INTELLIGENCE, VISUALIZED
        </span>
      </div>

      {/* 갱신 시각 */}
      <div
        className="text-[11px] text-[#7FBBCC] font-mono"
        style={{ textShadow: '0 0 6px #00B4D840' }}
      >
        마지막 업데이트: {formatted}
      </div>

      {/* 광고 슬롯 */}
      <div
        className="hidden lg:flex items-center justify-center text-[10px] text-[#30363D]"
        style={{ width: 200, height: 36, border: '1px dashed #30363D', borderRadius: 4 }}
      >
        AD
      </div>
    </header>
  )
}
