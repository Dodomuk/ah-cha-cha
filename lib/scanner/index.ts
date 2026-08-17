/**
 * 스캔 오케스트레이터 — 시그널 수집 → 판정.
 *
 * 아직 구현되지 않은 시그널(S2·S3·S6·S7·S10)도 "unavailable"로 결과에 포함한다.
 * 무엇을 확인했고 무엇을 확인하지 못했는지가 판정만큼 중요한 정보이기 때문이다.
 */

import { contentSeverity, inspectContent } from "./content";
import { lookupFeed, type FeedLookup } from "./feeds";
import { GuardError, assertScannableUrl } from "./guard";
import { freeHostingPlatform } from "./hosting";
import { detectImpersonation } from "./impersonation";
import { normalizeUrl, urlHash } from "./normalize";
import { lookupDomainAge } from "./rdap";
import { describeReports, lookupReportCount } from "./reports";
import { detectApkDelivery, traceRedirects } from "./redirect";
import { checkSafeBrowsing, describeThreat } from "./safebrowsing";
import { inspectDomainShape } from "./shape";
import type { DomainAge, ScanResult, Signal } from "./types";
import { NEW_DOMAIN_DAYS, decideVerdict } from "./verdict";

/** 클로킹 대비 짧게 유지. 6시간 초과 금지 — CLAUDE.md 규칙 6 */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Sprint 2 이후에 붙는 시그널들. 지금은 확인하지 못했음을 명시한다 */
const PENDING_SIGNALS: Array<Pick<Signal, "id" | "name" | "detail">> = [
  { id: "S6", name: "tls certificate", detail: "인증서 확인은 아직 준비 중이에요." },
  { id: "S10", name: "multi-engine scan", detail: "백신 다중 검사는 아직 준비 중이에요." },
];

/**
 * 검사 하나의 전체 상한.
 *
 * 🚨 구성요소마다 자기 타임아웃이 있는데, 그게 **합산**된다는 것이 문제였다.
 *    DNS 3초 + 홉당 6초(체인 예산 10초) + 본문 6초 + RDAP 4초×2 + 구글 4초.
 *    각자는 짧은데 다 더하면 30초를 넘는다.
 *
 *    실측(2026-08-17): 이미 내려간 스미싱 URL 80건에서 소요 중앙값 30.6초,
 *    p95 45초가 나왔다. 스미싱은 대개 단축 URL로 오고 목적지는 이미 죽어 있어
 *    **가장 흔한 경로가 가장 느렸다.**
 *
 *    여기서 전체를 한 번 더 묶는다. 예산을 넘긴 조회는 "확인 못 함"으로
 *    내려간다 — 판정을 못 내는 것보다 낫다. 확인 못 한 것을 clear로
 *    바꿔치기하지 않는 한, 부분 결과는 정직한 결과다.
 */
export const SCAN_BUDGET_MS = 20_000;

