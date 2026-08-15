/**
 * IP 기준 rate limit (prd.md 4-5: 검사 10회/분, 신고 5회/시간).
 *
 * Redis가 설정돼 있으면 Redis를, 아니면 인메모리를 쓴다.
 * 인메모리는 Vercel 인스턴스마다 카운터가 따로 돌아 실제 허용량이 설정값보다
 * 커진다. 로컬 개발용 폴백이며 운영에서는 Redis 경로를 타야 한다.
 */

import { redis } from "./redis";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** 재시도까지 남은 초 */
  retryAfterSeconds: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const store = redis();
  if (store) {
    try {
      return await redisRateLimit(key, limit, windowMs);
    } catch {
      // Redis 장애로 서비스를 멈추지는 않는다. 인메모리로 떨어뜨린다
      return memoryRateLimit(key, limit, windowMs);
    }
  }
  return memoryRateLimit(key, limit, windowMs);
}

async function redisRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const store = redis()!;
  const windowSeconds = Math.ceil(windowMs / 1000);
  // 창을 시간으로 쪼개 키에 박는다. 별도 정리 작업 없이 TTL로 사라진다
  const bucket = Math.floor(Date.now() / windowMs);
  const redisKey = `rl:${key}:${bucket}`;

  const count = await store.incr(redisKey);
  if (count === 1) {
    await store.expire(redisKey, windowSeconds);
  }

  if (count > limit) {
    const elapsed = Date.now() - bucket * windowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
    };
  }
  return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
}

/* ------------------------------------------------------------------ */
/* 인메모리 폴백                                                        */
/* ------------------------------------------------------------------ */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
/** 메모리 누수 방지 상한. 초과 시 만료된 항목부터 비운다 */
const MAX_BUCKETS = 10_000;

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSeconds: 0,
  };
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // 전부 유효한 상태라면 오래된 것부터 잘라낸다
  if (buckets.size >= MAX_BUCKETS) {
    const excess = buckets.size - Math.floor(MAX_BUCKETS / 2);
    let removed = 0;
    for (const key of buckets.keys()) {
      if (removed++ >= excess) break;
      buckets.delete(key);
    }
  }
}

/**
 * 신뢰할 수 있는 프록시(Vercel) 뒤에서 클라이언트 IP를 얻는다.
 * IP를 그대로 저장하지 않고, 신고 저장 시에는 해시해서 쓴다 (prd.md 7).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
