/**
 * 사용자 신고 누적 건수 조회 (S9).
 *
 * 🚨 이 값은 판정에 절대 반영하지 않는다 (CLAUDE.md 규칙 8).
 *    신고는 "누군가 그렇게 주장했다"는 사실이지 객관적 근거가 아니다.
 *    실존하는 가게를 신고 몇 건으로 "위험"이라 표시했다가 틀리면 명예훼손이 된다.
 *    verdict.ts 의 DISPLAY_ONLY 가 S9 를 판정 계산에서 빼는 것으로 이 규칙을 지킨다.
 *
 *    오탐 신고(false_positive)는 애초에 report_count 를 올리지 않는다 —
 *    DB 트리거(supabase/migrations/0001_init.sql)에서 걸러진다.
 */

import { db } from "../db";
import { registrableDomain } from "./normalize";

export interface ReportTally {
  status: "hit" | "clear" | "unavailable";
  count: number;
  /** 관리자가 검토를 마쳤는가. 검토 전 신고는 문구를 더 조심해서 쓴다 */
  reviewed: boolean;
}

const UNAVAILABLE: ReportTally = {
  status: "unavailable",
  count: 0,
  reviewed: false,
};

export async function lookupReportCount(hostname: string): Promise<ReportTally> {
  const store = db();
  if (!store) return UNAVAILABLE;

  let domain: string;
  try {
    domain = registrableDomain(hostname);
  } catch {
    return UNAVAILABLE;
  }

  try {
    const { data, error } = await store
      .from("domains")
      .select("report_count, admin_reviewed_at")
      .eq("domain", domain)
      .maybeSingle();

    // 조회 자체가 실패한 것과 "신고가 없다"는 다르다. 실패를 0건으로 보여주면
    // 신고가 쌓인 사이트를 깨끗한 것처럼 말하게 된다
    if (error) {
      console.error("[reports] 신고 건수 조회 실패:", error.message);
      return UNAVAILABLE;
    }

    // 도메인 행 자체가 없는 경우. 위험 판정이 난 적도 신고가 들어온 적도 없다
    if (!data) return { status: "clear", count: 0, reviewed: false };

    const count = Number(data.report_count ?? 0);
    return {
      status: count > 0 ? "hit" : "clear",
      count,
      reviewed: Boolean(data.admin_reviewed_at),
    };
  } catch (error) {
    console.error(
      "[reports] 예상치 못한 실패:",
      error instanceof Error ? error.message : error,
    );
    return UNAVAILABLE;
  }
}

/**
 * 화면에 그대로 나가는 문구.
 *
 * 🚨 신고를 판정처럼 말하지 않는다. "위험한 사이트예요"가 아니라
 *    "N명이 신고했어요"라는 **사실**만 전한다. 판정은 엔진 근거로만 낸다.
 */
export function describeReports(tally: ReportTally): string {
  if (tally.status === "unavailable") {
    return "신고 기록은 확인하지 못했어요.";
  }
  if (tally.count === 0) {
    return "이 사이트를 신고한 사람은 아직 없어요.";
  }
  const reviewed = tally.reviewed
    ? "관리자가 확인한 신고예요."
    : "아직 관리자가 확인하기 전이에요.";
  return `이 사이트를 위험하다고 신고한 사람이 ${tally.count}명 있어요. ${reviewed}`;
}

/* ------------------------------------------------------------------ */
/* 신고 기록                                                            */
/* ------------------------------------------------------------------ */

/** reports 테이블의 category 와 같은 값이어야 한다 */
export type ReportCategory =
  | "phishing"
  | "malware_app"
  | "scam_shop"
  | "gambling"
  | "spam"
  | "false_positive";

export type ReportOutcome = "ok" | "duplicate" | "failed";

/**
 * 신고 한 건을 남긴다.
 *
 * 🚨 오탐 신고(false_positive)도 같은 자리에 남는다. 다만 report_count 는
 *    올라가지 않는다 — DB 트리거가 걸러낸다. "위험하다는 신고 수"에
 *    "안전하다는 주장"을 같이 세면 숫자가 뒤집히기 때문이다.
 *
 * @param reporterHash 같은 사람의 중복 신고만 걸러내기 위한 값.
 *   웹은 IP 해시, 카카오톡은 botUserKey 해시를 넣는다. 원본은 저장하지 않는다.
 */
export async function recordReport(input: {
  domainId: string;
  category: ReportCategory;
  reporterHash: string;
  description?: string | null;
}): Promise<ReportOutcome> {
  const store = db();
  if (!store) return "failed";

  const { error } = await store.from("reports").insert({
    domain_id: input.domainId,
    category: input.category,
    description: input.description ?? null,
    reporter_ip_hash: input.reporterHash,
  });

  if (!error) return "ok";
  // 23505 = 유니크 위반. 이미 신고한 도메인이다
  if (error.code === "23505") return "duplicate";
  console.error("[reports] 신고 저장 실패:", error.message);
  return "failed";
}
