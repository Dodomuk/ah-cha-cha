/**
 * 브랜드 사칭 탐지 (S7) — 글로벌 도구들이 가장 약한 영역.
 *
 * 정밀도 우선(prd.md 9). 오탐 1건이 신뢰를 무너뜨리므로 확신이 약하면
 * confidence를 낮춰 내보내고, 판정 격상은 호출부가 결정한다.
 *
 * 오탐을 막는 장치 두 가지:
 *  1. 짧은 라벨은 편집거리 비교에서 제외한다. `kt`, `ibk` 같은 3글자 이하 라벨은
 *     무관한 도메인과도 거리가 1~2로 나와 그대로 쓰면 오탐 공장이 된다.
 *  2. 정식 도메인 자체는 즉시 통과시킨다. `www.kbstar.com`이 사칭으로 잡히면 안 된다.
 */

import { domainToUnicode } from "node:url";

import { maskDomain } from "../display";
import { josa } from "../korean";
import { BRANDS, officialBrand, type Brand, type BrandCategory } from "./brands";
import { registrableDomain } from "./normalize";

/** 이 길이 이하 라벨은 편집거리 비교에서 뺀다 */
const MIN_LABEL_FOR_DISTANCE = 5;

export type ImpersonationKind =
  | "homoglyph" // 눈으로 구별 안 되는 문자 치환
  | "lookalike" // 한두 글자 차이
  | "subdomain" // 정식 브랜드가 서브도메인에만 존재
  | "other_tld" // 이름은 똑같고 뒤에 붙은 주소만 다름
  | "path_only"; // 브랜드명이 경로·쿼리에만 존재

export interface ImpersonationFinding {
  brand: string;
  category: BrandCategory;
  officialDomain: string;
  kind: ImpersonationKind;
  confidence: "high" | "medium" | "low";
  /** 이 브랜드의 정식 도메인을 사람이 확인했는가 */
  verified: boolean;
  /** 확인되지 않은 브랜드라서 신뢰도를 낮췄는가 */
  cappedByVerification?: boolean;
  /** 사용자에게 그대로 노출되는 한국어 설명 */
  detail: string;
}

/* ------------------------------------------------------------------ */
/* 문자 정규화                                                          */
/* ------------------------------------------------------------------ */

/** 눈으로 구별하기 어려운 문자를 대표 문자로 모은다 */
const HOMOGLYPHS: Record<string, string> = {
  // 키릴 문자 — 라틴 알파벳과 렌더링이 사실상 동일하다
  а: "a", в: "b", е: "e", к: "k", м: "m", н: "h", о: "o",
  р: "p", с: "c", т: "t", у: "y", х: "x", і: "i", ѕ: "s", ԁ: "d", ј: "j",
  // 그리스 문자
  ο: "o", ρ: "p", α: "a", ν: "v", τ: "t", κ: "k",
  // 숫자 치환
  "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "6": "b", "7": "t", "9": "g",
};

/**
 * 시각적으로 같아 보이는 형태로 접는다.
 * `kbst0r` → `kbstor`, `rn` → `m` 처럼 조합 치환까지 처리한다.
 */
export function foldHomoglyphs(label: string): string {
  let folded = label.toLowerCase().replace(/-/g, "");
  folded = [...folded].map((char) => HOMOGLYPHS[char] ?? char).join("");
  // 두 글자를 붙여 한 글자처럼 보이게 하는 고전 수법
  folded = folded.replace(/rn/g, "m").replace(/vv/g, "w").replace(/cl/g, "d");
  return folded;
}

