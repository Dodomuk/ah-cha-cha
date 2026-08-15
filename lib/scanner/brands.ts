/**
 * 사칭 탐지용 정식 도메인 화이트리스트 (S7).
 *
 * 🚨 운영 반영 전 사람이 검증할 것.
 *    도메인을 잘못 적으면 두 방향으로 다 틀린다 —
 *    - 정식 도메인을 빠뜨리면 그 은행 진짜 사이트가 "사칭"으로 잡힌다 (오탐)
 *    - 오타가 있으면 그 오타 도메인을 산 공격자가 정식으로 통과한다 (우회)
 *    `verified: false`인 항목은 아직 확인하지 않은 것이다.
 *
 * 2026-08-15: 한국 브랜드 59개 도메인 전부 실제 접속으로 확인함
 *             (DNS·리디렉션·페이지 제목).
 * 2026-08-15: 본문 검사(S11)용 글로벌 브랜드 16개를 같은 방식으로 확인해 추가함.
 *
 * ⚠️ 브랜드를 추가할 때는 verified: false 로 넣을 것. 이 값은 판정에 실제로
 *    영향을 준다 — 확인되지 않은 브랜드는 danger 까지 올라가지 않고 caution 에서
 *    멈춘다 (impersonation.ts 의 capConfidence). 확인 후에 true 로 바꾼다.
 *
 * 시작 범위는 피해 규모 순으로 은행·카드사·택배사·정부기관·통신 3사.
 * 커머스·간편결제는 사칭 빈도가 높아 함께 넣었다.
 */

export type BrandCategory =
  | "bank"
  | "card"
  | "delivery"
  | "government"
  | "telecom"
  | "commerce"
  | "pay"
  /** 계정 자체가 노림수인 곳 (메일·SNS·게임). 대부분 글로벌 서비스다 */
  | "platform";

export interface Brand {
  /** 사용자에게 노출되는 이름 */
  name: string;
  category: BrandCategory;
  /** 정식 도메인. 등록가능 도메인 단위로 적는다 (서브도메인 제외) */
  domains: string[];
  /** 사람이 실제로 확인했는가 */
  verified: boolean;
  /**
   * 페이지 제목에 나타나는 다른 표기 (S11). `name`은 자동으로 포함된다.
   *
   * 사칭 페이지는 회사명이 아니라 **앱·서비스 이름**을 쓴다. 실측한 피싱
   * 페이지 제목이 "Excel - Shared Document"였지 "Microsoft"가 아니었다.
   * 한국도 같다 — "KB국민은행"이 아니라 "KB스타뱅킹"으로 온다.
   *
   * 🚨 짧거나 흔한 말은 넣지 말 것. 제목에 우연히 들어갈 수 있는 표기를
   *    넣으면 그 단어가 든 정상 페이지가 전부 걸린다. "농협"(농협하나로마트도
   *    농협이다)이나 "KT" 같은 것이 그렇다. 3글자 이상이고 그 브랜드를
   *    가리킬 때만 쓰이는 표기만 넣는다.
   */
  aliases?: string[];
  /**
   * 본문 검사(S11)에서만 쓰고, 주소 유사도 비교(S7)에서는 뺀다.
   *
   * 🚨 흔한 영어 단어를 라벨로 가진 브랜드는 반드시 이걸 켤 것.
   *    S7은 편집거리 1글자 차이를 고신뢰 사칭으로 본다. `apple`을 그냥 넣으면
   *    `apply.com`이 애플 사칭으로 잡혀 danger 가 뜬다. 본문 검사는 제목에
   *    브랜드명이 **그대로** 있을 때만 반응하므로 그 위험이 없다.
   */
  contentOnly?: boolean;
}

