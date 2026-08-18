/**
 * 카카오톡 채널 챗봇 연동 (스킬 서버).
 *
 * 사용자가 문자로 받은 스미싱을 카톡 채널에 그대로 전달하면, 그 안에서
 * 주소를 뽑아 검사하고 답장한다. 웹 화면에 주소를 붙여넣는 것보다 마찰이
 * 훨씬 적어서, 실제 한국 사용자가 받은 살아 있는 링크가 여기로 들어온다
 * (prd.md 0.1절 — 신고의 두 번째 쓸모).
 *
 * 🚨 사용자가 보낸 문장 전체를 저장하지 않는다.
 *    문자에는 이름·금액·택배번호 같은 개인적인 맥락이 통째로 실린다.
 *    우리가 쓰는 것은 **주소 하나뿐**이므로 그것만 뽑아 쓰고 나머지는 버린다.
 *
 * 🚨 답장에 주소 원문을 절대 넣지 않는다 (CLAUDE.md 규칙 10).
 *    카카오톡은 본문의 주소를 자동으로 눌리는 링크로 만든다. 웹 화면보다
 *    위험하다 — 경고를 읽는 화면에서 그 링크를 누를 수 있게 되는 셈이다.
 */

import type { Explanation, ScanResult } from "./scanner/types";
import { VERDICT_LABEL } from "./scanner/verdict";

/* ------------------------------------------------------------------ */
/* 요청·응답 형식                                                       */
/* ------------------------------------------------------------------ */

export interface KakaoSkillRequest {
  userRequest?: {
    utterance?: string;
    user?: { id?: string };
    /**
     * 5초 안에 못 끝낼 때 최종 답을 POST할 주소.
     * 챗봇 설정에서 콜백을 켜야 들어온다. 5분간 유효하고 한 번만 쓸 수 있다.
     */
    callbackUrl?: string;
  };
}

/** 최초 응답 — 5초 제한. 여기서 끝내지 못하면 콜백으로 넘긴다 */
export function pendingReply(text: string) {
  return { version: "2.0", useCallback: true, data: { text } };
}

/** 사용자가 누르면 그 문구를 발화로 다시 보내주는 버튼 */
export interface QuickReply {
  label: string;
  action: "message";
  messageText: string;
}

