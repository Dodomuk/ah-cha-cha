/**
 * 리디렉션 체인 추적 (S5) + APK 유도 탐지 (S8).
 *
 * 단축 URL·QR 링크는 대개 여러 홉을 거쳐 최종 목적지에 도달한다.
 * 자동 추적에 맡기면 중간 홉이 내부망을 가리켜도 알 수 없으므로,
 * 한 홉씩 직접 따라가며 매번 safeFetch의 가드를 다시 통과시킨다.
 */

import { GuardError, safeFetch } from "./guard";
import type { RedirectHop, RedirectResult } from "./types";

const MAX_HOPS = 10;
/** 체인 전체 예산. prd.md 9의 "8초 이내" 목표에서 역산 */
const TOTAL_BUDGET_MS = 12_000;
const PER_HOP_TIMEOUT_MS = 6_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** APK 배포를 나타내는 Content-Type. 스토어 밖 배포는 그 자체로 최고 위험 */
const APK_CONTENT_TYPES = [
  "application/vnd.android.package-archive",
  "application/x-authorware-bin", // APK를 이 타입으로 위장해 내려주는 사례
];

export async function traceRedirects(startUrl: string): Promise<RedirectResult> {
  const hops: RedirectHop[] = [];
  const seen = new Set<string>();
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  let current = startUrl;
  let truncated = false;
  let error: string | null = null;

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (Date.now() > deadline) {
      truncated = true;
      break;
    }
    // 리디렉션 루프. 여기서 멈춰도 지금까지의 체인은 유효한 시그널이다
    if (seen.has(current)) {
      error = "리디렉션이 제자리를 맴돌아요.";
      break;
    }
    seen.add(current);

    let response;
    try {
      response = await safeFetch(current, {
        method: "GET",
        timeoutMs: Math.min(PER_HOP_TIMEOUT_MS, deadline - Date.now()),
        // 최종 목적지에서만 본문을 읽는다. 중간 홉 본문은 쓸 데가 없다
        readBody: false,
      });
    } catch (caught) {
      error =
        caught instanceof GuardError
          ? caught.userMessage
          : "주소를 따라가다 실패했어요.";
      break;
    }

    const contentType = response.headers["content-type"] ?? null;
    const locationHeader = response.headers["location"] ?? null;

    let nextUrl: string | null = null;
    if (REDIRECT_STATUSES.has(response.status) && locationHeader) {
      try {
        // 상대 경로 Location을 현재 홉 기준으로 절대화
        nextUrl = new URL(locationHeader, response.url).toString();
      } catch {
        nextUrl = null;
        error = "이동하려는 주소의 형식이 이상해요.";
      }
    }

    hops.push({
      url: response.url,
      ip: response.ip,
      status: response.status,
      location: nextUrl,
      contentType,
      elapsedMs: response.elapsedMs,
    });

    if (!nextUrl) {
      return {
        hops,
        finalUrl: response.url,
        finalStatus: response.status,
        finalContentType: contentType,
        finalFilename: filenameFromHeaders(response.headers, response.url),
        truncated: false,
        error,
      };
    }
    current = nextUrl;

    if (hop === MAX_HOPS - 1) truncated = true;
  }

  const last = hops[hops.length - 1];
  return {
    hops,
    finalUrl: last?.url ?? startUrl,
    finalStatus: last?.status ?? null,
    finalContentType: last?.contentType ?? null,
    finalFilename: null,
    truncated,
    error,
  };
}

function filenameFromHeaders(
  headers: Record<string, string>,
  url: string,
): string | null {
  const disposition = headers["content-disposition"];
  if (disposition) {
    const encoded = disposition.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    if (encoded) {
      try {
        return decodeURIComponent(encoded[1].replace(/["']/g, "").trim());
      } catch {
        /* 디코딩 실패 시 아래 평문 filename으로 폴백 */
      }
    }
    const plain = disposition.match(/filename="?([^";]+)"?/i);
    if (plain) return plain[1].trim();
  }
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop();
    return last && last.includes(".") ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

export interface ApkFinding {
  detected: boolean;
  /** 무엇을 보고 판단했는지. 상세 리포트에 그대로 노출 */
  evidence: string | null;
}

/**
 * 최종 목적지가 APK를 직접 내려주는지 판단한다 (S8).
 * 한국 스미싱 피해의 주 경로이자 글로벌 도구들이 거의 잡지 않는 영역.
 */
export function detectApkDelivery(result: RedirectResult): ApkFinding {
  const contentType = (result.finalContentType ?? "").toLowerCase().split(";")[0].trim();
  if (APK_CONTENT_TYPES.includes(contentType)) {
    return {
      detected: true,
      evidence: `최종 목적지가 앱 설치 파일을 바로 내려줍니다 (${contentType})`,
    };
  }

  if (result.finalFilename?.toLowerCase().endsWith(".apk")) {
    return {
      detected: true,
      evidence: `최종 목적지가 앱 설치 파일을 내려줍니다 (${result.finalFilename})`,
    };
  }

  // 체인 중간에 .apk 경로가 있으면 최종 응답이 무엇이든 설치 유도로 본다
  for (const hop of result.hops) {
    try {
      if (new URL(hop.url).pathname.toLowerCase().endsWith(".apk")) {
        return {
          detected: true,
          evidence: "이동 경로에 앱 설치 파일 주소가 들어 있습니다",
        };
      }
    } catch {
      /* 홉 URL은 이미 파싱된 값이라 여기 도달할 일은 없다 */
    }
  }

  return { detected: false, evidence: null };
}
