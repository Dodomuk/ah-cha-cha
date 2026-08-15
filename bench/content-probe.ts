/**
 * 본문 기반 시그널 후보 측정.
 *
 * S7(브랜드 사칭)이 피싱 100건 중 0건을 잡은 이유는 **주소만 보기 때문**이다.
 * 요즘 피싱은 도메인을 사지 않고 무료 호스팅의 랜덤 서브도메인에 올린다 —
 * 주소에 브랜드명이 아예 없으니 주소를 아무리 들여다봐도 걸릴 수가 없다.
 *
 * 그래서 페이지 본문을 보는 시그널 후보 네 개를 세워놓고, 붙이기 전에
 * 악성·정상 코퍼스 양쪽에서 적중률을 잰다. 재현율만 재고 붙이면
 * 정상 사이트를 어디까지 긁는지 모른 채 배포하게 된다.
 *
 * 🚨 본문을 읽는 것은 위험도가 한 단계 오르는 일이다. 반드시 지킬 것:
 *    - 접속은 safeFetch로만 (CLAUDE.md 규칙 3). 여기서 일반 fetch를 쓰지 않는다
 *    - 본문은 상한(512KB)까지만. 압축 폭탄·무한 스트림 방어
 *    - HTML을 **파싱만** 한다. 실행하지 않고, 하위 리소스를 따라가지 않는다
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { safeFetch } from "../lib/scanner/guard.ts";
import { registrableDomain } from "../lib/scanner/normalize.ts";
import { traceRedirects } from "../lib/scanner/redirect.ts";
import { loadCorpus, OUT_DIR, type CorpusEntry } from "./corpus.ts";

/* ------------------------------------------------------------------ */
/* 후보 1 — 무료·임시 호스팅                                            */
/* ------------------------------------------------------------------ */

/**
 * 누구나 몇 분 만에 서브도메인을 받아 페이지를 올릴 수 있는 곳.
 *
 * 🚨 이 목록에 있다는 것만으로는 아무 판정도 하지 않는다. 정상 서비스가 훨씬
 *    많다 — 여기에 danger를 걸면 Vercel에 올린 모든 개인 프로젝트가 위험해진다.
 *    "무료 호스팅 + 비밀번호 입력란 + 남의 브랜드" 조합일 때만 의미가 있다.
 */
const FREE_HOSTING = new Set([
  "vercel.app", "netlify.app", "pages.dev", "workers.dev", "github.io",
  "web.app", "firebaseapp.com", "r2.dev", "replit.app", "repl.co",
  "glitch.me", "surge.sh", "onrender.com", "fly.dev", "railway.app",
  "blogspot.com", "weebly.com", "wixsite.com", "webflow.io", "square.site",
  "tiiny.site", "wasmer.app", "edgeone.dev", "netlify.com", "koyeb.app",
  "azurewebsites.net", "herokuapp.com", "cloudfront.net", "amplifyapp.com",
  "000webhostapp.com", "byethost.com", "rf.gd", "42web.io",
]);

/**
 * `--browser-ua`를 주면 실제 크롬 문자열로 요청한다.
 * 피싱 키트가 봇에게 정상 페이지를 내주는 클로킹을 얼마나 쓰는지 재기 위한 것이다.
 */
const BROWSER_UA = process.argv.includes("--browser-ua")
  ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
  : null;

function freeHosting(hostname: string): string | null {
  const registrable = registrableDomain(hostname);
  if (!FREE_HOSTING.has(registrable)) return null;
  // 서브도메인이 있어야 "남이 얻어 쓴 자리"다. vercel.app 자체는 Vercel 것이다
  return hostname !== registrable && hostname !== `www.${registrable}`
    ? registrable
    : null;
}

/* ------------------------------------------------------------------ */
/* 후보 2 — 자격증명 입력 폼                                            */
/* ------------------------------------------------------------------ */

