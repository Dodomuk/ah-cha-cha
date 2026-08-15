/**
 * POST /api/scan — URL 검사.
 *
 * Sprint 1은 무상태다. 캐시·DB 저장은 Sprint 3에서 붙는다.
 * Node 런타임 고정: Edge에는 dns/undici가 없어 SSRF 가드가 동작하지 않는다.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIp, rateLimit } from "@/lib/ratelimit";
import { GuardError, scan } from "@/lib/scanner";
import { buildFallbackExplanation } from "@/lib/scanner/explain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_LIMIT = 10;
const SCAN_WINDOW_MS = 60_000;

const bodySchema = z.object({
  // 기본 메시지는 영어이므로 타입 오류 문구까지 직접 지정한다
  url: z
    .string({ error: "주소를 입력해 주세요." })
    .trim()
    .min(1, "주소를 입력해 주세요.")
    .max(2048, "주소가 너무 길어요."),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`scan:${ip}`, SCAN_LIMIT, SCAN_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "잠깐만요, 너무 빨라요. 잠시 뒤에 다시 검사해 주세요.",
      },
      {
        status: 429,
        headers: { "retry-after": String(limit.retryAfterSeconds) },
      },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("요청 형식을 알아보지 못했어요.");
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "주소를 확인해 주세요.");
  }

  try {
    const result = await scan(parsed.data.url);
    return NextResponse.json(
      {
        ...result,
        explanation: buildFallbackExplanation(result),
      },
      {
        // 검사 결과를 CDN에 태우지 않는다. 클로킹 대응상 매번 새로 확인해야 한다
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof GuardError) {
      return badRequest(error.userMessage);
    }
    console.error("[scan] unexpected failure", error);
    return NextResponse.json(
      {
        error: "scan_failed",
        message: "검사 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
}

function badRequest(message: string) {
  return NextResponse.json({ error: "invalid_request", message }, { status: 400 });
}