/**
 * 남은 예산 안에 끝나지 않으면 준비된 대체값으로 넘어간다.
 * 실패도 같은 대체값으로 받는다 — 조회 하나가 검사 전체를 무너뜨리지 않는다.
 */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (ms <= 0) return Promise.resolve(fallback);
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function scan(rawUrl: string): Promise<ScanResult> {
  const startedAt = Date.now();
  const deadline = startedAt + SCAN_BUDGET_MS;

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

  // 체인 추적에 이미 쓴 시간을 빼고 남은 예산으로 나머지를 돌린다
  const left = deadline - Date.now();
  const noAge: DomainAge = {
    domain: finalHostname,
    registeredAt: null,
    ageDays: null,
    registrar: null,
    source: "none",
  };
  const noFeed: FeedLookup = {
    status: "unavailable",
    match: null,
    source: null,
    syncedAt: null,
  };

  const [domainAge, safeBrowsing, phishFeed, malwareFeed, content, reports] =
    await Promise.all([
      within(lookupDomainAge(finalHostname), left, noAge),
      within(checkSafeBrowsing(chainUrls), left, {
        status: "unavailable" as const,
        threatTypes: [],
      }),
      within(lookupFeed("openphish", chainUrls), left, noFeed),
      within(lookupFeed("urlhaus", chainUrls), left, noFeed),
      // 본문 검사는 요청을 하나 더 쓴다. 다른 조회들과 나란히 돌려서
      // 8초 목표(prd.md 9)에 얹히는 시간이 없도록 한다.
      // 체인 추적이 실패했으면 읽을 페이지가 없으므로 건너뛴다
      chain.error || chain.hops.length === 0
        ? Promise.resolve(null)
        : within(
            inspectContent(chain.finalUrl, chain.finalContentType),
            left,
            null,
          ),
      within(lookupReportCount(finalHostname), left, {
        status: "unavailable" as const,
        count: 0,
        reviewed: false,
      }),
    ]);

  const apk = detectApkDelivery(chain);
  const shape = inspectDomainShape(finalHostname);

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
  //
  // 완전일치는 그 페이지가 신고된 것이므로 critical.
  //
  // 🚨 호스트 일치는 medium 이다. 단독으로는 판정을 올리지 않는다.
  //    실측(2026-08-16)에서 정상 상위 도메인 200개 중 3개가 호스트 일치만으로
  //    caution 이 됐다 — 한때 악성코드에 이용됐다가 복구된 사이트들이다.
  //    "같은 호스트에 신고된 페이지가 있다"는 그 페이지가 지금도 위험하다는
  //    뜻이 아니다. 공유 호스팅·파일 저장소라면 더더욱 아니다.
  //
  //    URL 건수로 거르는 방법을 먼저 재봤는데 통하지 않았다. 신고 URL이 1건인
  //    호스트의 6.4%가 정상 상위 도메인인 반면, 10건 이상인 호스트는 17.6%가
  //    그랬다 — 대규모로 악용되는 정상 서비스(파일 저장소·메일 발송 서비스)가
  //    건수 상위에 몰려 있기 때문이다. 건수는 판별 기준이 아니다.
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
  //
  // 🚨 무료 호스팅 서브도메인에서는 이 값을 쓰지 않는다.
  //    `abc.workers.dev`의 RDAP는 클라우드플레어가 workers.dev를 등록한 날을
  //    돌려준다 — 어제 만든 피싱 페이지를 두고 "만든 지 4000일 됐어요"라고
  //    말하게 된다. 모르는 것을 모른다고 해야지, 남의 나이를 빌려주면 안 된다.
  const platform = freeHostingPlatform(finalHostname);
  const ageKnown = domainAge.source !== "none" && !platform;
  const isNew =
    ageKnown && domainAge.ageDays !== null && domainAge.ageDays < NEW_DOMAIN_DAYS;
  signals.push({
    id: "S4",
    name: "domain age",
    status: !ageKnown ? "unavailable" : isNew ? "hit" : "clear",
    severity: isNew ? "medium" : undefined,
    detail: platform
      ? `누구나 페이지를 올릴 수 있는 곳(${platform})이라, 이 페이지가 언제 만들어졌는지는 알 수 없어요.`
      : domainAge.source === "none"
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

  // S11 — 자격증명 수집 페이지. 주소가 아니라 본문을 보고 사칭을 판단한다.
  //       S7이 주소만 봐서 놓치는 무료 호스팅 피싱이 여기서 걸린다.
  //       도메인 나이를 함께 넘기는 이유는 contentSeverity 주석 참조
  signals.push({
    id: "S11",
    name: "credential harvesting page",
    status: content?.status ?? "unavailable",
    severity: content
      ? contentSeverity(content, {
          newDomain: isNew,
          disposableDomain: shape.disposable,
        })
      : undefined,
    detail:
      content?.detail ??
      "사이트에 접속하지 못해 페이지 내용은 확인하지 못했어요.",
    raw: content,
  });

  // S12 — 일회용 도메인 형태. 대량으로 사서 한 번 쓰고 버리는 도메인은 이름을
  //       기계가 짓는다(aw1y.bar). 단독으로는 판정을 올리지 않는다 —
  //       정상 도메인의 0.2%도 같은 모양이다. shape.ts 주석 참조
  signals.push({
    id: "S12",
    name: "disposable domain shape",
    status: shape.disposable ? "hit" : "clear",
    severity: shape.disposable ? "medium" : undefined,
    detail: shape.disposable
      ? "주소 이름이 사람이 지은 것이 아니라 기계가 찍어낸 모양이에요. 한 번 쓰고 버리는 주소에서 흔합니다."
      : "주소 이름은 특별히 수상한 모양이 아니에요.",
    raw: shape,
  });

  // S9 — 사용자 신고. 표시 전용이며 판정에 반영하지 않는다 (CLAUDE.md 규칙 8).
  //      severity를 주지 않는 것이 중요하다 — 값이 있으면 verdict.ts가 세지
  //      않더라도 설명 레이어에서 근거처럼 앞자리에 올라온다
  signals.push({
    id: "S9",
    name: "user reports",
    status: reports.status,
    detail: describeReports(reports),
    raw: { count: reports.count, reviewed: reports.reviewed },
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
    // 호스트 일치를 high 로 두면 그것만으로 caution 이 된다. 위 주석 참조
    severity: lookup.match === "url" ? "critical" : "medium",
    detail: lookup.match === "url" ? copy.url : copy.host,
    raw: lookup,
  };
}

export { GuardError };
