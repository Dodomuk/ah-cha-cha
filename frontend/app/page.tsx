import Link from 'next/link'

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        gap: 32,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#00B4D8',
            textShadow: '0 0 24px #00B4D880',
            letterSpacing: '-1px',
            marginBottom: 8,
          }}
        >
          Ah-Cha-Cha
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.2)',
            letterSpacing: '0.2em',
          }}
        >
          NEW SERVICE COMING SOON
        </div>
      </div>

      <Link
        href="/legacy"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 18px',
          borderRadius: 8,
          border: '1px solid rgba(0,180,216,0.25)',
          background: 'rgba(0,180,216,0.07)',
          color: 'rgba(0,180,216,0.6)',
          fontSize: 12,
          textDecoration: 'none',
        }}
      >
        보안 인텔리전스 대시보드 →
      </Link>
    </div>
  )
}
