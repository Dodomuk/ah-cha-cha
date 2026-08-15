/**
 * 사칭 탐지용 정식 도메인 화이트리스트 (S7).
 *
 * 🚨 운영 반영 전 사람이 검증할 것.
 *    도메인을 잘못 적으면 두 방향으로 다 틀린다 —
 *    - 정식 도메인을 빠뜨리면 그 은행 진짜 사이트가 "사칭"으로 잡힌다 (오탐)
 *    - 오타가 있으면 그 오타 도메인을 산 공격자가 정식으로 통과한다 (우회)
 *    `verified: false`인 항목은 아직 눈으로 확인하지 않은 것이다.
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
  { name: "KB국민은행", category: "bank", domains: ["kbstar.com", "kbfg.com"], verified: false },
  { name: "신한은행", category: "bank", domains: ["shinhan.com"], verified: false },
  { name: "우리은행", category: "bank", domains: ["wooribank.com"], verified: false },
  { name: "하나은행", category: "bank", domains: ["hanabank.com", "kebhana.com"], verified: false },
  { name: "NH농협은행", category: "bank", domains: ["nonghyup.com"], verified: false },
  { name: "IBK기업은행", category: "bank", domains: ["ibk.co.kr"], verified: false },
  { name: "카카오뱅크", category: "bank", domains: ["kakaobank.com"], verified: false },
  { name: "토스뱅크", category: "bank", domains: ["tossbank.com"], verified: false },
  { name: "케이뱅크", category: "bank", domains: ["kbanknow.com"], verified: false },
  { name: "새마을금고", category: "bank", domains: ["kfcc.co.kr"], verified: false },
  { name: "Sh수협은행", category: "bank", domains: ["suhyup-bank.com"], verified: false },
  { name: "SC제일은행", category: "bank", domains: ["standardchartered.co.kr"], verified: false },
  { name: "부산은행", category: "bank", domains: ["busanbank.co.kr"], verified: false },
  { name: "iM뱅크", category: "bank", domains: ["imbank.co.kr", "dgb.co.kr"], verified: false },
  { name: "광주은행", category: "bank", domains: ["kjbank.com"], verified: false },
  { name: "전북은행", category: "bank", domains: ["jbbank.co.kr"], verified: false },
  { name: "경남은행", category: "bank", domains: ["knbank.co.kr"], verified: false },

  // ── 카드사 ────────────────────────────────────────────────────────
  { name: "신한카드", category: "card", domains: ["shinhancard.com"], verified: false },
  { name: "삼성카드", category: "card", domains: ["samsungcard.com"], verified: false },
  { name: "현대카드", category: "card", domains: ["hyundaicard.com"], verified: false },
  { name: "KB국민카드", category: "card", domains: ["kbcard.com"], verified: false },
  { name: "롯데카드", category: "card", domains: ["lottecard.co.kr"], verified: false },
  { name: "우리카드", category: "card", domains: ["wooricard.com"], verified: false },
  { name: "하나카드", category: "card", domains: ["hanacard.co.kr"], verified: false },
  { name: "BC카드", category: "card", domains: ["bccard.com"], verified: false },

  // ── 택배 ──────────────────────────────────────────────────────────
  { name: "CJ대한통운", category: "delivery", domains: ["cjlogistics.com"], verified: false },
  { name: "롯데택배", category: "delivery", domains: ["lotteglogis.com"], verified: false },
  { name: "한진택배", category: "delivery", domains: ["hanjin.com", "hanjin.co.kr"], verified: false },
  { name: "우체국택배", category: "delivery", domains: ["epost.go.kr"], verified: false },
  { name: "로젠택배", category: "delivery", domains: ["ilogen.com"], verified: false },

  // ── 정부·공공 ─────────────────────────────────────────────────────
  { name: "정부24", category: "government", domains: ["gov.kr"], verified: false },
  { name: "국민비서", category: "government", domains: ["ips.go.kr"], verified: false },
  { name: "경찰청", category: "government", domains: ["police.go.kr"], verified: false },
  { name: "국민건강보험공단", category: "government", domains: ["nhis.or.kr"], verified: false },
  { name: "국세청 홈택스", category: "government", domains: ["hometax.go.kr", "nts.go.kr"], verified: false },
  { name: "금융감독원", category: "government", domains: ["fss.or.kr"], verified: false },
  { name: "대법원", category: "government", domains: ["scourt.go.kr"], verified: false },
  { name: "관세청", category: "government", domains: ["customs.go.kr"], verified: false },
  { name: "도로교통공단", category: "government", domains: ["koroad.or.kr"], verified: false },
  { name: "질병관리청", category: "government", domains: ["kdca.go.kr"], verified: false },
  { name: "국민연금공단", category: "government", domains: ["nps.or.kr"], verified: false },

  // ── 통신 ──────────────────────────────────────────────────────────
  { name: "SK텔레콤", category: "telecom", domains: ["sktelecom.com", "tworld.co.kr"], verified: false },
  { name: "KT", category: "telecom", domains: ["kt.com"], verified: false },
  { name: "LG유플러스", category: "telecom", domains: ["lguplus.com"], verified: false },

  // ── 커머스 ────────────────────────────────────────────────────────
  { name: "네이버", category: "commerce", domains: ["naver.com"], verified: false },
  { name: "카카오", category: "commerce", domains: ["kakao.com"], verified: false },
  { name: "쿠팡", category: "commerce", domains: ["coupang.com"], verified: false },
  { name: "11번가", category: "commerce", domains: ["11st.co.kr"], verified: false },
  { name: "G마켓", category: "commerce", domains: ["gmarket.co.kr"], verified: false },
  { name: "옥션", category: "commerce", domains: ["auction.co.kr"], verified: false },

  // ── 간편결제 ──────────────────────────────────────────────────────
  { name: "토스", category: "pay", domains: ["toss.im"], verified: false },
  { name: "카카오페이", category: "pay", domains: ["kakaopay.com"], verified: false },
  { name: "페이코", category: "pay", domains: ["payco.com"], verified: false },
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
