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
  title: 'Ah-Cha-Cha — Breaking News',
  description: 'Real-time global breaking news visualized on an interactive world map. Stay informed about the latest international events.',
  keywords: ['breaking news', 'global news', 'world events', 'news dashboard', 'live news', 'international news'],
  authors: [{ name: 'Ah-Cha-Cha' }],
  metadataBase: new URL('https://ahchacha.com'),
  alternates: {
    canonical: 'https://ahchacha.com',
  },
  openGraph: {
    title: 'Ah-Cha-Cha — Breaking News',
    description: 'Real-time global breaking news on an interactive world map.',
    url: 'https://ahchacha.com',
    siteName: 'Ah-Cha-Cha',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ah-Cha-Cha — Breaking News',
    description: 'Real-time global breaking news on an interactive world map.',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ah-Cha-Cha',
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
    <html lang="en" className={`${geistMono.variable} h-full`}>
      <body className="h-full antialiased" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
