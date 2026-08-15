/**
 * 스캔 오케스트레이터 — 시그널 수집 → 판정.
 *
 * 아직 구현되지 않은 시그널(S2·S3·S6·S7·S10)도 "unavailable"로 결과에 포함한다.
 * 무엇을 확인했고 무엇을 확인하지 못했는지가 판정만큼 중요한 정보이기 때문이다.
 */

import { lookupFeed, type FeedLookup } from "./feeds";
import { GuardError, assertScannableUrl } from "./guard";
import { detectImpersonation } from "./impersonation";
import { normalizeUrl, urlHash } from "./normalize";
import { lookupDomainAge } from "./rdap";
import { detectApkDelivery, traceRedirects } from "./redirect";
import { checkSafeBrowsing, describeThreat } from "./safebrowsing";
import type { DomainAge, ScanResult, Signal } from "./types";
import { NEW_DOMAIN_DAYS, decideVerdict } from "./verdict";

/** 클로킹 대비 짧게 유지. 6시간 초과 금지 — CLAUDE.md 규칙 6 */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Sprint 2 이후에 붙는 시그널들. 지금은 확인하지 못했음을 명시한다 */
const PENDING_SIGNALS: Array<Pick<Signal, "id" | "name" | "detail">> = [
  { id: "S6", name: "tls certificate", detail: "인증서 확인은 아직 준비 중이에요." },
  { id: "S10", name: "multi-engine scan", detail: "백신 다중 검사는 아직 준비 중이에요." },
];

