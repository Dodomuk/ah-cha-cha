/**
 * Google Safe Browsing 대조 (S1).
 *
 * 가중치 최상 — 여기 걸리면 다른 시그널을 볼 것 없이 위험이다.
 *
 * API 키(GOOGLE_SAFE_BROWSING_API_KEY)가 없으면 "unavailable"을 반환한다.
 * 키가 없다는 사실을 clear로 바꿔치기하지 말 것 — 확인 못 한 것과
 * 확인해서 깨끗한 것은 사용자에게 전혀 다른 정보다.
 */

const ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const TIMEOUT_MS = 4_000;

export type SafeBrowsingStatus = "hit" | "clear" | "unavailable" | "error";

export interface SafeBrowsingResult {
  status: SafeBrowsingStatus;
  /** 매치된 위협 유형. MALWARE / SOCIAL_ENGINEERING / UNWANTED_SOFTWARE 등 */
  threatTypes: string[];
  raw?: unknown;
}

const THREAT_LABELS: Record<string, string> = {
  MALWARE: "악성코드 배포",
  SOCIAL_ENGINEERING: "피싱·사회공학 공격",
  UNWANTED_SOFTWARE: "원치 않는 프로그램 설치",
  POTENTIALLY_HARMFUL_APPLICATION: "위험한 앱 배포",
};

export function describeThreat(threatTypes: string[]): string {
  const labels = threatTypes.map((type) => THREAT_LABELS[type] ?? type);
  return labels.join(", ");
}

/**
 * 체인에 등장한 모든 URL을 한 번에 조회한다.
 * 중간 홉이 이미 알려진 악성이면 최종 목적지가 멀쩡해도 위험이다.
 */
export async function checkSafeBrowsing(
  urls: string[],
): Promise<SafeBrowsingResult> {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) {
    return { status: "unavailable", threatTypes: [] };
  }

  const unique = [...new Set(urls)].slice(0, 500); // API 요청당 상한
  if (unique.length === 0) return { status: "unavailable", threatTypes: [] };

  const payload = {
    client: { clientId: "ahchacha", clientVersion: "0.1.0" },
    threatInfo: {
      threatTypes: [
        "MALWARE",
        "SOCIAL_ENGINEERING",
        "UNWANTED_SOFTWARE",
        "POTENTIALLY_HARMFUL_APPLICATION",
      ],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: unique.map((url) => ({ url })),
    },
  };

  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return { status: "error", threatTypes: [], raw: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      matches?: Array<{ threatType: string; threat: { url: string } }>;
    };

    if (!data.matches || data.matches.length === 0) {
      return { status: "clear", threatTypes: [] };
    }

    return {
      status: "hit",
      threatTypes: [...new Set(data.matches.map((match) => match.threatType))],
      raw: data.matches,
    };
  } catch (error) {
    return {
      status: "error",
      threatTypes: [],
      raw: error instanceof Error ? error.message : String(error),
    };
  }
}
