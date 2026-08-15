/**
 * 시그널 → 4단계 판정.
 *
 * 설계 원칙: 오탐이 미탐보다 비싸다 (prd.md 9).
 * 오탐 1건이 서비스 신뢰를 무너뜨리므로, 근거가 약하면 danger로 올리지 않고
 * caution 또는 no_signal에 둔다.
 */

import type { Signal, Verdict } from "./types";

/** 신규 도메인으로 보는 기준. prd.md 3.1 S4 */
export const NEW_DOMAIN_DAYS = 30;

/** 판정에 반영하지 않는 시그널. S9(사용자 신고)는 표시 전용 — CLAUDE.md 규칙 8 */
const DISPLAY_ONLY = new Set(["S9"]);

export function decideVerdict(signals: Signal[]): Verdict {
  const scoring = signals.filter((signal) => !DISPLAY_ONLY.has(signal.id));
  const hits = scoring.filter((signal) => signal.status === "hit");

  // 1. 확정 위험 — S1~S3(알려진 악성), S8(APK 유도), S7 고신뢰 사칭
  if (hits.some((signal) => signal.severity === "critical")) {
    return "danger";
  }

  // 2. 주의 — 신규 도메인 + 다른 신호가 함께 잡힌 경우.
  //    신규 도메인 단독으로는 올리지 않는다. 정상 서비스도 새로 열리기 때문에
  //    단독 판정하면 오탐이 바로 발생한다.
  const newDomain = hits.some((signal) => signal.id === "S4");
  const otherHits = hits.filter((signal) => signal.id !== "S4");
  if (newDomain && otherHits.length > 0) {
    return "caution";
  }
  if (hits.some((signal) => signal.severity === "high")) {
    return "caution";
  }

  // 3. 정보 부족 — 접속 자체가 실패했거나, 확인된 시그널이 하나도 없는 경우.
  //    "확인 못 했다"를 "깨끗하다"로 바꿔 보여주지 않기 위한 분기다.
  const chain = scoring.find((signal) => signal.id === "S5");
  if (chain && (chain.status === "error" || chain.status === "unavailable")) {
    return "unknown";
  }
  const confirmed = scoring.filter(
    (signal) => signal.status === "hit" || signal.status === "clear",
  );
  if (confirmed.length < 2) {
    return "unknown";
  }

  // 4. 확인한 범위에서 위험 신호 없음. "안전"이 아니다
  return "no_signal";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  danger: "위험",
  caution: "주의",
  unknown: "정보 부족",
  no_signal: "이상 없음",
};

/**
 * 사용자에게 그대로 노출되는 헤드라인.
 * "안전합니다" 류의 단정 표현을 쓰지 않는다 (CLAUDE.md 규칙 7).
 */
export const VERDICT_HEADLINE: Record<Verdict, string> = {
  danger: "이 링크는 누르면 안 돼요.",
  caution: "수상한 점이 있어요. 조심해서 보세요.",
  unknown: "이 주소는 확인하지 못했어요.",
  no_signal: "지금 확인한 범위에서는 위험 신호가 없었어요.",
};
