/**
 * 피싱·멀웨어 피드 동기화 및 대조 (S2·S3).
 *
 * 피드는 cron으로 주기 수집해 Redis에 넣고, 검사 때는 조회만 한다.
 * 검사 경로에서 원격 피드를 직접 받지 않는다 — 8초 목표(prd.md 9)를 지킬 수 없고
 * 피드 제공처에 부담을 준다.
 *
 * 대조를 두 갈래로 나누는 이유:
 *  - URL 완전일치는 그 페이지가 신고된 것이므로 danger
 *  - 호스트 일치는 "같은 호스팅에 신고된 페이지가 있다"는 뜻이라 caution.
 *    공유 호스팅(블로그·클라우드 스토리지)에 피싱 페이지 하나가 올라갔다고
 *    그 호스트 전체를 위험으로 몰면 대형 오탐이 된다.
 *
 * 이 파일이 접속하는 곳은 피드 제공처이지 검사 대상이 아니다. 신뢰 대상이므로
 * 일반 fetch를 쓴다 — safeFetch는 의심 URL 전용.
 */

import { createHash } from "node:crypto";

import { redis } from "../redis";
import { normalizeUrl, registrableDomain } from "./normalize";

export type FeedId = "openphish" | "urlhaus";

interface FeedSource {
  id: FeedId;
  name: string;
  url: string;
  /** 사용자에게 노출되는 짧은 설명 */
  label: string;
}

const SOURCES: FeedSource[] = [
  {
    id: "openphish",
    name: "OpenPhish Community",
    url: "https://openphish.com/feed.txt",
    label: "피싱 신고 목록",
  },
  {
    id: "urlhaus",
    name: "URLhaus (abuse.ch)",
    url: "https://urlhaus.abuse.ch/downloads/text_recent/",
    label: "악성코드 배포 목록",
  },
];

const FETCH_TIMEOUT_MS = 20_000;
/** 한 번의 동기화에서 받아들일 최대 URL 수. 메모리·Redis 용량 방어 */
const MAX_ENTRIES = 50_000;
/** 호스트 목록 만료. 동기화가 멈춰도 오래된 데이터로 판정하지 않는다 */
const FEED_TTL_SECONDS = 3 * 24 * 60 * 60;

/**
 * URL은 **누적**한다. 호스트는 하지 않는다.
 *
 * 🚨 이 비대칭이 핵심이다. 둘의 오탐 위험이 다르기 때문이다.
 *
 *    URL 완전일치  그 페이지 자체가 신고된 것이다. 1년 전 신고여도
 *                  "그 주소는 피싱이었다"는 사실은 변하지 않는다.
 *    호스트 일치    "같은 곳에 신고된 페이지가 있었다"는 뜻일 뿐이다.
 *                  뚫렸다 복구된 정상 사이트가 여기 걸린다 — 실측에서
 *                  정상 상위 도메인 200개 중 3개가 이것 때문에 caution 이
 *                  됐다. **누적하면 그 낙인이 영구화된다.**
 *
 * 누적하는 이유는 피드가 빠르게 밀려나기 때문이다. 실측(2026-08-17):
 * 0.6일 만에 OpenPhish 는 URL 의 79.7%, URLhaus 는 25%가 교체됐다.
 * OpenPhish 는 300건 고정 슬라이딩 윈도우라 하루도 안 돼 거의 전량이
 * 바뀐다 — 3일 만료로 버리면 1년에 약 11만 건을 그냥 흘려보내는 셈이다.
 *
 * 반대로 도메인은 오래 산다(같은 측정에서 94.9% 유지). 누적 이득이 적고
 * 오탐 위험만 크므로 지금처럼 교체만 한다.
 */
const URL_RETENTION_SECONDS = 90 * 24 * 60 * 60;
/** 누적 URL 상한. 넘으면 오래된 것부터 밀어낸다 */
const MAX_ACCUMULATED_URLS = 500_000;

