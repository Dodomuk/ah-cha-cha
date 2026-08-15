import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ahchacha.com"),
  title: {
    default: "아차차 — 누르기 전에, 차차한테 먼저 물어보세요",
    template: "%s | 아차차",
  },
  description:
    "의심스러운 링크를 대신 확인해 드려요. 문자로 온 링크, 단축 주소, 앱 설치 유도까지 눌러보기 전에 검사하세요.",
  openGraph: {
    type: "website",
    siteName: "아차차",
    locale: "ko_KR",
  },
  // 검사 결과 페이지는 검색에 노출될 이유가 없다. Sprint 3에서 /s/ 라우트에 개별 적용
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
