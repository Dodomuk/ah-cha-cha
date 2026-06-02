import type { Metadata, Viewport } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',           // iPhone 노치/홈 바 safe area 활성화
  themeColor: '#000000',
}

export const metadata: Metadata = {
  title: '아차차 — 아는 순간 차이 나는 차세대 보안 인텔리전스',
  description: '전 세계 사이버 보안 위협을 실시간으로 시각화하는 인터랙티브 지도 서비스. 매일 수집되는 글로벌 보안 뉴스를 AI가 요약하고 국가별 위협 수준을 지도로 표시합니다.',
  keywords: ['사이버 보안', '보안 위협', '보안 인텔리전스', '글로벌 보안', '해킹', '랜섬웨어', '취약점', 'security intelligence', 'cyber threat', 'world map'],
  authors: [{ name: '아차차' }],
  metadataBase: new URL('https://ahchacha.com'),
  alternates: {
    canonical: 'https://ahchacha.com',
  },
  openGraph: {
    title: '아차차 — 글로벌 사이버 보안 위협 지도',
    description: '전 세계 사이버 보안 위협을 실시간으로 시각화. AI가 요약한 글로벌 보안 뉴스를 한눈에.',
    url: 'https://ahchacha.com',
    siteName: '아차차',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '아차차 — 글로벌 사이버 보안 위협 지도',
    description: '전 세계 사이버 보안 위협을 실시간으로 시각화. AI가 요약한 글로벌 보안 뉴스를 한눈에.',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '아차차',
  },
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${geistMono.variable} h-full`}>
      <body className="h-full antialiased" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
