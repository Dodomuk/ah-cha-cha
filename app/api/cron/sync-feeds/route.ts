/**
 * 피드 동기화 cron 엔드포인트.
 *
 * Vercel Cron이 `Authorization: Bearer $CRON_SECRET` 을 붙여 호출한다.
 * 공개 엔드포인트로 두면 누구나 피드 재수집을 유발해 제공처에 부담을 주고
 * Redis 쓰기 쿼터를 소진시킬 수 있으므로 반드시 인증을 건다.
 */

import { NextResponse } from "next/server";

import { redisConfigured } from "@/lib/redis";
import { syncAllFeeds } from "@/lib/scanner/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 피드가 커서 기본 제한으로는 모자랄 수 있다 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET이 설정되지 않았습니다." },
      { status: 500 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!redisConfigured()) {
    return NextResponse.json(
      { error: "Redis가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const started = Date.now();
  const results = await syncAllFeeds();

  return NextResponse.json(
    {
      results,
      elapsedMs: Date.now() - started,
      syncedAt: new Date().toISOString(),
    },
    {
      // 일부 피드가 실패해도 나머지는 갱신됐으므로 200으로 두고 본문에 표기한다
      status: results.some((result) => result.ok) ? 200 : 502,
      headers: { "cache-control": "no-store" },
    },
  );
}
