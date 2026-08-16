/**
 * 페이지 본문 검사 (S11) — 자격증명 수집 페이지 탐지.
 *
 * S7(브랜드 사칭)은 주소만 본다. 그래서 실측에서 피싱 100건 중 0건을 잡았다:
 * 요즘 공격자는 도메인을 사지 않고 무료 호스팅의 랜덤 서브도메인에 올린다.
 * `accounts-fe50ccd9.jkhjkjk.workers.dev` 같은 주소에는 브랜드명이 아예 없다.
 *
 * 그 페이지를 실제로 열어보면 제목이 "Excel - Shared Document"다. 사칭이
 * 주소가 아니라 **본문에** 적혀 있다. 그걸 읽는 것이 이 파일이다.
 *
 * 🚨 어느 하나만으로는 판정하지 않는다. 실측(2026-08-15) 기준:
 *      비밀번호 입력란 단독 → 정상 사이트의 10%에도 있다 (로그인 페이지는 원래 그렇다)
 *      무료 호스팅 단독     → 정상 서비스가 압도적으로 많다
 *      브랜드 + 자격증명칸  → 피싱 17% / 정상 0%
 *    조합일 때만 의미가 있다.
 *
 * 🚨 본문을 읽는 것은 위험도가 한 단계 오르는 일이다. 지킬 것:
 *    - 접속은 safeFetch로만 (CLAUDE.md 규칙 3)
 *    - 상한(512KB)까지만 읽는다 — 압축 폭탄·무한 스트림 방어
 *    - HTML을 **파싱만** 한다. 실행하지 않고 하위 리소스를 따라가지 않는다
 */

import { BRANDS, officialBrand } from "./brands";
import { safeFetch } from "./guard";
import { freeHostingPlatform } from "./hosting";
import { registrableDomain } from "./normalize";

/** 본문 검사에 쓰는 예산. 체인 추적이 끝난 뒤에 붙으므로 짧게 잡는다 */
const TIMEOUT_MS = 6_000;

/** HTML이 아닌 것은 읽지 않는다. APK·이미지·PDF를 512KB씩 받을 이유가 없다 */
const HTML_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];

export type CredentialKind = "password" | "identifier";

export interface ContentFinding {
  status: "hit" | "clear" | "unavailable" | "error";
  /** 페이지가 스스로 내세운 브랜드. 그 브랜드의 정식 도메인이 아닐 때만 채운다 */
  claimedBrand: {
    name: string;
    officialDomain: string;
    verified: boolean;
    /** 무엇을 보고 판단했는지. 상세 리포트용 */
    matched: string;
  } | null;
  /** 자격증명 입력란. password가 더 강한 근거다 */
  credential: CredentialKind | null;
  /** 무료 호스팅에서 얻은 자리라면 그 플랫폼 */
  freeHost: string | null;
  /** 사용자에게 그대로 노출되는 한국어 설명 */
  detail: string;
}

const UNAVAILABLE: ContentFinding = {
  status: "unavailable",
  claimedBrand: null,
  credential: null,
  freeHost: null,
  detail: "페이지 내용은 확인하지 못했어요.",
};

/* ------------------------------------------------------------------ */
/* HTML에서 뽑아내기                                                    */
/* ------------------------------------------------------------------ */

