/**
 * 서비스 상수. 법적 문서와 푸터가 같은 값을 봐야 하므로 한 곳에 둔다.
 *
 * 연락처는 이용약관·개인정보처리방침·이의제기 안내에 모두 들어가고 푸터에
 * 상시 노출된다. 도메인 메일로 바꿀 때 여기 한 줄만 고치면 전부 따라온다.
 */
export const SITE = {
  name: "아차차",
  domain: "ahchacha.com",
  url: "https://ahchacha.com",
  /**
   * 이의제기·문의·삭제 요청을 받는 곳.
   *
   * ⚠️ Cloudflare Email Routing으로 개인 메일함에 전달되도록 설정해야 동작한다.
   *    설정 전에 배포하면 이의제기 메일이 반송된다 — 잘못 표시된 사이트 운영자가
   *    항의할 곳이 없어지는 것이므로, 배포 전 반드시 수신 테스트할 것.
   */
  contactEmail: "report@ahchacha.com",
  /** 문서를 고칠 때마다 갱신할 것. 이용자에게 변경 시점을 알리는 근거가 된다 */
  policyUpdatedAt: "2026-08-15",
} as const;

/** 위험 판정 화면과 법적 문서에서 함께 쓰는 신고 창구 */
export const HOTLINES = [
  { name: "금융감독원 보이스피싱 상담", number: "1332" },
  { name: "경찰청 사이버범죄 신고", number: "112" },
  { name: "한국인터넷진흥원 불법스팸 신고", number: "118" },
] as const;
