import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: '아차차 — 아는 순간 차이 나는 차세대 보안 인텔리전스',
  description: '전 세계 보안 위협을 실시간으로 시각화하는 인터랙티브 지도 서비스',
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
