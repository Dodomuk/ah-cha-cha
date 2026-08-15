/**
 * VirusTotal 대조 (선택).
 *
 * "다른 사이트도 같은 판정을 내리는가"를 볼 때 쓰는 외부 기준점이다.
 * VT는 70여 개 엔진의 결과를 모아주므로 단일 피드보다 비교 대상으로 낫다.
 *
 * 🚨 이 기능을 켜면 **검사할 URL이 VirusTotal로 전송된다.** 코퍼스는 이미
 *    공개된 목록이라 상관없지만, 실제 사용자 URL에는 절대 쓰지 말 것.
 *    (지금 검사 URL이 외부로 나가는 곳은 Google Safe Browsing 하나뿐이다)
 *
 * 무료 키는 분당 4회·하루 500회로 묶여 있다. 200개를 돌리면 50분쯤 걸린다.
 */

const ENDPOINT = "https://www.virustotal.com/api/v3/urls";
/** 무료 티어 분당 4회. 살짝 여유를 둔다 */
const MIN_INTERVAL_MS = 16_000;

export interface VtResult {
  status: "found" | "not_found" | "unavailable";
  /** 위험으로 본 엔진 수 */
  malicious: number;
  /** 의심으로 본 엔진 수 */
  suspicious: number;
  /** 판정에 참여한 전체 엔진 수 */
  total: number;
  error?: string;
}

const UNAVAILABLE: VtResult = {
  status: "unavailable",
  malicious: 0,
  suspicious: 0,
  total: 0,
};

/** VT는 URL을 패딩 없는 base64url로 식별한다 */
function urlId(url: string): string {
  return Buffer.from(url, "utf8").toString("base64url");
}

export function vtConfigured(): boolean {
  return Boolean(process.env.VIRUSTOTAL_API_KEY);
}

let nextSlot = 0;

/** 무료 티어 한도를 넘지 않도록 호출 간격을 벌린다 */
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export async function lookupVirusTotal(url: string): Promise<VtResult> {
  const key = process.env.VIRUSTOTAL_API_KEY;
  if (!key) return UNAVAILABLE;

  await throttle();

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${urlId(url)}`, {
      headers: { "x-apikey": key },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return {
      ...UNAVAILABLE,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // VT가 그 URL을 본 적이 없는 경우. "깨끗하다"가 아니라 "모른다"다
  if (response.status === 404) {
    return { status: "not_found", malicious: 0, suspicious: 0, total: 0 };
  }
  if (response.status === 429) {
    return { ...UNAVAILABLE, error: "rate limit (무료 키 한도 초과)" };
  }
  if (!response.ok) {
    return { ...UNAVAILABLE, error: `HTTP ${response.status}` };
  }

  try {
    const body = (await response.json()) as {
      data?: { attributes?: { last_analysis_stats?: Record<string, number> } };
    };
    const stats = body.data?.attributes?.last_analysis_stats;
    if (!stats) return { ...UNAVAILABLE, error: "응답 형식이 예상과 다름" };

    const total = Object.values(stats).reduce((sum, n) => sum + n, 0);
    return {
      status: "found",
      malicious: stats.malicious ?? 0,
      suspicious: stats.suspicious ?? 0,
      total,
    };
  } catch (error) {
    return {
      ...UNAVAILABLE,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * VT 통계를 우리 판정 체계에 맞춰 옮긴다.
 *
 * 엔진 1개만 걸린 건 오탐이 흔하다. 업계 관행대로 2개 이상을 위험으로 본다.
 */
export function vtVerdict(result: VtResult): "danger" | "caution" | "unknown" {
  if (result.status !== "found") return "unknown";
  if (result.malicious >= 2) return "danger";
  if (result.malicious + result.suspicious >= 1) return "caution";
  return "unknown";
}
