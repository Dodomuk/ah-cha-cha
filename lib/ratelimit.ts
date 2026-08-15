/**
 * IP 기준 rate limit (prd.md 4-5: 검사 10회/분, 신고 5회/시간).
 *
 * MVP는 인메모리다. Vercel의 인스턴스마다 카운터가 따로 도므로 실제 허용량은
 * 설정값보다 커진다. 남용이 보이기 시작하면 Upstash Redis로 교체할 것.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
/** 메모리 누수 방지 상한. 초과 시 만료된 항목부터 비운다 */
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** 재시도까지 남은 초 */
  retryAfterSeconds: number;
}

export function rateLimit(
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
