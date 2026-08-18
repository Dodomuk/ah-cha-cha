/**
 * POST /api/kakao — 카카오톡 채널 챗봇 스킬 서버.
 *
 * 사용자가 채널에 스미싱 문자를 붙여넣으면 그 안의 주소를 검사해 답장한다.
 *
 * 🚨 카카오는 요청에 서명을 붙이지 않는다. 주소만 알면 누구나 호출할 수 있으므로
 *    경로에 비밀값을 넣어 막는다 (`/api/kakao?key=...`). 챗봇 관리자센터의
 *    스킬 URL에 그 값을 포함해 등록한다.
 *
 * 🚨 스킬 타임아웃은 5초다. 우리 검사는 중앙값 0.7초지만 죽은 주소는 20초까지
 *    간다(SCAN_BUDGET_MS). 그래서 콜백을 쓴다 — 5초 안에 "확인 중"을 돌려주고,
 *    끝나면 callbackUrl로 최종 답을 POST한다.
 */

import { after, NextResponse } from "next/server";

import {
  extractUrl,
  GUIDE_MESSAGE,
  NO_URL_MESSAGE,
  pendingReply,
  resultMessage,
  textReply,
  type KakaoSkillRequest,
} from "@/lib/kakao";
import { rateLimit } from "@/lib/ratelimit";
import { GuardError, scan } from "@/lib/scanner";
import { needsGeneratedProse, explainWithClaude } from "@/lib/scanner/claude";
import { buildFallbackExplanation } from "@/lib/scanner/explain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 콜백까지 감안한 여유. 스캔 자체는 20초에서 끊긴다 */
export const maxDuration = 60;

/** 한 사람이 분당 이 횟수를 넘기면 막는다 */
const LIMIT = 10;
const WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const secret = process.env.KAKAO_SKILL_SECRET;
  if (!secret) {
    console.error("[kakao] KAKAO_SKILL_SECRET 이 설정되지 않았습니다.");
    // 설정이 없으면 열어두지 않는다. 조용히 닫는 쪽이 안전하다
    return NextResponse.json(textReply(GUIDE_MESSAGE), { status: 503 });
  }
  if (new URL(request.url).searchParams.get("key") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: KakaoSkillRequest;
  try {
    payload = (await request.json()) as KakaoSkillRequest;
  } catch {
    return NextResponse.json(textReply(GUIDE_MESSAGE));
  }

  const utterance = payload.userRequest?.utterance?.trim() ?? "";
  const userKey = payload.userRequest?.user?.id ?? "unknown";
  const callbackUrl = payload.userRequest?.callbackUrl;

  if (!utterance) return NextResponse.json(textReply(GUIDE_MESSAGE));

  const limit = await rateLimit(`kakao:${userKey}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      textReply("잠깐만요, 너무 빨라요. 1분 뒤에 다시 보내주세요."),
    );
  }

  // 🚨 발화 전체를 쓰지 않는다. 주소만 뽑아 쓰고 나머지는 버린다 —
  //    문자에는 이름·금액 같은 개인적인 맥락이 그대로 실려 있다
  const target = extractUrl(utterance);
  if (!target) return NextResponse.json(textReply(NO_URL_MESSAGE));

  // 콜백을 못 쓰는 설정이면 그 자리에서 끝내야 한다. 5초를 넘기면 카카오가
  // 끊으므로, 그때는 검사를 포기하고 안내만 내보낸다
  if (!callbackUrl) {
    return NextResponse.json(
      textReply(
        "지금은 검사가 오래 걸릴 수 있어요. 잠시 뒤 다시 보내주시겠어요?",
      ),
    );
  }

  // 응답을 먼저 돌려주고 검사는 뒤에서 계속한다
  after(async () => {
    const text = await runScan(target);
    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(textReply(text)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.error(`[kakao] 콜백 실패 HTTP ${response.status}`);
      }
    } catch (error) {
      console.error(
        "[kakao] 콜백 전송 실패:",
        error instanceof Error ? error.message : error,
      );
    }
  });

  return NextResponse.json(
    pendingReply("차차가 대신 열어보고 있어요. 잠시만요…"),
  );
}

/** 검사해서 답장 문구까지 만든다. 어떤 실패든 사용자에게 문장을 돌려준다 */
async function runScan(target: string): Promise<string> {
  try {
    const result = await scan(target);
    const explanation =
      (needsGeneratedProse(result.verdict)
        ? await explainWithClaude(result)
        : null) ?? buildFallbackExplanation(result);
    return resultMessage(result, explanation);
  } catch (error) {
    if (error instanceof GuardError) return error.userMessage;
    console.error(
      "[kakao] 검사 실패:",
      error instanceof Error ? error.message : error,
    );
    return "검사 중 문제가 생겼어요. 잠시 뒤 다시 보내주세요.";
  }
}
