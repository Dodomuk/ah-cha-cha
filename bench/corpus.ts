/**
 * 교차검증용 코퍼스 수집.
 *
 * 라벨이 붙은 URL 목록을 외부에서 받아 `bench/data/`에 캐시한다.
 * 한 번 받은 파일은 재사용한다 — 제공처에 부담을 주지 않기 위해서이기도 하고,
 * 코퍼스가 실행마다 바뀌면 판정 변화가 엔진 때문인지 코퍼스 때문인지 알 수 없다.
 *
 * 🚨 여기서 받는 곳은 피드 제공처이지 검사 대상이 아니다. 신뢰 대상이므로
 *    일반 fetch를 쓴다. 코퍼스에 담긴 URL 자체는 절대 여기서 접속하지 않는다 —
 *    그건 scan()이 safeFetch로만 한다.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, "data");
export const OUT_DIR = join(HERE, "out");

export type Label = "malicious" | "benign";

export interface CorpusEntry {
  url: string;
  label: Label;
  /** 라벨의 출처. 리포트에서 "누구 기준의 정답인가"를 밝히는 데 쓴다 */
  source: string;
}

interface Source {
  id: string;
  label: Label;
  url: string;
  /** 사람이 읽는 이름 */
  name: string;
  /**
   * 이 출처가 우리 엔진의 입력이기도 한가.
   * true면 그 시그널을 빼고 채점해야 순환이 깨진다.
   */
  isEngineInput: boolean;
  parse: (raw: Buffer) => string[];
}

const UA = "AhchachaBench/0.1 (+https://ahchacha.com/bot)";
const FETCH_TIMEOUT_MS = 60_000;

/* ------------------------------------------------------------------ */
/* 파서                                                                */
/* ------------------------------------------------------------------ */

/** 한 줄에 URL 하나. `#`으로 시작하는 주석 블록을 걷어낸다 */
function parseTextFeed(raw: Buffer): string[] {
  return raw
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * 단일 항목 zip에서 원본을 꺼낸다.
 *
 * Tranco·Umbrella 같은 순위 목록은 zip으로만 배포된다. 의존성을 하나 더 들이는
 * 대신 로컬 파일 헤더만 읽고 raw deflate를 푼다. 범용 zip 구현이 아니다 —
 * 이 두 곳이 내보내는 "deflate로 압축된 단일 CSV" 형태만 처리한다.
 */
function unzipSingle(raw: Buffer): Buffer {
  if (raw.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("zip 로컬 헤더를 찾지 못했습니다");
  }
  const method = raw.readUInt16LE(8);
  const compressedSize = raw.readUInt32LE(18);
  const nameLength = raw.readUInt16LE(26);
  const extraLength = raw.readUInt16LE(28);
  const start = 30 + nameLength + extraLength;

  // 스트리밍으로 만든 zip은 크기가 0이고 뒤쪽 중앙 디렉토리에만 값이 있다.
  // 그런 경우 중앙 디렉토리 시작 전까지를 데이터로 본다
  const end =
    compressedSize > 0
      ? start + compressedSize
      : (() => {
          const marker = raw.indexOf(
            Buffer.from([0x50, 0x4b, 0x01, 0x02]),
            start,
          );
          if (marker < 0) throw new Error("zip 중앙 디렉토리를 찾지 못했습니다");
          return marker;
        })();

  const body = raw.subarray(start, end);
  if (method === 0) return body;
  if (method === 8) return inflateRawSync(body);
  throw new Error(`지원하지 않는 zip 압축 방식: ${method}`);
}

/** `rank,domain` CSV → `https://domain/` */
function parseRankedCsv(raw: Buffer): string[] {
  return unzipSingle(raw)
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim().split(",")[1])
    .filter((domain): domain is string => Boolean(domain))
    .map((domain) => `https://${domain}/`);
}

/* ------------------------------------------------------------------ */
/* 출처                                                                */
/* ------------------------------------------------------------------ */