const PASSWORD_INPUT = /<input[^>]*type\s*=\s*["']?password/i;
/**
 * 비밀번호 칸 없이 아이디만 먼저 받고 다음 화면에서 비밀번호를 받는
 * 2단계 피싱이 흔하다. 그것도 자격증명 수집이다.
 */
const IDENTIFIER_INPUT =
  /<input[^>]*(?:name|id)\s*=\s*["']?(?:user(?:name)?|email|login|userid|account|mem_id)/i;

/**
 * 페이지가 스스로를 소개하는 자리만 본다.
 *
 * 본문 아무 데나 브랜드명이 나오는 것으로는 안 된다 — 뉴스 기사도 은행 이름을
 * 쓰고, 블로그 글도 쓴다. 제목과 og 메타는 "이 페이지가 무엇인가"를 밝히는
 * 자리라서, 여기에 남의 브랜드가 있으면 사칭 의도로 볼 근거가 된다.
 */
function selfDescription(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? "";
  const og = [
    ...html.matchAll(
      /<meta[^>]+(?:property|name)\s*=\s*["']og:(?:title|site_name)["'][^>]*>/gi,
    ),
  ]
    .map((tag) => tag[0].match(/content\s*=\s*["']([^"']{0,300})/i)?.[1] ?? "")
    .join(" ");

  return `${title} ${og}`
    .replace(/&[a-z]+;|&#\d+;/gi, " ") // &middot; 같은 엔티티는 구분자로 본다
    .replace(/\s+/g, " ")
    .trim();
}

/** 표기 비교용으로 접는다. 공백·하이픈을 지우고 소문자로 */
function fold(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.]/g, "");
}

/**
 * 페이지가 어느 브랜드인 척하는지 찾는다.
 *
 * 그 브랜드의 진짜 도메인이면 사칭이 아니다. 그리고 **페이지가 올라간 도메인
 * 자체가 다른 정식 브랜드 것이면 아예 보지 않는다** — 네이버 블로그에 올라온
 * "국민은행 대출 후기" 글을 국민은행 사칭으로 잡으면 안 되기 때문이다.
 */
function claimedBrand(
  html: string,
  hostname: string,
): ContentFinding["claimedBrand"] {
  const registrable = registrableDomain(hostname);
  // 정식 브랜드 도메인 위의 페이지는 사칭 판단 대상이 아니다
  if (officialBrand(registrable)) return null;

  const description = selfDescription(html);
  if (!description) return null;
  const folded = fold(description);

  for (const brand of BRANDS) {
    for (const label of [brand.name, ...(brand.aliases ?? [])]) {
      if (!folded.includes(fold(label))) continue;
      return {
        name: brand.name,
        officialDomain: brand.domains[0],
        verified: brand.verified,
        matched: label,
      };
    }
  }
  return null;
}

function credentialKind(html: string): CredentialKind | null {
  if (PASSWORD_INPUT.test(html)) return "password";
  if (IDENTIFIER_INPUT.test(html)) return "identifier";
  return null;
}

function isHtml(contentType: string | null): boolean {
  if (!contentType) return true; // 타입을 안 알려주는 서버가 있다. 일단 읽어본다
  const type = contentType.toLowerCase().split(";")[0].trim();
  return HTML_TYPES.includes(type);
}

/* ------------------------------------------------------------------ */
/* 검사                                                                */
/* ------------------------------------------------------------------ */

export async function inspectContent(
  finalUrl: string,
  finalContentType: string | null,
): Promise<ContentFinding> {
  if (!isHtml(finalContentType)) return UNAVAILABLE;

  let hostname: string;
  try {
    hostname = new URL(finalUrl).hostname;
  } catch {
    return UNAVAILABLE;
  }

  let html: string;
  try {
    // 🚨 safeFetch 외의 경로로 대상 URL에 접속하지 않는다 (CLAUDE.md 규칙 3)
    const response = await safeFetch(finalUrl, {
      readBody: true,
      timeoutMs: TIMEOUT_MS,
    });
    html = response.body ?? "";
  } catch {
    return { ...UNAVAILABLE, status: "error" };
  }

  return inspectHtml(html, hostname);
}

/**
 * 판단 부분만 떼어낸 것. 네트워크를 타지 않으므로 테스트에서 직접 부른다.
 * 판정 규칙을 바꿀 때는 반드시 여기와 tests/content.test.ts를 함께 고칠 것.
 */
export function inspectHtml(html: string, hostname: string): ContentFinding {
  if (html.length === 0) return UNAVAILABLE;

  const brand = claimedBrand(html, hostname);
  const credential = credentialKind(html);
  const freeHost = freeHostingPlatform(hostname);

  if (brand && credential) {
    return {
      status: "hit",
      claimedBrand: brand,
      credential,
      freeHost,
      // 조사(josa)를 쓰지 않는 문장으로 짠다. 브랜드 이름이 "Instagram"처럼
      // 로마자면 받침을 알 수 없어 "Instagram와" 같은 문장이 나온다
      detail:
        credential === "password"
          ? `${brand.name} 로그인 화면처럼 꾸며놓고 비밀번호를 받는데, 이 주소는 ${brand.name} 공식 주소가 아니에요.`
          : `${brand.name} 화면처럼 꾸며놓고 아이디를 받는데, 이 주소는 ${brand.name} 공식 주소가 아니에요.`,
    };
  }

  if (freeHost && credential === "password") {
    return {
      status: "hit",
      claimedBrand: null,
      credential,
      freeHost,
      // 플랫폼 이름은 그대로 쓴다. 검사 대상 주소가 아니라 널리 알려진
      // 서비스 이름이므로 마스킹 대상이 아니다 (CLAUDE.md 규칙 10)
      detail: `누구나 몇 분이면 페이지를 올릴 수 있는 곳(${freeHost})에서 비밀번호를 받고 있어요.`,
    };
  }

  return {
    status: "clear",
    claimedBrand: brand,
    credential,
    freeHost,
    detail: credential
      ? "로그인 화면이지만, 특별히 수상한 점은 찾지 못했어요."
      : "개인정보를 받아내려는 화면은 아니었어요.",
  };
}

/* ------------------------------------------------------------------ */
/* 판정 강도                                                            */
/* ------------------------------------------------------------------ */

/**
 * S11의 severity를 정한다. 호출부(index.ts)가 도메인 나이를 알고 있으므로
 * 그 값을 받아서 여기서 한 번에 결정한다.
 *
 * 🚨 왜 브랜드 사칭 + 자격증명만으로는 danger 까지 가지 않는가:
 *    제목 문자열 하나로 danger를 띄우는 셈이라 근거가 얇다. 티스토리 글 제목이
 *    "국민은행 …"이고 그 페이지에 로그인 폼이 있으면 그대로 걸린다.
 *    그래서 **혼자 만든 자리(무료 호스팅)이거나 갓 만든 도메인일 때** —
 *    즉 정상 사업자로 보기 어려운 정황이 하나 더 있을 때만 danger로 올린다.
 *    (오탐이 미탐보다 비싸다 — CLAUDE.md 규칙 11)
 */
export function contentSeverity(
  finding: ContentFinding,
  context: { newDomain: boolean },
): "critical" | "high" | "medium" | undefined {
  if (finding.status !== "hit") return undefined;

  if (finding.claimedBrand) {
    // 확인되지 않은 브랜드는 danger 까지 올리지 않는다 (S7의 capConfidence와 같은 이유)
    const corroborated = Boolean(finding.freeHost) || context.newDomain;
    return corroborated && finding.claimedBrand.verified ? "critical" : "high";
  }

  // 무료 호스팅 + 비밀번호.
  //
  // 처음에는 medium(단독 판정 없음)으로 뒀다. 정상 개인 프로젝트도 같은 모양일까
  // 걱정했는데, 재보니 아니었다 — GitHub에서 모은 무료 호스팅 위의 정상
  // 프로젝트 112건 중 비밀번호 입력란이 있는 곳은 **0건**이었다 (2026-08-16).
  // 개인 프로젝트는 블로그·포트폴리오·문서라서 남의 비밀번호를 받지 않는다.
  //
  // 그래서 caution 까지는 올린다. danger 로 올리지 않는 이유는 표본이
  // GitHub에서 찾을 수 있는 프로젝트에 치우쳐 있어서다 — 로그인이 있는 습작
  // SaaS가 표본에 덜 잡혔을 수 있다. 주의를 주되 단정하지는 않는다
  return "high";
}

