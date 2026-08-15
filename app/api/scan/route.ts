/**
 * POST /api/scan — URL 검사.
 *
 * Node 런타임 고정: Edge에는 dns/undici가 없어 SSRF 가드가 동작하지 않는다.
 */

import { after, NextResponse } from "next/server";
import { z } from "zod";

import { clientIp, rateLimit } from "@/lib/ratelimit";
import { GuardError, scan } from "@/lib/scanner";
import {
  invalidateCachedScan,
  readCachedScan,
  writeCachedScan,
} from "@/lib/scanner/cache";
import { explainWithClaude } from "@/lib/scanner/claude";
import { buildFallbackExplanation } from "@/lib/scanner/explain";
import { normalizeUrl, urlHash } from "@/lib/scanner/normalize";
import { persistScan } from "@/lib/scanner/persist";
import type { ScanResponse } from "@/lib/scanner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCAN_LIMIT = 10;
const SCAN_WINDOW_MS = 60_000;

const bodySchema = z.object({
  url: z
    .string({ error: "주소를 입력해 주세요." })
    .trim()
    .min(1, "주소를 입력해 주세요.")
    .max(2048, "주소가 너무 길어요."),
  /** 사용자가 "다시 검사"를 누른 경우. 캐시를 건너뛴다 */
  refresh: z.boolean().optional(),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = await rateLimit(`scan:${ip}`, SCAN_LIMIT, SCAN_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "잠깐만요, 너무 빨라요. 잠시 뒤에 다시 검사해 주세요.",
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
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
    // 캐시 조회는 정규화까지만 하면 되므로 가드보다 앞에 둘 수 있다.
    // 정규화 실패는 아래 scan()에서 같은 방식으로 처리된다
    let hash: string | null = null;
    try {
      hash = urlHash(normalizeUrl(parsed.data.url));
    } catch {
      /* 정규화 실패. 캐시를 건너뛰고 scan()이 제대로 된 오류를 내게 한다 */
    }

    if (hash && parsed.data.refresh) {
      await invalidateCachedScan(hash);
    } else if (hash) {
      const cached = await readCachedScan(hash);
      if (cached) {
        // 🚨 캐시 결과라는 사실을 숨기지 않는다. 6시간 전 결과를 방금 확인한 것처럼
        //    보여주면, 그 사이 위험해진 사이트를 안전하다고 말하는 셈이 된다.
        //    사용자가 "다시 검사"로 강제 재확인할 수 있게 화면에서 알린다
        return NextResponse.json(
          { ...cached, fromCache: true },
          { headers: { "cache-control": "no-store" } },
        );
      }
    }

    const result = await scan(parsed.data.url);
    const explanation =
      (await explainWithClaude(result)) ?? buildFallbackExplanation(result);
    const response: ScanResponse = { ...result, explanation };

    // 캐시 기록과 DB 저장은 응답을 붙잡지 않는다
    after(async () => {
      await writeCachedScan(response);
      await persistScan(response);
    });

    return NextResponse.json(
      { ...response, fromCache: false },
      { headers: { "cache-control": "no-store" } },
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