/**
 * 누적 URL은 정렬집합에 담는다. score 가 처음 본 시각(초)이라
 * 90일이 지난 항목을 나이로 정확히 걷어낼 수 있다.
 * (기존 SET 키와 타입이 달라 이름을 바꿨다 — 옛 키는 만료되어 사라진다)
 */
const urlKey = (id: FeedId) => `feed:${id}:urlz`;
const hostKey = (id: FeedId) => `feed:${id}:hosts`;
const metaKey = (id: FeedId) => `feed:${id}:meta`;

/** URL은 원문 대신 해시로 저장한다. 길이가 들쭉날쭉한 URL을 그대로 넣으면 용량이 커진다 */
function entryHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* 동기화 (cron)                                                        */
/* ------------------------------------------------------------------ */

export interface SyncOutcome {
  feed: FeedId;
  ok: boolean;
  /** 이번 동기화에서 받은 URL 수 */
  urlCount: number;
  hostCount: number;
  /** 지금까지 쌓인 URL 수 (누적) */
  accumulatedUrls?: number;
  error?: string;
}

export async function syncAllFeeds(): Promise<SyncOutcome[]> {
  return Promise.all(SOURCES.map(syncFeed));
}

async function syncFeed(source: FeedSource): Promise<SyncOutcome> {
  const store = redis();
  if (!store) {
    return {
      feed: source.id,
      ok: false,
      urlCount: 0,
      hostCount: 0,
      error: "redis not configured",
    };
  }

  let text: string;
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "AhchachaBot/0.1 (+https://ahchacha.com/bot)" },
    });
    if (!response.ok) {
      return {
        feed: source.id,
        ok: false,
        urlCount: 0,
        hostCount: 0,
        error: `HTTP ${response.status}`,
      };
    }
    text = await response.text();
  } catch (error) {
    return {
      feed: source.id,
      ok: false,
      urlCount: 0,
      hostCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const urlHashes = new Set<string>();
  const hosts = new Set<string>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    // URLhaus 텍스트 피드는 상단에 #으로 시작하는 주석 블록이 있다
    if (!line || line.startsWith("#")) continue;
    if (urlHashes.size >= MAX_ENTRIES) break;

    try {
      const normalized = normalizeUrl(line);
      urlHashes.add(entryHash(normalized));
      hosts.add(registrableDomain(new URL(normalized).hostname));
    } catch {
      /* 피드에 깨진 줄이 섞이는 일이 있다. 조용히 건너뛴다 */
    }
  }

  if (urlHashes.size === 0) {
    return {
      feed: source.id,
      ok: false,
      urlCount: 0,
      hostCount: 0,
      error: "empty feed",
    };
  }

  // ── URL: 누적한다 ────────────────────────────────────────────────
  // 이미 있는 항목의 score 는 건드리지 않는다(NX). "처음 본 시각"이어야
  // 나이 기준 정리가 맞는다 — 매번 덮어쓰면 아무것도 만료되지 않는다.
  const seenAt = Math.floor(Date.now() / 1000);
  for (const chunk of chunked([...urlHashes], 1000)) {
    const [first, ...rest] = chunk.map((member) => ({ score: seenAt, member }));
    await store.zadd(urlKey(source.id), { nx: true }, first, ...rest);
  }

  // 90일 지난 것부터 걷어내고, 그래도 상한을 넘으면 오래된 순으로 더 밀어낸다
  await store.zremrangebyscore(
    urlKey(source.id),
    0,
    seenAt - URL_RETENTION_SECONDS,
  );
  const accumulated = await store.zcard(urlKey(source.id));
  if (accumulated > MAX_ACCUMULATED_URLS) {
    await store.zremrangebyrank(
      urlKey(source.id),
      0,
      accumulated - MAX_ACCUMULATED_URLS - 1,
    );
  }
  // 동기화가 완전히 멈추면 이 키도 결국 사라져야 한다. 매 동기화마다 갱신
  await store.expire(urlKey(source.id), URL_RETENTION_SECONDS);

  // ── 호스트: 교체한다 ─────────────────────────────────────────────
  // 임시 키에 채운 뒤 원자적으로 바꾼다. 기존 키를 지우고 채우면 그 사이
  // 검사 요청이 전부 "위험 목록에 없음"으로 빠진다
  const stagingHosts = `${hostKey(source.id)}:staging`;
  await store.del(stagingHosts);
  for (const chunk of chunked([...hosts], 1000)) {
    await store.sadd(stagingHosts, chunk[0], ...chunk.slice(1));
  }
  await store.rename(stagingHosts, hostKey(source.id));
  await store.expire(hostKey(source.id), FEED_TTL_SECONDS);

  await store.set(
    metaKey(source.id),
    {
      syncedAt: new Date().toISOString(),
      urlCount: urlHashes.size,
      accumulatedUrls: Math.min(accumulated, MAX_ACCUMULATED_URLS),
    },
    { ex: FEED_TTL_SECONDS },
  );

  return {
    feed: source.id,
    ok: true,
    urlCount: urlHashes.size,
    hostCount: hosts.size,
    accumulatedUrls: Math.min(accumulated, MAX_ACCUMULATED_URLS),
  };
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}

