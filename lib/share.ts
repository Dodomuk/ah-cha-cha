/**
 * 공유 카드 (prd.md 6.3).
 *
 * 결과를 이미지로 만들어 카톡으로 보내는 기능. 부모님·지인에게 경고를 전달하는
 * 경로라 리텐션·바이럴 양쪽에 중요하다.
 *
 * 🚨 공유 레코드는 사용자가 "공유하기"를 누른 순간에만 만든다.
 *    깨끗한 결과도 공유할 수 있어야 하는데, 그 시점엔 사용자가 저장에 동의한
 *    것이므로 scans 테이블의 원문 제약과 별개로 결과를 담아둔다.
 *    다만 주소는 **마스킹된 형태로만** 저장한다 (CLAUDE.md 10).
 */

import { randomBytes } from "node:crypto";

import { db } from "./db";
import { hostnameOf, maskDomain } from "./display";
import type { ScanResponse, Verdict } from "./scanner/types";

/** 개인정보처리방침에 "만들어진 뒤 30일"로 적어둔 값 */
const TTL_DAYS = 30;

/** 혼동하기 쉬운 글자(0/O, 1/l/I)를 뺀 알파벳 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function makeShortId(length = 10): string {
  const bytes = randomBytes(length);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

export interface SharedResult {
  shortId: string;
  verdict: Verdict;
  maskedDomain: string;
  headline: string;
  reasons: string[];
  scannedAt: string;
}

/** 공유 레코드를 만들고 shortId를 돌려준다. 실패하면 null */
export async function createSharedResult(
  result: ScanResponse,
): Promise<string | null> {
  const store = db();
  if (!store) return null;

  const shortId = makeShortId();
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await store.from("shared_results").insert({
    short_id: shortId,
    verdict: result.verdict,
    // 원본 주소를 저장하지 않는다. 공유 링크를 받은 사람이 그대로 눌러볼 수 있다
    masked_domain: maskDomain(hostnameOf(result.finalUrl)),
    headline: result.explanation.headline,
    reasons: result.explanation.reasons.slice(0, 3),
    scanned_at: result.scannedAt,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("[share] 저장 실패:", error.message);
    return null;
  }
  return shortId;
}

export async function readSharedResult(
  shortId: string,
): Promise<SharedResult | null> {
  const store = db();
  if (!store) return null;

  const { data, error } = await store
    .from("shared_results")
    .select("short_id,verdict,masked_domain,headline,reasons,scanned_at,expires_at")
    .eq("short_id", shortId)
    .maybeSingle();

  if (error || !data) return null;
  // 만료된 링크는 없는 것으로 취급한다
  if (new Date(data.expires_at as string) < new Date()) return null;

  return {
    shortId: data.short_id as string,
    verdict: data.verdict as Verdict,
    maskedDomain: data.masked_domain as string,
    headline: data.headline as string,
    reasons: (data.reasons as string[]) ?? [],
    scannedAt: data.scanned_at as string,
  };
}
