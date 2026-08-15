/**
 * 스캔 오케스트레이터 — 시그널 수집 → 판정.
 *
 * 아직 구현되지 않은 시그널(S2·S3·S6·S7·S10)도 "unavailable"로 결과에 포함한다.
 * 무엇을 확인했고 무엇을 확인하지 못했는지가 판정만큼 중요한 정보이기 때문이다.
 */

import { GuardError, assertScannableUrl } from "./guard";
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
  { id: "S2", name: "phishing feed", detail: "피싱 신고 목록 대조는 아직 준비 중이에요." },
  { id: "S3", name: "malware feed", detail: "악성코드 배포 목록 대조는 아직 준비 중이에요." },
  { id: "S6", name: "tls certificate", detail: "인증서 확인은 아직 준비 중이에요." },
  { id: "S7", name: "brand impersonation", detail: "유명 사이트 사칭 여부 확인은 아직 준비 중이에요." },
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

  const [domainAge, safeBrowsing] = await Promise.all([
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

  // S8 — APK 직접 다운로드 유도. 한국 스미싱의 주 경로라 단독으로 위험 판정
  signals.push({
    id: "S8",
    name: "apk delivery",
    status: chain.hops.length === 0 ? "unavailable" : apk.detected ? "hit" : "clear",
    severity: apk.detected ? "critical" : undefined,
    detail: apk.detected
      ? "스토어를 거치지 않고 앱 설치 파일을 바로 내려받게 합니다. 설치하면 문자와 연락처가 통째로 넘어갈 수 있어요."
      : "앱 설치 파일을 내려주지는 않았어요.",
    raw: apk.evidence,
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

export { GuardError };
