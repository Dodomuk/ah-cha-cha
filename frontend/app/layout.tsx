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
  title: '아차차 — 아는 순간 차이 나는 차세대 글로벌 증시',
  description: '전 세계 30개국 주요 증시 등락률을 실시간 세계 지도로 시각화. S&P500, 나스닥, 코스피, 닛케이 등 주요 지수를 한눈에 확인하세요.',
  keywords: ['주식', '증시', '세계 증시', 'S&P500', '나스닥', '코스피', '닛케이', 'DAX', '주가 지수', 'stock market', 'world markets', 'market dashboard'],
  authors: [{ name: '아차차' }],
  metadataBase: new URL('https://ahchacha.com'),
  alternates: {
    canonical: 'https://ahchacha.com',
  },
  openGraph: {
    title: '아차차 — 아는 순간 차이 나는 차세대 글로벌 증시',
    description: '전 세계 30개국 주요 증시를 실시간 세계 지도로. 오늘 어느 나라 주식이 오르고 내렸는지 바로 확인.',
    url: 'https://ahchacha.com',
    siteName: '아차차',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '아차차 — 아는 순간 차이 나는 차세대 글로벌 증시',
    description: '전 세계 30개국 주요 증시를 실시간 세계 지도로. 오늘 어느 나라 주식이 오르고 내렸는지 바로 확인.',
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