/** 편집거리. 상한을 넘어서면 조기 종료한다 */
export function levenshtein(a: string, b: string, limit = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/* ------------------------------------------------------------------ */
/* 탐지                                                                */
/* ------------------------------------------------------------------ */

/** 등록가능 도메인에서 브랜드 라벨만 떼어낸다. `ibk.co.kr` → `ibk` */
function domainLabel(registrable: string): string {
  return registrable.split(".")[0];
}

/** punycode를 사람이 보는 형태로 되돌린다. 실패하면 원본을 그대로 쓴다 */
function safeDomainToUnicode(hostname: string): string {
  if (!hostname.includes("xn--")) return hostname;
  try {
    return domainToUnicode(hostname) || hostname;
  } catch {
    return hostname;
  }
}

interface Candidate {
  brand: Brand;
  officialDomain: string;
  label: string;
}

// contentOnly 브랜드는 여기서 뺀다. 흔한 영어 단어가 라벨이라 편집거리 비교에
// 넣으면 무관한 도메인이 사칭으로 잡힌다 (apple ↔ apply). brands.ts 주석 참조
const CANDIDATES: Candidate[] = BRANDS.filter(
  (brand) => !brand.contentOnly,
).flatMap((brand) =>
  brand.domains.map((domain) => ({
    brand,
    officialDomain: domain,
    label: domainLabel(domain),
  })),
);

const RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * 확인되지 않은 브랜드의 고신뢰 판정을 한 단계 낮춘다.
 * 테스트에서 직접 호출할 수 있도록 내보낸다.
 */
export function capConfidence<
  T extends { confidence: "high" | "medium" | "low"; verified: boolean },
>(finding: T): T & { cappedByVerification?: boolean } {
  return finding.confidence === "high" && !finding.verified
    ? { ...finding, confidence: "medium" as const, cappedByVerification: true }
    : finding;
}

/**
 * 사칭 정황을 찾는다. 가장 신뢰도 높은 것 하나만 반환한다.
 * 정식 도메인이면 null.
 */
export function detectImpersonation(url: URL): ImpersonationFinding | null {
  const hostname = url.hostname.toLowerCase();
  const registrable = registrableDomain(hostname);

  // 진짜 브랜드 사이트는 여기서 끝. 이 분기가 없으면 www.kbstar.com이 잡힌다
  if (officialBrand(registrable)) return null;

  // URL 파서는 유니코드 호스트를 punycode(xn--)로 바꿔놓는다. 그대로 비교하면
  // 키릴 문자 사칭이 전부 빠져나가므로 사람이 보는 형태로 되돌린 뒤 비교한다.
  const unicodeLabel = domainLabel(
    registrableDomain(safeDomainToUnicode(hostname)),
  );
  const label = unicodeLabel;
  const foldedLabel = foldHomoglyphs(label);
  // 등록가능 도메인 앞에 붙은 서브도메인 라벨들
  const subLabels = hostname
    .slice(0, Math.max(0, hostname.length - registrable.length))
    .split(".")
    .filter(Boolean);
  const haystack = `${url.pathname}${url.search}`.toLowerCase();

  const findings: ImpersonationFinding[] = [];

  for (const { brand, officialDomain, label: official } of CANDIDATES) {
    // 1. 서브도메인 사칭 — kbstar.evil.com
    //    정식 브랜드 라벨이 서브도메인에만 있고 등록 도메인은 남의 것
    if (subLabels.includes(official)) {
      findings.push({
        brand: brand.name,
        category: brand.category,
        officialDomain,
        kind: "subdomain",
        confidence: "high",
        verified: brand.verified,
        // 원본 도메인을 그대로 쓰지 않는다. 사용자가 옮겨 적을 수 있다 (CLAUDE.md 10)
        detail: `주소 앞부분에 ${josa(brand.name, "이/가")} 붙어 있지만, 실제 사이트 주인은 ${maskDomain(registrable)} 입니다.`,
      });
      continue;
    }

    if (official.length >= MIN_LABEL_FOR_DISTANCE) {
      // 2. 이름은 완전히 같고 TLD만 다른 경우 (kakao.net, naver.io).
      //    이걸 사칭으로 단정하면 안 된다 — 대형 플랫폼은 자기 이름의 다른 TLD를
      //    직접 갖고 있는 경우가 많다. 실측: naver.co.kr·naver.net·coupang.co.kr·
      //    gmarket.com·kakao.co.kr 전부 본인 소유였다.
      //    대부분은 본진으로 리디렉션되므로 최종 도착지 검사에서 이미 걸러지고,
      //    여기까지 오는 건 리디렉션하지 않는 소수다. 그마저도 스쿼터일 수도,
      //    브랜드의 별도 서비스일 수도 있어 판단이 안 선다.
      //    → 단독으로는 판정을 올리지 않는 low로 둔다.
      if (label === official) {
        findings.push({
          brand: brand.name,
          category: brand.category,
          officialDomain,
          kind: "other_tld",
          confidence: "low",
          verified: brand.verified,
          detail: `${brand.name}와 이름은 같지만 주소 뒷부분이 달라요 (진짜는 ${officialDomain}). ${brand.name}가 직접 쓰는 주소일 수도 있어요.`,
        });
        continue;
      }

      // 3. Homoglyph — 접었을 때 같아지면 육안으로 구별이 안 된다는 뜻.
      //    글자가 완전히 같은 경우는 위에서 걸렀다. 여기 오는 건 진짜로
      //    다르게 쓴 것이다 (kbst4r, 키릴 문자 등)
      if (foldedLabel === foldHomoglyphs(official)) {
        findings.push({
          brand: brand.name,
          category: brand.category,
          officialDomain,
          kind: "homoglyph",
          confidence: "high",
          verified: brand.verified,
          detail: `${brand.name}의 진짜 주소(${officialDomain})와 눈으로는 구별되지 않게 글자를 바꿔놓았습니다.`,
        });
        continue;
      }

      // 4. 유사 도메인 — 한 글자 차이는 오타 유도, 두 글자는 정황 수준
      const distance = levenshtein(label, official);
      if (distance <= 2) {
        findings.push({
          brand: brand.name,
          category: brand.category,
          officialDomain,
          kind: "lookalike",
          confidence: distance <= 1 ? "high" : "medium",
          verified: brand.verified,
          detail: `${brand.name}의 진짜 주소(${officialDomain})와 ${distance}글자만 다릅니다.`,
        });
        continue;
      }

      // 5. 경로·쿼리에만 브랜드명 — 단독으로는 근거가 약하다
      if (haystack.includes(official)) {
        findings.push({
          brand: brand.name,
          category: brand.category,
          officialDomain,
          kind: "path_only",
          confidence: "low",
          verified: brand.verified,
          detail: `주소 뒷부분에 ${josa(brand.name, "이/가")} 적혀 있지만, 사이트 주소 자체는 ${josa(brand.name, "와/과")} 무관합니다.`,
        });
      }
    }
  }

  if (findings.length === 0) return null;

  // 🚨 확인되지 않은 브랜드는 danger 까지 올리지 않는다.
  //
  //    화이트리스트가 틀리는 방향은 둘인데 피해 크기가 다르다.
  //    정식 도메인을 오타로 적어두면(예: wooribank → wooribamk) 그 오타 도메인이
  //    "정식"이 되고, **진짜 우리은행 사이트가 사칭으로 잡혀 danger 가 뜬다.**
  //    오탐 중에서도 최악이다.
  //
  //    사람이 확인한 브랜드는 그 위험이 없으니 그대로 두고, 확인 전인 브랜드는
  //    high → medium 으로 낮춰 caution 까지만 가게 한다. 사용자에게 주의는
  //    주되 "이건 가짜입니다"라고 단정하지는 않는다.
  const capped = findings.map(capConfidence);

  capped.sort((a, b) => RANK[a.confidence] - RANK[b.confidence]);
  return capped[0];
}
