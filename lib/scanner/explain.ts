/**
 * 템플릿 기반 설명 생성 — LLM 폴백.
 *
 * Sprint 2에서 Claude 설명 레이어가 붙지만, LLM은 부가 레이어이지 필수 경로가
 * 아니다. Claude 호출이 실패하거나 느려도 이 함수의 결과로 화면이 완성되어야 한다.
 * (prd.md 3.4)
 */

import type { Explanation, ScanResult, Signal, Verdict } from "./types";
import { VERDICT_HEADLINE } from "./verdict";

const ACTION: Record<Verdict, string> = {
  danger:
    "링크를 누르지 말고 지웠다가, 혹시 이미 정보를 입력했다면 금융감독원 1332로 신고하세요.",
  caution: "꼭 필요한 곳이 아니라면 개인정보나 결제정보를 넣지 마세요.",
  unknown:
    "확인이 안 된 주소예요. 보낸 사람에게 직접 물어보고 나서 여는 걸 권해요.",
  no_signal:
    "위험 신호는 없었지만, 로그인 정보를 넣기 전에는 주소창을 한 번 더 확인하세요.",
};

export function buildFallbackExplanation(result: ScanResult): Explanation {
  const reasons = pickReasons(result.signals);
  return {
    headline: VERDICT_HEADLINE[result.verdict],
    reasons: reasons.length > 0 ? reasons : ["확인할 수 있는 정보가 거의 없었어요."],
    action: ACTION[result.verdict],
    source: "template",
  };
}

/**
 * 근거로 쓸 시그널을 고른다. 최대 4개 (prd.md 3.4).
 *
 * 우선순위: hit → error → clear.
 * error가 clear보다 앞서는 이유는, 접속이 막히거나 실패한 사유("내부망 주소예요",
 * "사이트가 응답하지 않아요")가 사용자가 가장 알고 싶어 하는 정보이기 때문이다.
 * 이걸 빼면 unknown 판정에서 아무 근거도 남지 않는다.
 */
function pickReasons(signals: Signal[]): string[] {
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  const detailOf = (list: Signal[]) => list.map((signal) => signal.detail!);

  const hits = signals
    .filter((signal) => signal.status === "hit" && signal.detail)
    .sort(
      (a, b) =>
        severityOrder[a.severity ?? "low"] - severityOrder[b.severity ?? "low"],
    );

  const errors = signals.filter(
    (signal) => signal.status === "error" && signal.detail,
  );
  const clears = signals.filter(
    (signal) => signal.status === "clear" && signal.detail,
  );

  const reasons = [...detailOf(hits), ...detailOf(errors)];
  if (reasons.length >= 2) return reasons.slice(0, 4);

  return [...reasons, ...detailOf(clears)].slice(0, 4);
}