export const BRANDS: Brand[] = [
  // ── 은행 ──────────────────────────────────────────────────────────
  { name: "KB국민은행", category: "bank", domains: ["kbstar.com", "kbfg.com"], verified: true, aliases: ["국민은행", "KB스타뱅킹", "KB Star Banking"] },
  { name: "신한은행", category: "bank", domains: ["shinhan.com"], verified: true, aliases: ["신한 SOL", "신한SOL", "신한 쏠", "신한쏠"] },
  { name: "우리은행", category: "bank", domains: ["wooribank.com"], verified: true, aliases: ["우리WON뱅킹", "우리원뱅킹", "WON뱅킹"] },
  { name: "하나은행", category: "bank", domains: ["hanabank.com", "kebhana.com"], verified: true, aliases: ["하나원큐", "KEB하나은행"] },
  { name: "NH농협은행", category: "bank", domains: ["nonghyup.com"], verified: true, aliases: ["농협은행", "NH스마트뱅킹", "NH올원뱅크"] },
  { name: "IBK기업은행", category: "bank", domains: ["ibk.co.kr"], verified: true, aliases: ["기업은행", "i-ONE Bank", "아이원뱅크"] },
  { name: "카카오뱅크", category: "bank", domains: ["kakaobank.com"], verified: true },
  { name: "토스뱅크", category: "bank", domains: ["tossbank.com"], verified: true },
  { name: "케이뱅크", category: "bank", domains: ["kbanknow.com"], verified: true },
  { name: "새마을금고", category: "bank", domains: ["kfcc.co.kr"], verified: true, aliases: ["MG새마을금고"] },
  { name: "Sh수협은행", category: "bank", domains: ["suhyup-bank.com"], verified: true },
  { name: "SC제일은행", category: "bank", domains: ["standardchartered.co.kr"], verified: true },
  { name: "부산은행", category: "bank", domains: ["busanbank.co.kr"], verified: true },
  { name: "iM뱅크", category: "bank", domains: ["imbank.co.kr", "dgb.co.kr"], verified: true },
  { name: "광주은행", category: "bank", domains: ["kjbank.com"], verified: true },
  { name: "전북은행", category: "bank", domains: ["jbbank.co.kr"], verified: true },
  { name: "경남은행", category: "bank", domains: ["knbank.co.kr"], verified: true },

  // ── 카드사 ────────────────────────────────────────────────────────
  { name: "신한카드", category: "card", domains: ["shinhancard.com"], verified: true },
  { name: "삼성카드", category: "card", domains: ["samsungcard.com"], verified: true },
  { name: "현대카드", category: "card", domains: ["hyundaicard.com"], verified: true },
  { name: "KB국민카드", category: "card", domains: ["kbcard.com"], verified: true },
  { name: "롯데카드", category: "card", domains: ["lottecard.co.kr"], verified: true },
  { name: "우리카드", category: "card", domains: ["wooricard.com"], verified: true },
  { name: "하나카드", category: "card", domains: ["hanacard.co.kr"], verified: true },
  { name: "BC카드", category: "card", domains: ["bccard.com"], verified: true },

  // ── 택배 ──────────────────────────────────────────────────────────
  { name: "CJ대한통운", category: "delivery", domains: ["cjlogistics.com"], verified: true, aliases: ["대한통운"] },
  { name: "롯데택배", category: "delivery", domains: ["lotteglogis.com"], verified: true, aliases: ["롯데글로벌로지스"] },
  { name: "한진택배", category: "delivery", domains: ["hanjin.com", "hanjin.co.kr"], verified: true },
  { name: "우체국택배", category: "delivery", domains: ["epost.go.kr"], verified: true, aliases: ["인터넷우체국"] },
  { name: "로젠택배", category: "delivery", domains: ["ilogen.com"], verified: true },

  // ── 정부·공공 ─────────────────────────────────────────────────────
  { name: "정부24", category: "government", domains: ["gov.kr"], verified: true },
  { name: "국민비서", category: "government", domains: ["ips.go.kr"], verified: true, aliases: ["국민비서 구삐"] },
  { name: "경찰청", category: "government", domains: ["police.go.kr"], verified: true },
  { name: "국민건강보험공단", category: "government", domains: ["nhis.or.kr"], verified: true, aliases: ["국민건강보험"] },
  { name: "국세청 홈택스", category: "government", domains: ["hometax.go.kr", "nts.go.kr"], verified: true, aliases: ["홈택스", "손택스", "국세청"] },
  { name: "금융감독원", category: "government", domains: ["fss.or.kr"], verified: true },
  { name: "대법원", category: "government", domains: ["scourt.go.kr"], verified: true },
  { name: "관세청", category: "government", domains: ["customs.go.kr"], verified: true },
  { name: "도로교통공단", category: "government", domains: ["koroad.or.kr"], verified: true },
  { name: "질병관리청", category: "government", domains: ["kdca.go.kr"], verified: true },
  { name: "국민연금공단", category: "government", domains: ["nps.or.kr"], verified: true },

  // ── 통신 ──────────────────────────────────────────────────────────
  { name: "SK텔레콤", category: "telecom", domains: ["sktelecom.com", "tworld.co.kr"], verified: true, aliases: ["T world", "티월드", "SKT"] },
  // "KT"는 별칭을 두지 않는다 — 두 글자라 아무 제목에나 걸린다
  { name: "KT", category: "telecom", domains: ["kt.com"], verified: true },
  { name: "LG유플러스", category: "telecom", domains: ["lguplus.com"], verified: true, aliases: ["LG U+"] },

  // ── 커머스 ────────────────────────────────────────────────────────
  // 네이버·카카오는 별칭을 두지 않는다. 이름 자체가 제목에 워낙 자주 나와서
  // ("… : 네이버 블로그") 별칭을 넓히면 정상 페이지를 긁는다
  { name: "네이버", category: "commerce", domains: ["naver.com"], verified: true, aliases: ["NAVER 로그인", "네이버 로그인"] },
  { name: "카카오", category: "commerce", domains: ["kakao.com"], verified: true, aliases: ["카카오계정", "Kakao Account"] },
  { name: "쿠팡", category: "commerce", domains: ["coupang.com"], verified: true },
  { name: "11번가", category: "commerce", domains: ["11st.co.kr"], verified: true },
  { name: "G마켓", category: "commerce", domains: ["gmarket.co.kr"], verified: true, aliases: ["지마켓"] },
  { name: "옥션", category: "commerce", domains: ["auction.co.kr"], verified: true },

  // ── 간편결제 ──────────────────────────────────────────────────────
  { name: "토스", category: "pay", domains: ["toss.im"], verified: true },
  { name: "카카오페이", category: "pay", domains: ["kakaopay.com"], verified: true },
  { name: "페이코", category: "pay", domains: ["payco.com"], verified: true },

  // ── 글로벌 (본문 검사 전용) ───────────────────────────────────────
  // 한국 사용자도 이 계정들을 노린 피싱을 그대로 받는다. 실측한 피싱 표본에서
  // 페이지 제목에 가장 많이 등장한 이름들이다.
  // contentOnly인 이유는 위 Brand.contentOnly 주석 참조 — 주소 유사도 비교에
  // 넣으면 apply.com 같은 무관한 도메인이 사칭으로 잡힌다.
  // office.com은 cloud.microsoft로 옮겨가는 중이라 둘 다 적는다.
  // microsoftonline.com은 apex가 응답하지 않지만 login.microsoftonline.com이
  // 실제 로그인 도메인이라 남겨둔다
  { name: "Microsoft", category: "platform", domains: ["microsoft.com", "microsoftonline.com", "office.com", "cloud.microsoft", "live.com", "sharepoint.com"], verified: true, contentOnly: true, aliases: ["Office 365", "Outlook", "OneDrive", "SharePoint", "마이크로소프트"] },
  { name: "Google", category: "platform", domains: ["google.com", "gmail.com"], verified: true, contentOnly: true, aliases: ["Gmail", "구글"] },
  { name: "Apple", category: "platform", domains: ["apple.com", "icloud.com"], verified: true, contentOnly: true, aliases: ["iCloud", "Apple ID", "애플"] },
  { name: "Amazon", category: "commerce", domains: ["amazon.com", "amazon.co.jp", "amazon.co.uk"], verified: true, contentOnly: true, aliases: ["아마존"] },
  { name: "Facebook", category: "platform", domains: ["facebook.com", "meta.com"], verified: true, contentOnly: true, aliases: ["Meta for Business", "페이스북"] },
  { name: "Instagram", category: "platform", domains: ["instagram.com"], verified: true, contentOnly: true, aliases: ["인스타그램"] },
  { name: "Netflix", category: "platform", domains: ["netflix.com"], verified: true, contentOnly: true, aliases: ["넷플릭스"] },
  { name: "PayPal", category: "pay", domains: ["paypal.com"], verified: true, contentOnly: true, aliases: ["페이팔"] },
  { name: "Roblox", category: "platform", domains: ["roblox.com"], verified: true, contentOnly: true, aliases: ["로블록스"] },
  { name: "Steam", category: "platform", domains: ["steampowered.com", "steamcommunity.com"], verified: true, contentOnly: true, aliases: ["스팀"] },
  { name: "Binance", category: "pay", domains: ["binance.com"], verified: true, contentOnly: true, aliases: ["바이낸스"] },
  { name: "Coinbase", category: "pay", domains: ["coinbase.com"], verified: true, contentOnly: true, aliases: ["코인베이스"] },
  { name: "Upbit", category: "pay", domains: ["upbit.com"], verified: true, contentOnly: true, aliases: ["업비트"] },
  { name: "Telegram", category: "platform", domains: ["telegram.org", "t.me"], verified: true, contentOnly: true, aliases: ["텔레그램"] },
  { name: "LinkedIn", category: "platform", domains: ["linkedin.com"], verified: true, contentOnly: true, aliases: ["링크드인"] },
  { name: "DHL", category: "delivery", domains: ["dhl.com", "dhl.de"], verified: true, contentOnly: true },
];

/** 정식 도메인 → 브랜드 역인덱스 */
const BY_DOMAIN = new Map<string, Brand>();
for (const brand of BRANDS) {
  for (const domain of brand.domains) {
    BY_DOMAIN.set(domain, brand);
  }
}

/** 이 등록가능 도메인이 정식 브랜드 도메인인가? */
export function officialBrand(registrable: string): Brand | null {
  return BY_DOMAIN.get(registrable.toLowerCase()) ?? null;
}

export function allOfficialDomains(): string[] {
  return [...BY_DOMAIN.keys()];
}
