/**
 * 화면 표시용 헬퍼. **클라이언트 컴포넌트에서도 import된다** —
 * node 전용 모듈(crypto, dns 등)을 여기에 끌어들이지 말 것.
 */

import type { Verdict } from "./scanner/types";

/**
 * 검사한 주소를 화면에 노출할 때 쓰는 부분 마스킹.
 *
 * 원본을 그대로 보여주면 사용자가 주소창에 옮겨 적을 수 있다. 마지막 TLD는
 * 남겨서 어떤 종류의 주소인지는 알아볼 수 있게 한다.
 */
export function maskDomain(hostname: string): string {
  return hostname
    .split(".")
    .map((part, index, parts) => {
      if (index === parts.length - 1 || part.length <= 2) return part;
      const keep = part.length <= 4 ? 1 : 2;
      return part.slice(0, keep) + "*".repeat(part.length - keep);
    })
    .join(".");
}

/** URL 문자열에서 호스트만 뽑는다. 실패하면 원본을 그대로 돌려준다 */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export interface VerdictStyle {
  label: string;
  /** 배지·테두리에 쓰는 Tailwind 클래스 */
  badge: string;
  /** 마스코트 포즈 파일명. danger는 마스코트를 쓰지 않는다 */
  mascot: string | null;
  emoji: string;
}

/**
 * 판정별 표시 규칙.
 *
 * 🚨 danger의 mascot이 null인 것은 실수가 아니다. 위험 화면에서는 마스코트를
 *    빼는 것이 규칙이다 (CLAUDE.md 9). 여기에 포즈를 채워 넣지 말 것.
 */
export const VERDICT_STYLE: Record<Verdict, VerdictStyle> = {
  danger: {
    label: "위험",
    badge: "bg-verdict-danger text-white",
    mascot: null,
    emoji: "🚨",
  },
  caution: {
    label: "주의",
    badge: "bg-verdict-caution text-black/80",
    mascot: "worried",
    emoji: "⚠️",
  },
  unknown: {
    label: "정보 부족",
    badge: "bg-verdict-unknown text-white",
    mascot: "puzzled",
    emoji: "🤔",
  },
  no_signal: {
    label: "이상 없음",
    badge: "bg-verdict-clear text-white",
    mascot: "wink",
    emoji: "✅",
  },
};

/** 검사 시각을 사람이 읽는 형태로. 결과 하단 고지에 쓴다 */
export function formatScanTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
