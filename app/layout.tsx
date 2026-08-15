import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ahchacha.com"),
  // 탭 제목과 검색 결과 제목은 같은 문자열이다. 아차차를 처음 보는 사람이
  // 검색 결과에서 이게 뭐 하는 서비스인지 알 수 있어야 하므로, 슬로건이 아니라
  // 무엇을 해주는 서비스인지를 적는다. 슬로건은 화면 안에서 보여준다.
  title: {
    default: "아차차 — 악성 링크 검사 | 피싱·스미싱 URL 확인",
    template: "%s | 아차차 악성 링크 검사",
  },
  description:
    "문자나 메신저로 받은 의심스러운 링크를 눌러보기 전에 대신 확인해 드립니다. 단축 주소를 따라가 최종 목적지를 밝히고, 피싱 사이트·은행 사칭·앱 설치 유도(APK)를 검사해 위험 여부를 알려드려요. 무료, 가입 없이 바로 사용.",
  keywords: [
    "악성 링크 검사",
    "피싱 사이트 확인",
    "스미싱 확인",
    "URL 안전 검사",
    "단축 주소 확인",
    "문자 링크 검사",
    "보이스피싱",
  ],
  openGraph: {
    type: "website",
    siteName: "아차차",
    locale: "ko_KR",
    title: "아차차 — 악성 링크 검사",
    description:
      "의심스러운 링크, 누르기 전에 대신 확인해 드려요. 피싱·스미싱·앱 설치 유도까지 검사합니다.",
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
