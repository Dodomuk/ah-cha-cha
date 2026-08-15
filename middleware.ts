import { NextResponse, type NextRequest } from "next/server";

/**
 * /admin 보호.
 *
 * 🚨 여기에 신고 내용과 위험 판정된 주소 원문이 노출된다. 인증 없이 열리면
 *    "누가 무엇을 신고했는지"가 공개된다.
 *
 * 로그인 UI 없이 브라우저 기본 인증(Basic Auth)을 쓴다. 운영자 1명이고,
 * 계정 시스템을 만드는 것보다 이쪽이 공격 표면이 작다.
 * 사용자용 로그인이 생기더라도 이 화면은 계속 분리해서 두는 편이 낫다.
 */
export function middleware(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;

  // 비밀번호 미설정이면 화면을 아예 열지 않는다.
  // 설정 누락으로 관리자 화면이 무방비로 공개되는 일이 없어야 한다
  if (!password) {
    return new NextResponse("관리자 화면이 설정되지 않았습니다.", {
      status: 503,
    });
  }

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator > 0 && decoded.slice(separator + 1) === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ahchacha admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
