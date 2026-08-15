/**
 * Upstash Redis (REST).
 *
 * TCP가 아니라 REST를 쓰는 이유: Vercel 서버리스는 요청마다 인스턴스가 떴다 죽는다.
 * TCP로 붙으면 매번 TLS 핸드셰이크를 다시 하고, 정리되지 않은 커넥션이 동시 연결
 * 한도를 잡아먹는다. REST는 커넥션 수명 관리가 없다.
 *
 * 키가 없으면 null을 반환한다. 로컬에서 Redis 없이도 서비스가 돌아가야 하므로
 * 호출부는 항상 null을 처리할 것.
 */

import { Redis } from "@upstash/redis";

let client: Redis | null | undefined;

export function redis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

export function redisConfigured(): boolean {
  return redis() !== null;
}