/** 최종 응답 — 콜백으로 POST하거나, 빠르게 끝났으면 그대로 반환한다 */
export function textReply(text: string, quickReplies?: QuickReply[]) {
  return {
    version: "2.0",
    template: {
      outputs: [{ simpleText: { text } }],
      ...(quickReplies?.length ? { quickReplies } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 결과가 틀렸다고 알려주는 버튼                                          */
/* ------------------------------------------------------------------ */

/**
 * 판정 아래 붙는 버튼 두 개.
 *
 * 양방향으로 받는 것이 중요하다. 미탐(우리가 놓친 것)과 오탐(멀쩡한 곳을
 * 위험이라 한 것) **둘 다** 우리가 스스로는 찾을 수 없는 정보다.
 * 특히 오탐은 미탐보다 비싸다(CLAUDE.md 규칙 11) — 그런데 오탐일수록
 * 사용자가 알려주지 않으면 영영 모른다.
 */
export const REPORT_PHISHING_TEXT = "🚨 이거 피싱이에요";
export const REPORT_SAFE_TEXT = "✅ 정상 사이트예요";

export function feedbackButtons(): QuickReply[] {
  return [
    { label: REPORT_PHISHING_TEXT, action: "message", messageText: REPORT_PHISHING_TEXT },
    { label: REPORT_SAFE_TEXT, action: "message", messageText: REPORT_SAFE_TEXT },
  ];
}

/**
 * 버튼을 눌러서 온 발화인가.
 *
 * 버튼 문구를 그대로 돌려받지만, 손으로 "신고"라고 치는 사람도 받아준다.
 * 판단은 주소 추출보다 **먼저** 해야 한다 — 이 발화에는 주소가 없어서
 * 그냥 두면 "주소를 찾지 못했어요"로 빠진다.
 */
export function feedbackIntent(
  utterance: string,
): "phishing" | "false_positive" | null {
  const text = utterance.trim();
  if (text === REPORT_PHISHING_TEXT || /^(신고|신고하기|피싱이에요|피싱)$/.test(text)) {
    return "phishing";
  }
  if (text === REPORT_SAFE_TEXT || /^(정상|정상이에요|정상 사이트예요|괜찮아요)$/.test(text)) {
    return "false_positive";
  }
  return null;
}

export const FEEDBACK_MESSAGES = {
  thanksPhishing: [
    "알려주셔서 고마워요. 신고로 남겼습니다.",
    "",
    "차차가 놓친 것을 사람이 잡아준 거예요. 이런 제보가 검사 실력을 키웁니다.",
  ].join("\n"),
  thanksSafe: [
    "알려주셔서 고마워요. 잘못 본 것으로 접수했습니다.",
    "",
    "멀쩡한 곳을 위험하다고 하는 게 못 잡는 것보다 더 큰 잘못이에요. 확인해서 고치겠습니다.",
  ].join("\n"),
  duplicate: "이미 알려주신 사이트예요. 확인하고 있습니다.",
  expired: [
    "어떤 검사에 대한 말씀인지 찾지 못했어요.",
    "",
    "검사 결과를 받은 뒤 10분 안에 눌러주셔야 해요. 주소를 다시 보내주시겠어요?",
  ].join("\n"),
  failed: "지금은 접수하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
} as const;

/* ------------------------------------------------------------------ */
/* 발화에서 주소 뽑기                                                    */
/* ------------------------------------------------------------------ */

/**
 * 스킴이 붙은 주소와, 스킴 없이 오는 주소를 함께 찾는다.
 * 한국 스미싱 문자는 `abc.kr/xY` 처럼 스킴 없이 오는 경우가 대부분이다.
 */
const URL_PATTERN =
  /(?:https?:\/\/)?(?:[a-z0-9가-힣](?:[a-z0-9가-힣-]*[a-z0-9가-힣])?\.)+[a-z]{2,}(?::\d{2,5})?(?:\/[^\s]*)?/gi;

/** 주소로 오인하기 쉬운 것들. 문자 안의 금액·날짜·파일명이 여기 걸린다 */
const NOT_A_HOST = /^\d+(\.\d+)*$/;

/**
 * 문장에서 검사할 주소 하나를 고른다.
 *
 * 여러 개면 **가장 마지막 것**을 쓴다. 스미싱 문자는 설명을 늘어놓고
 * 마지막에 누를 링크를 두는 형태가 많고, 앞쪽에는 사칭 대상의 진짜 주소를
 * 적어두는 경우도 있기 때문이다.
 */
export function extractUrl(utterance: string): string | null {
  const found = utterance.match(URL_PATTERN);
  if (!found) return null;

  for (let i = found.length - 1; i >= 0; i--) {
    const candidate = found[i].replace(/[.,)\]]+$/, "");
    const host = candidate.replace(/^https?:\/\//i, "").split(/[/:?#]/)[0];
    if (NOT_A_HOST.test(host)) continue;
    if (!host.includes(".")) continue;
    return candidate;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 답장 문구                                                            */
/* ------------------------------------------------------------------ */

const VERDICT_MARK: Record<string, string> = {
  danger: "🚨",
  caution: "⚠️",
  unknown: "🤔",
  no_signal: "✅",
};

/**
 * 검사 결과를 카톡 말풍선 하나로 만든다.
 *
 * 화면과 같은 문구를 쓰되 마크다운을 쓰지 않는다 — 카톡은 그대로 보여준다.
 */
export function resultMessage(
  result: ScanResult,
  explanation: Explanation,
): string {
  const lines = [
    `${VERDICT_MARK[result.verdict] ?? ""} ${VERDICT_LABEL[result.verdict]}`,
    "",
    explanation.headline,
    "",
    ...explanation.reasons.map((reason) => `· ${reason}`),
    "",
    explanation.action,
    "",
    // 🚨 clean 결과에는 검사 시각과 "계속 생긴다"를 반드시 병기한다
    //    (CLAUDE.md 규칙 7). 카톡은 대화가 남아서 며칠 뒤에 다시 읽힌다 —
    //    그때 이 결과가 지금도 유효한 것처럼 보이면 안 된다
    `${formatTime(result.scannedAt)} 기준입니다. 위험한 사이트는 계속 새로 생겨요.`,
  ];
  return lines.join("\n");
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

export const GUIDE_MESSAGE = [
  "받으신 문자를 그대로 붙여넣어 주세요. 주소를 찾아서 대신 열어보고 알려드릴게요.",
  "",
  "주소를 직접 누르지 마시고, 문자 전체를 복사해서 보내주시면 됩니다.",
].join("\n");

export const NO_URL_MESSAGE = [
  "보내주신 내용에서 주소를 찾지 못했어요.",
  "",
  "문자에 있는 링크가 포함되도록 전체를 복사해서 다시 보내주시겠어요?",
].join("\n");
