/**
 * 무료·즉시 발급 호스팅 도메인 (S11 보조).
 *
 * 누구나 몇 분 만에 서브도메인을 받아 페이지를 올릴 수 있는 곳들이다.
 * 실측(2026-08-15, OpenPhish 표본): 살아 있는 피싱 페이지의 70%가 여기 있었다.
 * 예전처럼 `kbst4r.com` 같은 도메인을 살 이유가 없어졌기 때문이다.
 *
 * 🚨 여기 있다는 것만으로는 어떤 판정도 하지 않는다.
 *    정상 서비스와 개인 프로젝트가 압도적으로 많다 — 이 목록 하나로 판정을
 *    올리면 Vercel에 올린 모든 사이드 프로젝트가 위험 사이트가 된다.
 *    반드시 다른 신호(브랜드 사칭·자격증명 입력란)와 함께일 때만 쓴다.
 *
 * 🚨 여기에 도메인을 추가하는 기준은 "무료인가"가 아니라
 *    **"신원 확인 없이 몇 분 만에 남의 도메인 아래 자리를 얻는가"**이다.
 *    유료 공용 호스팅(카페24 등)은 넣지 않는다 — 실명 확인을 거치고
 *    정상 사업자가 대부분이라 오탐만 는다.
 */

import { registrableDomain } from "./normalize";

const FREE_HOSTING = new Set([
  // 정적 호스팅·서버리스 플랫폼
  "vercel.app", "netlify.app", "pages.dev", "workers.dev", "github.io",
  "gitlab.io", "web.app", "firebaseapp.com", "r2.dev", "surge.sh",
  "onrender.com", "fly.dev", "railway.app", "koyeb.app", "deno.dev",
  "edgeone.dev", "amplifyapp.com", "azurewebsites.net", "herokuapp.com",
  // 온라인 IDE — 그대로 배포까지 된다
  "replit.app", "repl.co", "glitch.me", "stackblitz.io", "wasmer.app",
  // 홈페이지 빌더·블로그
  "blogspot.com", "weebly.com", "wixsite.com", "webflow.io", "square.site",
  "tiiny.site", "carrd.co", "webnode.page", "jimdosite.com",
  // 무료 웹호스팅 (가입 즉시 서브도메인 발급)
  "000webhostapp.com", "byethost.com", "rf.gd", "42web.io", "epizy.com",
  "infinityfreeapp.com", "kesug.com", "great-site.net",
]);

/**
 * 이 호스트가 무료 호스팅에서 얻은 자리인가? 아니면 null.
 *
 * 서브도메인이 있어야 "남이 얻어 쓴 자리"다. `vercel.app` 자체는 Vercel 것이고,
 * `www.vercel.app`도 마찬가지다.
 */
export function freeHostingPlatform(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const registrable = registrableDomain(host);
  if (!FREE_HOSTING.has(registrable)) return null;
  return host !== registrable && host !== `www.${registrable}`
    ? registrable
    : null;
}