/* ------------------------------------------------------------------ */
/* 조회 (검사 경로)                                                     */
/* ------------------------------------------------------------------ */

export type FeedMatch = "url" | "host" | null;

export interface FeedLookup {
  status: "hit" | "clear" | "unavailable";
  match: FeedMatch;
  /** 매치된 피드 이름. 상세 리포트용 */
  source: string | null;
  syncedAt: string | null;
}

/**
 * 체인에 등장한 URL들을 피드와 대조한다.
 * 피드가 없으면(동기화 전, Redis 미설정) unavailable — clear로 처리하지 말 것.
 */
export async function lookupFeed(
  feed: FeedId,
  urls: string[],
): Promise<FeedLookup> {
  const store = redis();
  const source = SOURCES.find((candidate) => candidate.id === feed)!;
  const missing: FeedLookup = {
    status: "unavailable",
    match: null,
    source: null,
    syncedAt: null,
  };
  if (!store || urls.length === 0) return missing;

  let meta: { syncedAt: string; urlCount: number; accumulatedUrls?: number } | null;
  try {
    meta = await store.get<{ syncedAt: string; urlCount: number; accumulatedUrls?: number }>(
      metaKey(feed),
    );
  } catch {
    return missing;
  }
  if (!meta) return missing; // 아직 한 번도 동기화되지 않았다

  const hashes = urls.map((url) => entryHash(url));
  const hosts = [
    ...new Set(
      urls.flatMap((url) => {
        try {
          return [registrableDomain(new URL(url).hostname)];
        } catch {
          return [];
        }
      }),
    ),
  ];

  try {
    // 완전일치를 먼저 본다. 더 강한 근거이므로 호스트 일치보다 우선한다.
    // 누적 집합이라 오늘 피드에 없어도 90일 안에 신고된 적 있으면 걸린다
    const urlHits = (await store.zmscore(urlKey(feed), hashes)) ?? [];
    if (urlHits.some((score) => score !== null)) {
      return {
        status: "hit",
        match: "url",
        source: source.name,
        syncedAt: meta.syncedAt,
      };
    }

    if (hosts.length > 0) {
      const hostHits = await store.smismember(hostKey(feed), hosts);
      if (hostHits.some((hit) => hit === 1)) {
        return {
          status: "hit",
          match: "host",
          source: source.name,
          syncedAt: meta.syncedAt,
        };
      }
    }
  } catch {
    return missing;
  }

  return {
    status: "clear",
    match: null,
    source: source.name,
    syncedAt: meta.syncedAt,
  };
}
