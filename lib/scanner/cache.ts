/**
 * 검사 결과 캐시 (Redis, 6시간).
 *
 * 🚨 TTL을 늘리지 말 것 (CLAUDE.md 6). 피싱 사이트는 방문자에 따라 다른 페이지를
 *    보여주는 클로킹을 한다. 오래된 "이상 없음" 결과는 없느니만 못하다.
 *
 * 캐시를 Postgres가 아니라 Redis에 두는 이유는 프라이버시다. 깨끗한 검사 결과에도
 * 주소 원문과 이동 경로가 들어 있는데, Redis는 TTL로 자동 소멸하므로 영구 보관과는
 * 무게가 다르다. Postgres에는 위험 판정만 남긴다 (supabase/migrations/0001_init.sql).
 */

import { redis } from "../redis";
import type { ScanResponse } from "./types";

/** prd.md 4-4 / CLAUDE.md 6 */
const TTL_SECONDS = 6 * 60 * 60;

const key = (urlHash: string) => `scan:${urlHash}`;

export async function readCachedScan(
  urlHash: string,
): Promise<ScanResponse | null> {
  const store = redis();
  if (!store) return null;
  try {
    return await store.get<ScanResponse>(key(urlHash));
  } catch {
    // 캐시 장애로 검사를 막지 않는다. 그냥 새로 검사한다
    return null;
  }
}

export async function writeCachedScan(result: ScanResponse): Promise<void> {
  const store = redis();
  if (!store) return;
  try {
    await store.set(key(result.urlHash), result, { ex: TTL_SECONDS });
  } catch {
    /* 캐시에 못 넣어도 결과는 이미 사용자에게 나갔다 */
  }
}

/** 사용자가 "다시 검사"를 눌렀을 때. 캐시를 비우고 새로 확인하게 한다 */
export async function invalidateCachedScan(urlHash: string): Promise<void> {
  const store = redis();
  if (!store) return;
  try {
    await store.del(key(urlHash));
  } catch {
    /* 무시 */
  }
}