const PASSWORD_INPUT = /<input[^>]*type\s*=\s*["']?password/i;
/** 비밀번호 칸 없이 아이디만 먼저 받는 2단계 피싱도 흔하다 */
const CREDENTIAL_NAME =
  /<input[^>]*(name|id)\s*=\s*["']?(user(name)?|email|login|userid|account)/i;

/* ------------------------------------------------------------------ */
/* 후보 3 — 페이지가 내세우는 브랜드                                     */
/* ------------------------------------------------------------------ */

/**
 * 코퍼스가 글로벌이라 측정용으로 영어권 브랜드를 쓴다.
 * 운영에 붙일 때는 lib/scanner/brands.ts(한국 브랜드)를 쓴다 —
 * 여기서 재는 것은 "본문에서 브랜드를 읽어내는 방식이 통하는가"이지
 * 이 목록 자체가 아니다.
 */
const PROBE_BRANDS: Array<{ name: string; pattern: RegExp; domains: string[] }> = [
  // 제품명으로 들어오는 경우가 실제로 더 많다 — 실측한 피싱 페이지 제목이
  // "Excel - Shared Document"였다. 회사명만 찾으면 그대로 놓친다
  { name: "Microsoft", pattern: /microsoft|office\s*365|outlook|onedrive|sharepoint|\bexcel\b|\bteams\b/i, domains: ["microsoft.com", "office.com", "live.com", "microsoftonline.com", "sharepoint.com"] },
  { name: "Apple", pattern: /\bapple\b|icloud/i, domains: ["apple.com", "icloud.com"] },
  { name: "Google", pattern: /\bgoogle\b|gmail/i, domains: ["google.com", "gmail.com"] },
  { name: "Amazon", pattern: /\bamazon\b/i, domains: ["amazon.com", "amazon.co.jp", "amazon.co.uk"] },
  { name: "Facebook", pattern: /facebook|\bmeta\b/i, domains: ["facebook.com", "meta.com"] },
  { name: "Instagram", pattern: /instagram/i, domains: ["instagram.com"] },
  { name: "Netflix", pattern: /netflix/i, domains: ["netflix.com"] },
  { name: "PayPal", pattern: /paypal/i, domains: ["paypal.com"] },
  { name: "Roblox", pattern: /roblox/i, domains: ["roblox.com"] },
  { name: "Coinbase", pattern: /coinbase/i, domains: ["coinbase.com"] },
  { name: "Steam", pattern: /steam(powered|community)/i, domains: ["steampowered.com", "steamcommunity.com"] },
  { name: "WhatsApp", pattern: /whatsapp/i, domains: ["whatsapp.com"] },
  { name: "DHL", pattern: /\bdhl\b/i, domains: ["dhl.com", "dhl.de"] },
  { name: "USPS", pattern: /\busps\b/i, domains: ["usps.com"] },
  { name: "Chase", pattern: /chase\s*bank|jpmorgan/i, domains: ["chase.com", "jpmorganchase.com"] },
  { name: "Binance", pattern: /binance/i, domains: ["binance.com"] },
  { name: "Telegram", pattern: /telegram/i, domains: ["telegram.org", "t.me"] },
  { name: "LinkedIn", pattern: /linkedin/i, domains: ["linkedin.com"] },
];

/**
 * 페이지가 "누구인 척"하는지 본다.
 *
 * 본문 아무 데나 브랜드명이 나오는 것으로는 부족하다 — 뉴스 기사도 은행 이름을
 * 쓴다. 페이지가 스스로를 소개하는 자리(제목·og:title)에 나올 때만 센다.
 */
function claimedBrand(html: string, hostname: string): string | null {
  const title = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? "";
  const ogTitle =
    html.match(/<meta[^>]+property\s*=\s*["']og:(?:title|site_name)["'][^>]+content\s*=\s*["']([^"']{0,200})/i)?.[1] ?? "";
  const claim = `${title} ${ogTitle}`;
  const registrable = registrableDomain(hostname);

  for (const brand of PROBE_BRANDS) {
    if (!brand.pattern.test(claim)) continue;
    // 진짜 그 브랜드 사이트면 사칭이 아니다
    if (brand.domains.some((domain) => registrable === domain)) continue;
    return brand.name;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 후보 4 — 폼이 남의 도메인으로 전송                                    */
/* ------------------------------------------------------------------ */

function crossDomainForm(html: string, hostname: string): string | null {
  const registrable = registrableDomain(hostname);
  for (const match of html.matchAll(
    /<form[^>]*action\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi,
  )) {
    try {
      const target = registrableDomain(new URL(match[1]).hostname);
      if (target !== registrable) return target;
    } catch {
      /* 깨진 action은 무시한다 */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 측정                                                                */
/* ------------------------------------------------------------------ */

interface Probe {
  url: string;
  /** 리디렉션을 다 따라간 뒤의 주소. 본문 판단은 전부 이 주소 기준이다 */
  finalUrl: string;
  label: string;
  reachable: boolean;
  status: number;
  /**
   * 살아 있는 페이지인가.
   *
   * 피싱 URL 목록에는 이미 내려간 것이 잔뜩 섞여 있다 (404, 호스팅 업체가
   * 이미 차단한 것 등). 그걸 분모에 넣으면 "우리가 못 잡았다"가 아니라
   * "잡을 게 없었다"인 건까지 미탐으로 세게 된다.
   */
  live: boolean;
  freeHost: string | null;
  password: boolean;
  credentialField: boolean;
  brand: string | null;
  formTarget: string | null;
  error?: string;
}

async function probeOne(entry: CorpusEntry): Promise<Probe> {
  const base: Probe = {
    url: entry.url,
    finalUrl: entry.url,
    label: entry.label,
    reachable: false,
    status: 0,
    live: false,
    freeHost: null,
    password: false,
    credentialField: false,
    brand: null,
    formTarget: null,
  };

  // 🚨 입력 URL의 본문을 읽으면 안 된다. safeFetch는 리디렉션을 따라가지 않으므로
  //    (redirect: "manual" 고정 — CLAUDE.md 규칙 3) 단축 URL이나 302를 그대로
  //    읽으면 빈 껍데기만 본다. 체인을 먼저 끝까지 따라간 뒤 도착지를 읽는다
  let chain: Awaited<ReturnType<typeof traceRedirects>>;
  try {
    chain = await traceRedirects(entry.url);
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const finalUrl = chain.finalUrl;
  let hostname: string;
  try {
    hostname = new URL(finalUrl).hostname;
  } catch {
    return { ...base, finalUrl, error: "최종 URL 파싱 실패" };
  }

  const withFinal = { ...base, finalUrl, freeHost: freeHosting(hostname) };
  if (chain.error) return { ...withFinal, error: chain.error };

  try {
    // 🚨 safeFetch를 쓴다. 여기서 일반 fetch를 쓰면 SSRF 가드가 통째로 무력화된다
    const response = await safeFetch(finalUrl, {
      readBody: true,
      timeoutMs: 10_000,
      // --browser-ua 를 주면 브라우저인 척한다. 클로킹의 영향을 재기 위한 것이지
      // 기본 동작이 아니다 — 붙일지 말지는 측정 결과를 보고 정한다
      ...(BROWSER_UA ? { userAgent: BROWSER_UA } : {}),
    });
    const html = response.body ?? "";
    return {
      ...withFinal,
      reachable: html.length > 0,
      status: response.status,
      // 200이 아니거나 1KB도 안 되는 응답은 내용이 없는 것으로 본다.
      // Cloudflare가 이미 막은 "Suspected Phishing" 안내 페이지도 여기서 빠진다
      live:
        response.status === 200 &&
        html.length >= 1024 &&
        !/suspected phishing|site not found|page not found/i.test(
          html.slice(0, 4096),
        ),
      password: PASSWORD_INPUT.test(html),
      credentialField: CREDENTIAL_NAME.test(html),
      brand: claimedBrand(html, hostname),
      formTarget: crossDomainForm(html, hostname),
    };
  } catch (error) {
    return {
      ...withFinal,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function pool<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
        process.stderr.write(`\r  ${++done}/${items.length}`);
      }
    }),
  );
  process.stderr.write("\n");
  return results;
}

function rate(n: number, total: number): string {
  return `${String(n).padStart(4)} ${(total ? Math.round((n / total) * 100) : 0)
    .toString()
    .padStart(3)}%`;
}

function report(probes: Probe[], title: string): void {
  // 살아 있는 페이지만 분모로 쓴다. 이미 내려간 URL을 넣으면 숫자가 왜곡된다
  const live = probes.filter((probe) => probe.live);
  const total = live.length;

  console.log(`\n━━━ ${title} ━━━`);
  console.log(
    `전체 ${probes.length}건 중 살아 있는 페이지 ${total}건` +
      ` (죽었거나 이미 차단된 것 ${probes.length - total}건은 분모에서 뺐습니다)\n`,
  );

  const rows: Array<[string, (probe: Probe) => boolean]> = [
    ["무료 호스팅 서브도메인", (p) => Boolean(p.freeHost)],
    ["비밀번호 입력란", (p) => p.password],
    ["아이디/이메일 입력란", (p) => p.credentialField],
    ["제목에 남의 브랜드", (p) => Boolean(p.brand)],
    ["폼이 남의 도메인으로 전송", (p) => Boolean(p.formTarget)],
    ["", () => false],
    ["조합 A: 무료호스팅 + 비밀번호", (p) => Boolean(p.freeHost) && p.password],
    ["조합 B: 브랜드 + 비밀번호", (p) => Boolean(p.brand) && p.password],
    ["조합 C: 브랜드 + 자격증명칸", (p) => Boolean(p.brand) && (p.password || p.credentialField)],
    [
      "조합 D: 위 셋 중 하나라도",
      (p) =>
        (Boolean(p.freeHost) && p.password) ||
        (Boolean(p.brand) && (p.password || p.credentialField)),
    ],
  ];

  for (const [name, test] of rows) {
    if (!name) {
      console.log("  " + "─".repeat(44));
      continue;
    }
    const hit = live.filter(test).length;
    console.log(`  ${name.padEnd(30)} ${rate(hit, total)}`);
  }
}

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const limit = Number(arg("limit", "100"));
  const concurrency = Number(arg("concurrency", "6"));
  const urlsFile = arg("urls");
  const bandRaw = arg("band");

  const corpus: CorpusEntry[] = urlsFile
    ? (await import("node:fs")).readFileSync(urlsFile, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, limit)
        .map((url) => ({ url, label: "malicious" as const, source: urlsFile }))
    : await loadCorpus(arg("set", "tranco")!, {
        limit,
        band: bandRaw
          ? (bandRaw.split("-").map(Number) as [number, number])
          : undefined,
      });

  console.log(`${corpus.length}건의 본문을 가져옵니다 (동시 ${concurrency})…`);
  const probes = await pool(corpus, concurrency, probeOne);

  report(probes, urlsFile ? `직접 지정: ${urlsFile}` : (corpus[0]?.source ?? ""));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = join(OUT_DIR, `probe-${stamp}.json`);
  writeFileSync(out, JSON.stringify(probes, null, 1));
  console.log(`\n원본: ${out}`);
}

main().catch((error) => {
  console.error("\n프로브 실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
