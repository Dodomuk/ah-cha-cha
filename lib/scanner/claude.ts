/**
 * Claude 설명 레이어 (prd.md 3.4) — raw 시그널을 일반 사용자용 한국어로 옮긴다.
 *
 * 🚨 이 레이어는 부가 기능이다. 실패하든 느리든 판정은 그대로 나와야 하므로,
 *    호출부는 반드시 explain.ts의 템플릿 폴백을 준비해 둘 것.
 *    이 파일의 모든 실패 경로는 예외를 던지지 않고 null을 반환한다.
 *
 * 구조화 출력(output_config.format)을 쓰기 때문에 응답이 스키마를 벗어나지 않는다.
 * JSON 파싱 실패나 필드 누락을 따로 방어할 필요가 없다.
 */

import Anthropic from "@anthropic-ai/sdk";

import { hostnameOf, maskDomain } from "../display";
import type { Explanation, ScanResult, Signal } from "./types";
import { VERDICT_LABEL } from "./verdict";

/** 사용자가 선택한 모델. 시그널을 문장으로 옮기는 작업이라 추론 부담이 적다 */
const MODEL = "claude-haiku-4-5";

/**
 * 전체 검사 예산이 8초(prd.md 9)인데 스캔 자체가 1~2초를 쓴다.
 * 설명 때문에 목표를 넘기지 않도록 여기서 끊고 템플릿으로 떨어진다.
 *
 * 4초로 잡았더니 커넥션이 식은 첫 요청이 매번 타임아웃됐다(실측 4.9초).
 * 따뜻할 때는 1.5~2초면 끝나므로, 콜드 스타트를 흡수하면서
 * 최악의 경우(스캔 2초 + 5초)에도 8초 목표 안에 들어오는 값이다.
 */
const TIMEOUT_MS = 5_000;

/** 헤드라인 1줄 + 근거 2~4개 + 액션 1줄이면 충분하다 */
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `너는 '아차차'라는 링크 검사 서비스의 설명 담당이다.
검사 엔진이 뽑아낸 신호를 일반 사용자가 이해할 한국어로 옮기는 것이 유일한 일이다.

규칙:
- 입력에 없는 사실을 지어내지 마라. 신호에 없는 내용은 추측하지 말고 쓰지도 마라.
- 전문용어를 쓰지 마라. RDAP, TLS, DNS, 리디렉션, 인증서, Content-Type 같은 말은 금지다.
  "주소를 몇 번 갈아탄다", "이 사이트가 만들어진 날짜" 처럼 풀어서 써라.
- 판정이 danger이면 톤을 부드럽게 만들지 마라. 완곡어법, 이모지, 위로하는 말을 넣지 마라.
  무엇이 위험한지 직설적으로 쓴다.
- 판정이 no_signal이어도 "안전합니다"라고 단정하지 마라.
  "지금 확인한 범위에서는 위험 신호가 없었어요" 수준으로만 쓴다.
- action은 사용자를 안심시키는 자리가 아니다. 방문을 권하거나 보증하지 마라.
  "평소처럼 이용해도 괜찮아요", "방문해도 됩니다", "안심하세요" 같은 문장은 금지다.
  위험 신호가 없을 때도 사용자가 스스로 확인할 것을 하나 알려줘라
  (예: 로그인 전에 주소창을 다시 확인하기).
  검사는 지금 이 순간 기준이고 사이트는 언제든 바뀔 수 있기 때문이다.
- 주소(도메인, URL)를 문장에 그대로 옮겨 쓰지 마라. 사용자가 그걸 보고 주소창에
  옮겨 적을 수 있다. 입력에 마스킹된 형태(kb****.so****.com)로 주어졌다면 그대로 쓰고,
  아니면 "이 사이트", "실제 주인" 처럼 가리키는 말로 대신해라.
  사용자는 자기가 어떤 주소를 검사했는지 이미 안다.
- reasons는 확인된 신호에 근거한 것만 쓴다. 확인하지 못한 항목(unavailable)을
  근거처럼 쓰지 마라.
- 각 문장은 한 문장으로 끝낸다. 존댓말을 쓴다.`;

/**
 * 구조화 출력 스키마.
 * 모든 객체에 additionalProperties: false가 필요하고, 문자열 길이 제약은
 * 지원되지 않아 개수/길이는 프롬프트로만 유도한다.
 */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "판정을 한 문장으로 요약. 사용자가 가장 먼저 읽는 줄.",
    },
    reasons: {
      type: "array",
      description: "판단 근거 2~4개. 각 항목은 한 문장.",
      items: { type: "string" },
    },
    action: {
      type: "string",
      description: "사용자가 지금 해야 할 일 한 문장.",
    },
  },
  required: ["headline", "reasons", "action"],
  additionalProperties: false,
} as const;