export const SOURCES: Source[] = [
  {
    id: "urlhaus",
    name: "URLhaus (abuse.ch) — 현재 살아 있는 멀웨어 배포 URL",
    label: "malicious",
    // 엔진은 text_recent(최근분)를 쓴다. 여기서는 online(현재 살아 있는 전체)을
    // 받는다. 겹치는 구간이 있으므로 채점은 S3를 빼고도 함께 낸다
    url: "https://urlhaus.abuse.ch/downloads/text_online/",
    isEngineInput: true,
    parse: parseTextFeed,
  },
  {
    id: "openphish",
    name: "OpenPhish Community — 피싱 URL",
    label: "malicious",
    url: "https://openphish.com/feed.txt",
    isEngineInput: true,
    parse: parseTextFeed,
  },
  {
    id: "tranco",
    name: "Tranco — 접속량 상위 도메인",
    label: "benign",
    url: "https://tranco-list.eu/top-1m.csv.zip",
    isEngineInput: false,
    parse: parseRankedCsv,
  },
  {
    id: "freehost",
    name: "GitHub — 무료 호스팅에 올라온 정상 프로젝트",
    label: "benign",
    // 아래 fetchFreeHostCorpus 가 대신 처리한다. url·parse 는 쓰이지 않는다
    url: "",
    isEngineInput: false,
    parse: () => [],
  },
];

/* ------------------------------------------------------------------ */
/* 무료 호스팅 위의 정상 사이트                                          */
/* ------------------------------------------------------------------ */

/**
 * Tranco 같은 순위 목록에는 무료 호스팅 서브도메인이 한 건도 없다 —
 * 등록가능 도메인 단위로 집계되기 때문이다. 그래서 "vercel.app 에 올라온
 * 정상 사이트"의 오탐률을 잴 표본이 없었다.
 *
 * GitHub에서 가져온다. 자기 프로젝트를 무료 호스팅에 올리고 그 주소를 저장소
 * 설명에 적어둔 사람들이다 — 공격자가 아니라 개발자가 만든 진짜 사이트다.
 *
 * 인증 없이 쓰면 검색 API가 분당 10회로 묶이므로 요청 사이를 벌린다.
 */
const GITHUB_QUERIES = [
  "github.io+in:name+stars:>3",
  "vercel.app+in:description",
  "netlify.app+in:description",
  "pages.dev+in:description",
  "workers.dev+in:description",
];

async function fetchFreeHostCorpus(): Promise<string[]> {
  const found = new Set<string>();

  for (const [index, query] of GITHUB_QUERIES.entries()) {
    for (const page of [1, 2]) {
      // 분당 10회 제한. 여유 있게 벌린다
      if (index > 0 || page > 1) {
        await new Promise((resolve) => setTimeout(resolve, 7_000));
      }

      let items: Array<{ homepage?: string | null; full_name?: string }>;
      try {
        const response = await fetch(
          `https://api.github.com/search/repositories?q=${query}&per_page=100&page=${page}`,
          {
            headers: { accept: "application/vnd.github+json", "user-agent": UA },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          },
        );
        if (!response.ok) break; // 한도 초과. 지금까지 모은 것으로 진행한다
        items = ((await response.json()) as { items?: typeof items }).items ?? [];
      } catch {
        break;
      }
      if (items.length === 0) break;

      for (const repo of items) {
        for (const candidate of [
          repo.homepage,
          // `user.github.io` 저장소는 그 이름이 곧 사이트 주소다
          repo.full_name?.split("/")[1]?.endsWith(".github.io")
            ? `https://${repo.full_name.split("/")[1]}/`
            : null,
        ]) {
          if (!candidate) continue;
          try {
            const url = new URL(
              candidate.startsWith("http") ? candidate : `https://${candidate}`,
            );
            if (isFreeHostingHost(url.hostname)) found.add(url.toString());
          } catch {
            /* 설명에 적힌 주소가 깨진 경우가 흔하다 */
          }
        }
      }
      process.stderr.write(`\r  수집 ${found.size}건`);
    }
  }
  process.stderr.write("\n");
  return [...found];
}

