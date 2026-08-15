/**
 * 사칭 탐지용 정식 도메인 화이트리스트 (S7).
 *
 * 🚨 운영 반영 전 사람이 검증할 것.
 *    도메인을 잘못 적으면 두 방향으로 다 틀린다 —
 *    - 정식 도메인을 빠뜨리면 그 은행 진짜 사이트가 "사칭"으로 잡힌다 (오탐)
 *    - 오타가 있으면 그 오타 도메인을 산 공격자가 정식으로 통과한다 (우회)
 *    `verified: false`인 항목은 아직 확인하지 않은 것이다.
 *
 * 2026-08-15: 59개 도메인 전부 실제 접속으로 확인함 (DNS·리디렉션·페이지 제목).
 * 브랜드를 추가할 때는 verified: false로 넣고, 확인한 뒤에 true로 바꿀 것.
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
  | "pay";

export interface Brand {
  /** 사용자에게 노출되는 이름 */
  name: string;
  category: BrandCategory;
  /** 정식 도메인. 등록가능 도메인 단위로 적는다 (서브도메인 제외) */
  domains: string[];
  /** 사람이 실제로 확인했는가 */
  verified: boolean;
}

export const BRANDS: Brand[] = [
  // ── 은행 ──────────────────────────────────────────────────────────
  { name: "KB국민은행", category: "bank", domains: ["kbstar.com", "kbfg.com"], verified: true },
  { name: "신한은행", category: "bank", domains: ["shinhan.com"], verified: true },
  { name: "우리은행", category: "bank", domains: ["wooribank.com"], verified: true },
  { name: "하나은행", category: "bank", domains: ["hanabank.com", "kebhana.com"], verified: true },
  { name: "NH농협은행", category: "bank", domains: ["nonghyup.com"], verified: true },
  { name: "IBK기업은행", category: "bank", domains: ["ibk.co.kr"], verified: true },
  { name: "카카오뱅크", category: "bank", domains: ["kakaobank.com"], verified: true },
  { name: "토스뱅크", category: "bank", domains: ["tossbank.com"], verified: true },
  { name: "케이뱅크", category: "bank", domains: ["kbanknow.com"], verified: true },
  { name: "새마을금고", category: "bank", domains: ["kfcc.co.kr"], verified: true },
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
  { name: "CJ대한통운", category: "delivery", domains: ["cjlogistics.com"], verified: true },
  { name: "롯데택배", category: "delivery", domains: ["lotteglogis.com"], verified: true },
  { name: "한진택배", category: "delivery", domains: ["hanjin.com", "hanjin.co.kr"], verified: true },
  { name: "우체국택배", category: "delivery", domains: ["epost.go.kr"], verified: true },
  { name: "로젠택배", category: "delivery", domains: ["ilogen.com"], verified: true },

  // ── 정부·공공 ─────────────────────────────────────────────────────
  { name: "정부24", category: "government", domains: ["gov.kr"], verified: true },
  { name: "국민비서", category: "government", domains: ["ips.go.kr"], verified: true },
  { name: "경찰청", category: "government", domains: ["police.go.kr"], verified: true },
  { name: "국민건강보험공단", category: "government", domains: ["nhis.or.kr"], verified: true },
  { name: "국세청 홈택스", category: "government", domains: ["hometax.go.kr", "nts.go.kr"], verified: true },
  { name: "금융감독원", category: "government", domains: ["fss.or.kr"], verified: true },
  { name: "대법원", category: "government", domains: ["scourt.go.kr"], verified: true },
  { name: "관세청", category: "government", domains: ["customs.go.kr"], verified: true },
  { name: "도로교통공단", category: "government", domains: ["koroad.or.kr"], verified: true },
  { name: "질병관리청", category: "government", domains: ["kdca.go.kr"], verified: true },
  { name: "국민연금공단", category: "government", domains: ["nps.or.kr"], verified: true },

  // ── 통신 ──────────────────────────────────────────────────────────
  { name: "SK텔레콤", category: "telecom", domains: ["sktelecom.com", "tworld.co.kr"], verified: true },
  { name: "KT", category: "telecom", domains: ["kt.com"], verified: true },
  { name: "LG유플러스", category: "telecom", domains: ["lguplus.com"], verified: true },

  // ── 커머스 ────────────────────────────────────────────────────────
  { name: "네이버", category: "commerce", domains: ["naver.com"], verified: true },
  { name: "카카오", category: "commerce", domains: ["kakao.com"], verified: true },
  { name: "쿠팡", category: "commerce", domains: ["coupang.com"], verified: true },
  { name: "11번가", category: "commerce", domains: ["11st.co.kr"], verified: true },
  { name: "G마켓", category: "commerce", domains: ["gmarket.co.kr"], verified: true },
  { name: "옥션", category: "commerce", domains: ["auction.co.kr"], verified: true },

  // ── 간편결제 ──────────────────────────────────────────────────────
  { name: "토스", category: "pay", domains: ["toss.im"], verified: true },
  { name: "카카오페이", category: "pay", domains: ["kakaopay.com"], verified: true },
  { name: "페이코", category: "pay", domains: ["payco.com"], verified: true },
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
