/**
 * POST /api/report — 사용자 신고 접수.
 *
 * 🚨 신고는 판정을 바꾸지 않는다 (CLAUDE.md 8). 여기서 하는 일은 "누가 이렇게
 *    주장했다"는 사실을 검토 큐에 쌓는 것뿐이다. 화면에 위험 표시를 올리는 것은
 *    운영자가 검토한 뒤에만 일어난다.
 *
 * 남용 방어는 네 겹이다:
 *   1. Turnstile — 자동 프로그램 차단
 *   2. rate limit — IP당 시간당 5회
 *   3. 중복 방지 — 같은 사람이 같은 도메인을 두 번 신고 못 함 (DB 유니크 인덱스)
 *   4. 검토 큐 — 쌓여도 자동 노출 안 됨
 */

import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { readCachedScan } from "@/lib/scanner/cache";
import { hostnameOf } from "@/lib/display";
import { ensureDomain } from "@/lib/scanner/persist";
import { turnstileConfigured, verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 60 * 60 * 1000;

export const REPORT_CATEGORIES = [
  { value: "phishing", label: "피싱 / 가짜 사이트" },
  { value: "malware_app", label: "악성앱 설치 유도" },
  { value: "scam_shop", label: "사기 쇼핑몰" },
  { value: "gambling", label: "도박 / 불법" },
  { value: "spam", label: "스팸" },
  { value: "false_positive", label: "오탐 신고 (안전한데 위험으로 나옴)" },
] as const;

const bodySchema = z.object({
  // 도메인을 직접 받지 않는다. 검사한 적 없는 도메인을 마음대로 신고하지
  // 못하게, 최근 검사 결과에서 도메인을 서버가 끌어온다
  urlHash: z.string().length(64, "검사 결과를 찾을 수 없어요."),
  category: z.enum(
    REPORT_CATEGORIES.map((c) => c.value) as [string, ...string[]],
    { error: "신고 유형을 선택해 주세요." },
  ),
  description: z.string().trim().max(200, "설명은 200자까지 쓸 수 있어요.").optional(),
  turnstileToken: z.string().optional(),
});

export async function POST(request: Request) {
  // 사용자에게는 같은 문구를 보여주되(설정 상태를 밖으로 흘리지 않는다),
  // 로그에는 무엇이 빠졌는지 구분해서 남긴다. 안 그러면 503만 보고
  // 어느 환경변수가 없는지 알 수 없다
  const store = db();
  if (!store) {
    console.error(
      "[report] SUPABASE_URL 또는 SUPABASE_SECRET_KEY 미설정 — 신고를 받지 않는다",
    );
    return fail(503, "신고 기능을 준비 중이에요.");
  }
  if (!turnstileConfigured()) {
    console.error("[report] TURNSTILE_SECRET_KEY 미설정 — 신고를 받지 않는다");
    return fail(503, "신고 기능을 준비 중이에요.");
  }

  const ip = clientIp(request.headers);
  const limit = await rateLimit(`report:${ip}`, REPORT_LIMIT, REPORT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "신고가 너무 잦아요. 잠시 뒤에 다시 시도해 주세요." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(400, "요청 형식을 알아보지 못했어요.");
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return fail(400, parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.");
  }

  const check = await verifyTurnstile(parsed.data.turnstileToken, ip);
  if (!check.ok) {
    if (check.reason === "not_configured") return fail(503, "신고 기능을 준비 중이에요.");
    return fail(400, "사람인지 확인하지 못했어요. 새로고침하고 다시 시도해 주세요.");
  }

  // 검사한 적 있는 주소만 신고할 수 있다. 캐시가 만료됐으면 다시 검사해야 한다
  const scanResult = await readCachedScan(parsed.data.urlHash);
  if (!scanResult) {
    return fail(
      404,
      "검사 결과가 만료됐어요. 주소를 다시 검사한 뒤 신고해 주세요.",
    );
  }

  // 🚨 판정을 함께 남긴다. 이게 없으면 관리자 큐에서 가장 중요한 케이스 —
  //    "엔진은 위험 신호가 없다고 했는데 사용자는 위험하다고 신고했다" — 를
  //    구별할 수 없다. 그 불일치가 우리가 얻을 수 있는 가장 비싼 정보다
  //    (prd.md 0.1절). persistScan 은 위험 판정일 때만 도메인 행을 만들기
  //    때문에, no_signal 을 신고한 경우 여기서 채우지 않으면 영영 비어 있다
  const domainId = await ensureDomain(hostnameOf(scanResult.finalUrl), {
    current_verdict: scanResult.verdict,
  });
  if (!domainId) return fail(500, "신고를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");

  // 원본 IP는 저장하지 않는다. 같은 사람의 중복 신고만 걸러내면 된다
  const ipHash = createHash("sha256")
    .update(`${ip}:${process.env.CRON_SECRET ?? "salt"}`)
    .digest("hex");

  const { error } = await store.from("reports").insert({
    domain_id: domainId,
    category: parsed.data.category,
    description: parsed.data.description || null,
    reporter_ip_hash: ipHash,
  });

  if (error) {
    // 23505 = 유니크 위반. 이미 신고한 도메인이다
    if (error.code === "23505") {
      return NextResponse.json({
        ok: true,
        alreadyReported: true,
        message: "이미 신고해 주신 사이트예요. 차차가 확인하고 있어요.",
      });
    }
    console.error("[report] 저장 실패:", error.message);
    return fail(500, "신고를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
  }

  return NextResponse.json({
    ok: true,
    alreadyReported: false,
    message:
      "차차가 확인해볼게요. 같은 신고가 모이면 다른 사람에게도 경고가 떠요.",
  });
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: "report_failed", message }, { status });
}
