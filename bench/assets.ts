/**
 * 남의 사이트 리소스를 빌려 쓰는지 본다 — **측정 결과 기각된 시그널**.
 *
 * ❌ 2026-08-16 실측으로 폐기했다. 운영 엔진에 넣지 말 것.
 *
 *      남의 도메인 리소스 사용:  피싱 46%  vs  정상 84%
 *
 *    정상 사이트가 오히려 두 배 가까이 많이 쓴다. 광고·트래커·위젯·폰트를
 *    수십 곳에서 불러오기 때문이다. 반대로 피싱 키트는 파일 하나에 전부
 *    욱여넣은 자족형이 많아 외부 리소스가 적다.
 *
 *    "가져오는 곳이 브랜드 공식 도메인일 때만"으로 좁혀도 재현율이 4%
 *    (46건 중 2건)에 그쳐 시그널로 쓸 값어치가 없었다.
 *
 *    같은 아이디어가 다시 나오지 않도록 코드와 근거를 남겨둔다.
 *    다시 검토하려면 bench/content-probe.ts 로 재보고 나서 할 것.
 *
 * ── 원래 발상 ────────────────────────────────────────────────────
 *
 * 피싱 클론은 로고·CSS를 원본 사이트에서 그대로 불러오는 경우가 많다.
 * 페이지는 `xyz.vercel.app` 인데 로고가 `kbstar.com` 에서 온다면, 그 자체로
 * "누구인 척하는지"가 드러난다.
 *
 * 🚨 이 판정에는 브랜드 목록이 필요 없다. 리소스를 가져오는 도메인이 곧
 *    사칭 대상이라, 우리가 그 브랜드를 아는지와 무관하게 성립한다.
 *    브랜드 목록은 문구에서 이름을 불러줄 때만 쓴다.
 *
 * 필요한 목록은 정반대 방향이다 — **정상적으로 남의 도메인에서 리소스를 받는
 * 경우**(CDN·폰트·분석·광고)를 빼야 한다. 이쪽은 유한하고 잘 변하지 않는다.
 */

import { registrableDomain } from "../lib/scanner/normalize.ts";

/**
 * 남의 도메인이지만 빌려 쓴 것이 아닌 곳.
 *
 * 🚨 추가 기준은 "유명한가"가 아니라 **"수많은 사이트가 공용으로 쓰는
 *    기반 시설인가"**이다. 특정 서비스의 자사 도메인을 넣지 말 것 —
 *    그건 곧 그 브랜드 사칭을 통과시키는 구멍이 된다.
 */
const INFRASTRUCTURE = [
  // CDN·패키지
  "jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com", "cloudflare.com",
  "bootstrapcdn.com", "jquery.com", "fontawesome.com", "skypack.dev",
  "esm.sh", "cdn.skypack.dev", "akamaihd.net", "akamaized.net",
  "fastly.net", "cloudfront.net", "azureedge.net", "bunny.net", "b-cdn.net",
  // 폰트
  "googleapis.com", "gstatic.com", "typekit.net", "fontawesome.com",
  "webfontcdn.com", "noonnu.cc",
  // 분석·태그·광고
  "google-analytics.com", "googletagmanager.com", "doubleclick.net",
  "googlesyndication.com", "google.com", "facebook.net", "hotjar.com",
  "clarity.ms", "segment.com", "sentry.io", "amplitude.com", "mixpanel.com",
  "adsbygoogle.com", "criteo.com", "taboola.com", "outbrain.com",
  // 국내 분석·지도·결제 위젯
  "daumcdn.net", "kakaocdn.net", "pstatic.net", "naver.net", "wcs.naver.net",
  "iamport.kr", "tosspayments.com", "channel.io", "beusable.net",
  // 임베드·미디어
  "youtube.com", "ytimg.com", "vimeo.com", "gravatar.com", "w.org",
  "wp.com", "githubusercontent.com", "shields.io", "imgur.com",
];

const INFRA = new Set(INFRASTRUCTURE);

/** `src=`/`href=` 를 가진, 실제로 화면을 구성하는 태그만 본다 */
const ASSET_TAG =
  /<(?:img|script|link|source|video|audio|iframe|embed)\b[^>]*?(?:src|href)\s*=\s*["']([^"'>\s]+)/gi;

export interface BorrowedAsset {
  /** 리소스를 가져오는 등록가능 도메인 */
  domain: string;
  /** 그 도메인에서 가져오는 리소스 개수. 많을수록 통째로 베낀 것에 가깝다 */
  count: number;
}

/**
 * 페이지가 남의 도메인에서 화면 리소스를 가져오는지 본다.
 * 가장 많이 가져오는 도메인 하나를 돌려준다. 없으면 null.
 */
export function findBorrowedAssets(
  html: string,
  hostname: string,
): BorrowedAsset | null {
  let own: string;
  try {
    own = registrableDomain(hostname);
  } catch {
    return null;
  }

  const counts = new Map<string, number>();

  for (const match of html.matchAll(ASSET_TAG)) {
    const raw = match[1];
    // 상대 경로·데이터 URI는 자기 자신이다
    if (!/^https?:\/\//i.test(raw) && !raw.startsWith("//")) continue;

    let domain: string;
    try {
      domain = registrableDomain(
        new URL(raw.startsWith("//") ? `https:${raw}` : raw).hostname,
      );
    } catch {
      continue;
    }

    if (domain === own || INFRA.has(domain)) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  const [domain, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { domain, count };
}