/** corpus 단계에서만 쓰는 간이 판정. 운영 로직은 lib/scanner/hosting.ts */
const FREE_SUFFIXES = [
  "vercel.app", "netlify.app", "pages.dev", "workers.dev", "github.io",
  "web.app", "firebaseapp.com", "replit.app", "onrender.com", "surge.sh",
];

function isFreeHostingHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return FREE_SUFFIXES.some(
    (suffix) => host.endsWith(`.${suffix}`) && host !== suffix,
  );
}

export function findSource(id: string): Source {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (!source) {
    throw new Error(
      `모르는 코퍼스: ${id} (가능: ${SOURCES.map((s) => s.id).join(", ")})`,
    );
  }
  return source;
}

/* ------------------------------------------------------------------ */
/* 수집                                                                */
/* ------------------------------------------------------------------ */

async function download(source: Source): Promise<string[]> {
  mkdirSync(DATA_DIR, { recursive: true });
  const cached = join(DATA_DIR, `${source.id}.txt`);

  if (existsSync(cached)) {
    return readFileSync(cached, "utf8").split("\n").filter(Boolean);
  }

  process.stderr.write(`  ↓ ${source.name}\n`);

  if (source.id === "freehost") {
    const entries = await fetchFreeHostCorpus();
    if (entries.length === 0) {
      throw new Error("GitHub에서 한 건도 모으지 못했습니다 (API 한도 확인)");
    }
    writeFileSync(cached, entries.join("\n"), "utf8");
    return entries;
  }

  const response = await fetch(source.url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `${source.id} 내려받기 실패 (HTTP ${response.status}). ` +
        `abuse.ch는 무료 계정 인증키를 요구할 수 있습니다 — bench/README.md 참조`,
    );
  }

  const entries = source.parse(Buffer.from(await response.arrayBuffer()));
  if (entries.length === 0) throw new Error(`${source.id}가 비어 있습니다`);

  writeFileSync(cached, entries.join("\n"), "utf8");
  return entries;
}

export interface LoadOptions {
  /** 몇 개를 뽑을 것인가 */
  limit: number;
  /** 순위 목록에서 뽑을 구간. `[10000, 500000]` 같은 형태 */
  band?: [number, number];
  /** 같은 실행을 재현할 수 있게 고정 시드를 쓴다 */
  seed?: number;
}

/**
 * 코퍼스를 뽑는다.
 *
 * 상위 도메인 목록은 **구간을 지정해서** 뽑는 것을 권한다. 1위~1000위는
 * 어떤 엔진이든 맞히는 쉬운 음성이라 오탐률이 실제보다 좋게 나온다.
 * 오탐은 이름 없는 소규모 정상 사이트에서 나기 때문이다.
 */
export async function loadCorpus(
  sourceId: string,
  options: LoadOptions,
): Promise<CorpusEntry[]> {
  const source = findSource(sourceId);
  const all = await download(source);

  const [from, to] = options.band ?? [0, all.length];
  const window = all.slice(from, Math.min(to, all.length));
  if (window.length === 0) {
    throw new Error(`${sourceId}의 ${from}~${to} 구간이 비었습니다`);
  }

  const picked = sample(window, options.limit, options.seed ?? 20260815);
  return picked.map((url) => ({
    url,
    label: source.label,
    source: source.name,
  }));
}

/** 시드 고정 셔플. 실행을 반복해도 같은 표본이 나와야 비교가 된다 */
function sample<T>(items: T[], count: number, seed: number): T[] {
  if (count >= items.length) return [...items];
  let state = seed >>> 0;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(next() * pool.length);
    out.push(pool[index]);
    pool.splice(index, 1);
  }
  return out;
}
