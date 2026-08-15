/**
 * Cloudflare Turnstile 검증 — 신고 폼에 자동 프로그램이 붙는 것을 막는다.
 *
 * 이게 없으면 신고를 스크립트로 수천 건 넣어 특정 도메인의 "신고 N건"을
 * 부풀릴 수 있다. 판정은 안 바뀌지만, 화면에 찍힌 숫자만으로도 정상 사업자에게
 * 피해가 간다.
 *
 * 완벽한 방어는 아니다(우회 서비스가 존재한다). rate limit·중복 방지·관리자
 * 검토 큐와 함께 겹으로 쓴다.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

export type TurnstileOutcome =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "missing_token" | "rejected" | "error" };

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
): Promise<TurnstileOutcome> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // 🚨 키가 없다고 통과시키지 않는다. 설정 누락으로 신고 폼이 무방비로 열리는 것이
  //    조용히 일어나면 안 된다. 호출부가 503으로 막는다
  if (!secret) return { ok: false, reason: "not_configured" };
  if (!token) return { ok: false, reason: "missing_token" };

  try {
    const body = new URLSearchParams({ secret, response: token });
    // 테스트 키는 임의 IP를 거부하므로 실제 IP를 알 때만 넣는다
    if (ip && ip !== "unknown") body.set("remoteip", ip);

    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: "error" };

    const data = (await response.json()) as {
      success: boolean;
      "error-codes"?: string[];
    };
    if (data.success) return { ok: true };

    console.warn("[turnstile] 거부됨:", data["error-codes"]);
    return { ok: false, reason: "rejected" };
  } catch {
    return { ok: false, reason: "error" };
  }
}
