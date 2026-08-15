/**
 * POST /api/share — 검사 결과의 공유 링크를 만든다.
 *
 * 클라이언트가 결과 본문을 보내지 않는다. urlHash만 받아 서버가 캐시에서
 * 결과를 꺼내 쓴다 — 그러지 않으면 아무 내용이나 담은 가짜 "검사 결과"
 * 공유 링크를 만들 수 있다.
 */

import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIp, rateLimit } from "@/lib/ratelimit";
import { readCachedScan } from "@/lib/scanner/cache";
import { createSharedResult } from "@/lib/share";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  urlHash: z.string().length(64),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = await rateLimit(`share:${ip}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "잠시 뒤에 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "요청 형식을 알아보지 못했어요." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: "검사 결과를 찾을 수 없어요." },
      { status: 400 },
    );
  }

  const result = await readCachedScan(parsed.data.urlHash);
  if (!result) {
    return NextResponse.json(
      {
        error: "expired",
        message: "검사 결과가 만료됐어요. 다시 검사한 뒤 공유해 주세요.",
      },
      { status: 404 },
    );
  }

  const shortId = await createSharedResult(result);
  if (!shortId) {
    return NextResponse.json(
      { error: "share_failed", message: "공유 링크를 만들지 못했어요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ shortId, url: `${SITE.url}/s/${shortId}` });
}