export async function scan(rawUrl: string): Promise<ScanResult> {
  const startedAt = Date.now();

  const normalized = normalizeUrl(rawUrl);
  // DNS 조회 전에 스킴·형식 문제를 먼저 튕겨낸다
  const parsed = assertScannableUrl(normalized);

  const chain = await traceRedirects(normalized);

  // 최종 도착지 기준으로 도메인을 판단한다. 단축 URL의 등록일은 의미가 없다
  let finalHostname = parsed.hostname;
  try {
    finalHostname = new URL(chain.finalUrl).hostname;
  } catch {
    /* 체인 추적이 실패한 경우 입력 호스트를 그대로 쓴다 */
  }

  const chainUrls = chain.hops.map((hop) => hop.url);
  if (chainUrls.length === 0) chainUrls.push(normalized);

  const [domainAge, safeBrowsing, phishFeed, malwareFeed] = await Promise.all([
    lookupDomainAge(finalHostname).catch(
      (): DomainAge => ({
        domain: finalHostname,
        registeredAt: null,
        ageDays: null,
        registrar: null,
        source: "none",
      }),
    ),
    checkSafeBrowsing(chainUrls),
    lookupFeed("openphish", chainUrls),
    lookupFeed("urlhaus", chainUrls),
  ]);

  const apk = detectApkDelivery(chain);

  const signals: Signal[] = [];

  // S1 — 알려진 악성 URL
  signals.push({
    id: "S1",
    name: "google safe browsing",
    status: safeBrowsing.status,
    severity: safeBrowsing.status === "hit" ? "critical" : undefined,
    detail:
      safeBrowsing.status === "hit"
        ? `구글이 이미 위험한 주소로 분류했어요 (${describeThreat(safeBrowsing.threatTypes)}).`
        : safeBrowsing.status === "clear"
          ? "구글이 관리하는 위험 주소 목록에는 없었어요."
          : "위험 주소 목록을 확인하지 못했어요.",
    raw: safeBrowsing.raw,
  });

  // S2·S3 — 피싱/멀웨어 피드 대조.
  // 완전일치는 그 페이지가 신고된 것이므로 critical, 호스트 일치는 같은 호스팅에
  // 신고된 페이지가 있다는 뜻이라 high(=caution)까지만 올린다
  signals.push(
    feedSignal("S2", "phishing feed", phishFeed, {
      url: "이 주소는 피싱 사이트로 신고된 목록에 그대로 올라 있어요.",
      host: "이 사이트와 같은 곳에 피싱 페이지가 신고된 적이 있어요.",
      clear: "피싱 신고 목록에는 없었어요.",
    }),
    feedSignal("S3", "malware feed", malwareFeed, {
      url: "이 주소는 악성코드를 퍼뜨리는 곳으로 신고돼 있어요.",
      host: "이 사이트와 같은 곳에서 악성코드가 배포된 적이 있어요.",
      clear: "악성코드 배포 목록에는 없었어요.",
    }),
  );

  // S4 — 도메인 등록 나이.
  // 단독으로는 판정을 올리지 않는다(정상 서비스도 새로 열린다). severity는 medium 고정.
  const isNew =
    domainAge.ageDays !== null && domainAge.ageDays < NEW_DOMAIN_DAYS;
  signals.push({
    id: "S4",
    name: "domain age",
    status:
      domainAge.source === "none" ? "unavailable" : isNew ? "hit" : "clear",
    severity: isNew ? "medium" : undefined,
    detail:
      domainAge.source === "none"
        ? "이 주소가 언제 만들어졌는지는 확인할 수 없었어요."
        : isNew
          ? `이 사이트는 만든 지 ${domainAge.ageDays}일밖에 안 됐어요.`
          : `이 사이트는 만든 지 ${domainAge.ageDays}일 됐어요.`,
    raw: domainAge,
  });

  // S5 — 리디렉션 체인. 여러 도메인을 거치는 것 자체가 은폐 시도의 흔적일 수 있다
  const distinctHosts = new Set(
    chain.hops.map((hop) => {
      try {
        return new URL(hop.url).hostname;
      } catch {
        return hop.url;
      }
    }),
  );
  const suspiciousChain = chain.hops.length >= 4 && distinctHosts.size >= 3;
  signals.push({
    id: "S5",
    name: "redirect chain",
    status: chain.error
      ? "error"
      : chain.hops.length === 0
        ? "unavailable"
        : suspiciousChain
          ? "hit"
          : "clear",
    severity: suspiciousChain ? "medium" : undefined,
    detail: chain.error
      ? chain.error
      : chain.hops.length <= 1
        ? "주소를 따라갔더니 곧바로 도착했어요."
        : `주소를 ${chain.hops.length}번 갈아타며 ${distinctHosts.size}곳을 거쳤어요.`,
    raw: { truncated: chain.truncated, finalUrl: chain.finalUrl },
  });

  // S7 — 브랜드 사칭. 고신뢰만 danger로 올리고 나머지는 caution 이하에 둔다
  const impersonation = detectImpersonation(
    (() => {
      try {
        return new URL(chain.finalUrl);
      } catch {
        return parsed;
      }
    })(),
  );
  signals.push({
    id: "S7",
    name: "brand impersonation",
    status: impersonation ? "hit" : "clear",
    severity: impersonation
      ? impersonation.confidence === "high"
        ? "critical"
        : impersonation.confidence === "medium"
          ? "high"
          : "low"
      : undefined,
    detail:
      impersonation?.detail ?? "유명 기관을 사칭한 흔적은 찾지 못했어요.",
    raw: impersonation,
  });

  // S8 — APK 직접 다운로드 유도. 한국 스미싱의 주 경로라 단독으로 위험 판정.
  // 단, 정식 스토어(F-Droid 등)에서 받는 APK는 caution까지만 올린다.
  signals.push({
    id: "S8",
    name: "apk delivery",
    status: chain.hops.length === 0 ? "unavailable" : apk.detected ? "hit" : "clear",
    severity: apk.detected
      ? apk.trustedStore
        ? "high"
        : "critical"
      : undefined,
    detail: chain.hops.length === 0
      ? "사이트에 접속하지 못해 앱 설치 파일 여부는 확인하지 못했어요."
      : !apk.detected
      ? "앱 설치 파일을 내려주지는 않았어요."
      : apk.trustedStore
        ? `${apk.trustedStore}에서 앱 설치 파일을 내려받게 합니다. 알려진 스토어지만, 앱을 직접 설치하는 것이 맞는지 확인하세요.`
        : "스토어를 거치지 않고 앱 설치 파일을 바로 내려받게 합니다. 설치하면 문자와 연락처가 통째로 넘어갈 수 있어요.",
    raw: { evidence: apk.evidence, trustedStore: apk.trustedStore },
  });

  // S9 — 사용자 신고. 표시 전용이며 판정에 반영하지 않는다 (CLAUDE.md 규칙 8)
  signals.push({
    id: "S9",
    name: "user reports",
    status: "unavailable",
    detail: "사용자 신고 기능은 아직 준비 중이에요.",
  });

  for (const pending of PENDING_SIGNALS) {
    signals.push({ ...pending, status: "unavailable" });
  }

  signals.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));

  const scannedAt = new Date();
  return {
    urlHash: urlHash(normalized),
    normalizedUrl: normalized,
    finalUrl: chain.finalUrl,
    verdict: decideVerdict(signals),
    signals,
    redirectChain: chain.hops,
    domainAge: domainAge.source === "none" ? null : domainAge,
    scannedAt: scannedAt.toISOString(),
    expiresAt: new Date(scannedAt.getTime() + CACHE_TTL_MS).toISOString(),
    elapsedMs: Date.now() - startedAt,
  };
}

function feedSignal(
  id: "S2" | "S3",
  name: string,
  lookup: FeedLookup,
  copy: { url: string; host: string; clear: string },
): Signal {
  if (lookup.status === "unavailable") {
    return {
      id,
      name,
      status: "unavailable",
      detail: "위험 목록을 확인하지 못했어요.",
    };
  }
  if (lookup.status === "clear") {
    return { id, name, status: "clear", detail: copy.clear, raw: lookup };
  }
  return {
    id,
    name,
    status: "hit",
    severity: lookup.match === "url" ? "critical" : "high",
    detail: lookup.match === "url" ? copy.url : copy.host,
    raw: lookup,
  };
}

export { GuardError };
