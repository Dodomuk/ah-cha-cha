/**
 * 검사 결과를 PostgreSQL에 남긴다.
 *
 * 🚨 저장 정책 — 위험한 것만 원문을 남긴다.
 *    danger / caution  → 주소 원문·이동 경로·설명까지. 신고 처리와 이의제기
 *                        대응에 실제로 필요하다
 *    그 외             → url_hash 와 판정만. 무엇을 검사했는지 알 수 없다
 *
 *    이 규칙은 개인정보처리방침(app/privacy)에 그대로 적혀 있다. 여기를 고치면
 *    방침도 함께 고쳐야 한다. DB에도 같은 제약이 걸려 있어서, 어기면 INSERT가
 *    실패한다 (supabase/migrations/0001_init.sql).
 */

import { db } from "../db";
import { registrableDomain } from "./normalize";
import type { ScanResponse } from "./types";

/** 원문을 남겨도 되는 판정 */
function keepsPlaintext(verdict: string): boolean {
  return verdict === "danger" || verdict === "caution";
}

/**
 * 도메인 행을 확보한다. 위험 판정이거나 신고가 있을 때만 만든다 —
 * 깨끗한 사이트를 검사했다는 이유로 행을 만들면 "누가 뭘 검사했는지"가
 * 도메인 목록으로 남는다.
 */
export async function ensureDomain(
  hostname: string,
  patch: { current_verdict?: string; registered_at?: string | null } = {},
): Promise<string | null> {
  const store = db();
  if (!store) return null;

  const domain = registrableDomain(hostname);
  const { data, error } = await store
    .from("domains")
    .upsert(
      { domain, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "domain" },
    )
    .select("id")
    .single();

  if (error) {
    console.error("[persist] 도메인 저장 실패:", error.message);
    return null;
  }
  return data.id as string;
}

/**
 * 검사 이력을 남긴다. 실패해도 예외를 던지지 않는다 —
 * 사용자에게는 이미 결과가 나갔고, 기록을 못 남긴 것으로 검사를 실패시킬 이유가 없다.
 */
export async function persistScan(result: ScanResponse): Promise<void> {
  const store = db();
  if (!store) return;

  try {
    const risky = keepsPlaintext(result.verdict);
    let domainId: string | null = null;

    if (risky) {
      try {
        domainId = await ensureDomain(new URL(result.finalUrl).hostname, {
          current_verdict: result.verdict,
          registered_at: result.domainAge?.registeredAt ?? null,
        });
      } catch {
        /* finalUrl 파싱 실패. 도메인 없이 검사 이력만 남긴다 */
      }
    }

    const { error } = await store.from("scans").insert({
      url_hash: result.urlHash,
      domain_id: domainId,
      verdict: result.verdict,
      scanned_at: result.scannedAt,
      expires_at: result.expiresAt,
      // ↓ 위험 판정일 때만 채운다
      normalized_url: risky ? result.normalizedUrl : null,
      final_url: risky ? result.finalUrl : null,
      signals: risky ? result.signals : null,
      redirect_chain: risky ? result.redirectChain : null,
      llm_explanation: risky ? result.explanation : null,
    });

    if (error) console.error("[persist] 검사 이력 저장 실패:", error.message);
  } catch (error) {
    console.error(
      "[persist] 예상치 못한 실패:",
      error instanceof Error ? error.message : error,
    );
  }
}