let client: Anthropic | null | undefined;

function anthropic(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  client = apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
  return client;
}

export function claudeConfigured(): boolean {
  return anthropic() !== null;
}

/**
 * 설명을 생성한다. 키가 없거나, 느리거나, API가 실패하면 null.
 * 호출부는 null을 받으면 템플릿 폴백으로 내려가야 한다.
 */
export async function explainWithClaude(
  result: ScanResult,
): Promise<Explanation | null> {
  const anthropicClient = anthropic();
  if (!anthropicClient) return null;

  try {
    const response = await anthropicClient.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        // 재시도는 하지 않는다(maxRetries: 0). 느려지면 폴백이 더 낫다
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content: buildUserPrompt(result) }],
      },
      { timeout: TIMEOUT_MS },
    );

    const text = response.content.find((block) => block.type === "text");
    if (!text) return null;

    const parsed = JSON.parse(text.text) as {
      headline: string;
      reasons: string[];
      action: string;
    };

    // 스키마가 형태를 보장하므로 남은 방어는 "비어 있지 않은가" 뿐이다
    if (!parsed.headline || !parsed.action || parsed.reasons.length === 0) {
      return null;
    }

    return {
      headline: parsed.headline,
      reasons: parsed.reasons.slice(0, 4),
      action: parsed.action,
      source: "llm",
    };
  } catch (error) {
    // 어떤 실패든 폴백으로 내려간다. 서비스를 멈추지 않는 것이 우선이다
    console.error(
      "[claude] 설명 생성 실패, 템플릿으로 대체:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * 모델에 넘길 입력을 만든다.
 *
 * 확인하지 못한 시그널(unavailable)은 통째로 뺀다. 넣어두면 모델이 그걸
 * "문제없음"의 근거처럼 쓰는 경향이 있는데, 확인 못 한 것과 확인해서 깨끗한 것을
 * 뒤섞는 건 이 서비스가 가장 하면 안 되는 일이다.
 */
function buildUserPrompt(result: ScanResult): string {
  // 🚨 S9(사용자 신고)는 넘기지 않는다. 여기 넣으면 모델이 신고 건수를 판정의
  //    근거 문장으로 써버린다 — 판정과 신고를 섞지 않는다는 규칙(CLAUDE.md 8)을
  //    설명 레이어에서 어기게 된다. 신고 건수는 상세 목록에 사실로만 노출한다
  const scoring = result.signals.filter((signal) => signal.id !== "S9");
  const confirmed = scoring.filter(
    (signal) => signal.status === "hit" || signal.status === "clear",
  );
  const failed = scoring.filter((signal) => signal.status === "error");

  // 🚨 주소 원문을 보내지 않는다. 설명을 만드는 데 필요하지 않고
  //    (프롬프트에서 주소를 쓰지 말라고 지시한다), 보내는 순간 사용자가
  //    검사한 주소가 제3자에게 넘어간다. 마스킹된 도메인이면 충분하다.
  const lines = [
    `판정: ${result.verdict} (${VERDICT_LABEL[result.verdict]})`,
    `검사한 사이트: ${maskDomain(hostnameOf(result.normalizedUrl))}`,
  ];

  if (result.finalUrl !== result.normalizedUrl) {
    lines.push(`최종 도착지: ${maskDomain(hostnameOf(result.finalUrl))}`);
  }
  if (result.redirectChain.length > 1) {
    lines.push(`주소를 갈아탄 횟수: ${result.redirectChain.length}회`);
  }
  if (result.domainAge?.ageDays !== null && result.domainAge !== null) {
    lines.push(`이 사이트가 만들어진 지: ${result.domainAge.ageDays}일`);
  }

  lines.push("", "확인된 신호:");
  for (const signal of confirmed) {
    lines.push(`- [${signal.status}] ${describe(signal)}`);
  }
  if (failed.length > 0) {
    lines.push("", "확인에 실패한 항목:");
    for (const signal of failed) {
      lines.push(`- ${signal.detail ?? signal.name}`);
    }
  }

  lines.push(
    "",
    "위 신호만 근거로 headline, reasons, action을 작성해라.",
  );
  return lines.join("\n");
}

function describe(signal: Signal): string {
  const severity = signal.severity ? ` (심각도: ${signal.severity})` : "";
  return `${signal.detail ?? signal.name}${severity}`;
}
