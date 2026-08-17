/**
 * 목록에서 아직 살아 있는 주소만 골라낸다.
 *
 * KISA 피싱 데이터는 연 1회 스냅샷이라 대부분 이미 내려가 있다. 그런데
 * **본문을 읽는 시그널(S11)은 살아 있는 페이지가 있어야 검증할 수 있다.**
 * 전체를 훑어 생존자만 추리면 한국어 검증 표본이 된다.
 *
 * ```
 * npm run bench:live -- --in bench/data/kisa-2024.txt --limit 2000
 * ```
 *
 * 🚨 DNS를 `node:dns`의 lookup(getaddrinfo)으로 확인하면 안 된다.
 *    getaddrinfo는 libuv 스레드풀(기본 4개)에서 돈다. 타임아웃을 걸어도
 *    호출 자체는 스레드를 계속 붙잡고 있어서, 죽은 도메인이 많은 목록에서는
 *    4개 스레드에 전부 줄을 서고 처리량이 분당 8건까지 떨어진다.
 *    (실제로 600건 스윕이 10분을 넘겨 죽었다)
 *
 *    Resolver.resolve4는 UDP로 직접 질의하므로 스레드풀을 쓰지 않는다.
 *    호스트 파일·검색 도메인을 보지 않는 차이가 있는데, 외부 주소만
 *    다루는 여기서는 오히려 그쪽이 맞다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Resolver } from "node:dns/promises";

import { safeFetch } from "../lib/scanner/guard.ts";

const DNS_TIMEOUT_MS = 2_500;
const FETCH_TIMEOUT_MS = 7_000;
/** 살아 있다고 보는 최소 본문 크기. 이보다 작으면 껍데기다 */
const MIN_BODY = 1024;

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `http://${url}`).hostname;
  } catch {
    return null;
  }
}

async function pool<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>,
  label: string,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await worker(items[i]);
        if (++done % 50 === 0 || done === items.length) {
          process.stderr.write(`\r  ${label} ${done}/${items.length}`);
        }
      }
    }),
  );
  process.stderr.write("\n");
  return out;
}

/** 스레드풀을 쓰지 않는 DNS 확인. 응답이 하나라도 있으면 살아 있다 */
async function resolves(hostname: string): Promise<boolean> {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
  try {
    const records = await resolver.resolve4(hostname);
    return records.length > 0;
  } catch {
    try {
      return (await resolver.resolve6(hostname)).length > 0;
    } catch {
      return false;
    }
  }
}

async function main(): Promise<void> {
  const input = arg("in", "bench/data/kisa-2024.txt")!;
  const output = arg("out", "bench/data/kisa-live.txt")!;
  const limit = Number(arg("limit", "2000"));

  const all = [
    ...new Set(readFileSync(input, "utf8").split("\n").filter(Boolean)),
  ];

  // 시드 고정 표본. 같은 옵션이면 같은 URL이 뽑힌다
  let seed = 20260817;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const remaining = [...all];
  const sample: string[] = [];
  for (let i = 0; i < Math.min(limit, all.length); i++) {
    const k = Math.floor(next() * remaining.length);
    sample.push(remaining[k]);
    remaining.splice(k, 1);
  }

  console.log(`${input} — 고유 ${all.length}건 중 ${sample.length}건 확인\n`);

  const resolved = (
    await pool(
      sample,
      100,
      async (url) => {
        const host = hostOf(url);
        return host && (await resolves(host)) ? url : null;
      },
      "DNS",
    )
  ).filter((x): x is string => Boolean(x));
  console.log(
    `  DNS 응답 ${resolved.length}건 (${((resolved.length / sample.length) * 100).toFixed(1)}%)`,
  );

  const fetched = (
    await pool(
      resolved,
      25,
      async (url) => {
        try {
          // 🚨 접속은 safeFetch 로만 (CLAUDE.md 규칙 3)
          const res = await safeFetch(
            url.startsWith("http") ? url : `http://${url}`,
            { readBody: true, timeoutMs: FETCH_TIMEOUT_MS },
          );
          const html = res.body ?? "";
          if (res.status !== 200 || html.length < MIN_BODY) return null;
          const title = (
            html.match(/<title[^>]*>([\s\S]{0,80}?)<\/title>/i)?.[1] ?? ""
          )
            .replace(/\s+/g, " ")
            .trim();
          return { url, title };
        } catch {
          return null;
        }
      },
      "본문",
    )
  ).filter((x): x is { url: string; title: string } => Boolean(x));

  const rate = fetched.length / sample.length;
  console.log(
    `  본문 있음 ${fetched.length}건 (${(rate * 100).toFixed(1)}%)\n` +
      `  전체 ${all.length}건 환산 시 약 ${Math.round(all.length * rate)}건 생존\n`,
  );

  if (fetched.length > 0) {
    console.log("[살아 있는 페이지 제목]");
    for (const item of fetched.slice(0, 25)) {
      console.log(
        `   ${(item.title || "(제목 없음)").slice(0, 40).padEnd(42)} ${item.url.slice(0, 40)}`,
      );
    }
  }

  writeFileSync(output, fetched.map((f) => f.url).join("\n"));
  console.log(`\n→ ${output} 에 ${fetched.length}건 저장`);
}

main().catch((error) => {
  console.error("생존 확인 실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
