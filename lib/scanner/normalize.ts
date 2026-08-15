/**
 * URL 정규화와 표시용 마스킹.
 *
 * 정규화 결과의 SHA-256이 url_hash — 캐시 키 겸 DB 인덱스가 된다(prd.md 7).
 * 쿼리스트링은 제거하지 않는다. 피싱 페이지는 쿼리 값에 따라 다른 화면을
 * 띄우는 경우가 많아, 같은 경로라도 다른 검사 대상으로 봐야 한다.
 */

import { createHash } from "node:crypto";

/**
 * 사용자가 붙여넣은 문자열을 검사 가능한 URL 문자열로 다듬는다.
 * 스킴이 없으면 https를 붙인다 — 문자로 받은 링크는 대개 스킴이 잘려 있다.
 */
export function normalizeUrl(input: string): string {
  // 카카오톡·문자에서 복사하면 제로폭 문자가 섞여 들어오는 일이 잦다
  const trimmed = input.trim().replace(/[\s\u200b-\u200d\ufeff]/g, "");
  if (!trimmed) throw new Error("empty url");

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = new URL(withScheme);

  url.protocol = url.protocol.toLowerCase();
  // URL 파서가 유니코드 호스트를 punycode로 바꿔준다 — homoglyph 탐지(S7)의 입력
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  // 기본 포트는 제거해서 같은 대상이 다른 해시를 갖지 않게 한다
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  // 프래그먼트는 서버로 전송되지 않으므로 검사 대상이 아니다
  url.hash = "";
  if (url.pathname === "") url.pathname = "/";

  return url.toString();
}

export function urlHash(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex");
}

/** 등록 가능 도메인 근사치. 공개 접미사 목록 없이 자주 쓰는 2단계 TLD만 처리 */
const TWO_LEVEL_TLDS = new Set([
  "co.kr", "or.kr", "ne.kr", "go.kr", "re.kr", "pe.kr", "ac.kr",
  "co.uk", "org.uk", "ac.uk", "co.jp", "or.jp", "ne.jp", "com.cn",
  "com.au", "co.nz", "com.br", "com.tw",
]);

export function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_LEVEL_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

