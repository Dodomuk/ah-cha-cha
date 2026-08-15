/**
 * 교차검증 실행기 — 라벨이 붙은 URL 묶음을 엔진에 통과시키고 결과를 집계한다.
 *
 * 실행:
 *   npm run bench -- --set urlhaus --limit 200
 *   npm run bench -- --set tranco  --limit 200 --band 10000-500000
 *   npm run bench -- --set openphish --limit 100 --vt
 *
 * 설계에서 중요한 두 가지:
 *
 * 1. **순환 참조를 깨고 채점한다.** URLhaus·OpenPhish는 우리 엔진의 입력(S2·S3)
 *    이기도 하다. 그 목록으로 점수를 내면 "정답지를 보고 푼 시험"이 된다.
 *    그래서 판정을 두 번 계산한다 — 엔진 그대로, 그리고 피드를 뺀 나머지 시그널만으로.
 *    뒤쪽이 우리가 실제로 알고 싶은 값이다.
 *
 * 2. **캐시·DB를 건드리지 않는다.** `/api/scan`이 아니라 `scan()`을 직접 부른다.
 *    라우트는 Redis 캐시 기록과 Supabase 저장을 하는데, 벤치 결과가 운영 데이터에
 *    섞이면 안 된다. Claude 설명 레이어도 통과하지 않는다 — 판정에 관여하지 않는
 *    부가 레이어인데 호출 비용만 든다.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GuardError, scan } from "../lib/scanner/index.ts";
import type { ScanResult, Signal, Verdict } from "../lib/scanner/types.ts";
import { decideVerdict } from "../lib/scanner/verdict.ts";
import { loadCorpus, OUT_DIR, type CorpusEntry, type Label } from "./corpus.ts";
import { lookupVirusTotal, vtConfigured, vtVerdict } from "./virustotal.ts";

/** 한 건이 이 시간을 넘으면 포기한다. 죽은 호스트가 전체를 붙잡지 않게 */
const PER_URL_TIMEOUT_MS = 45_000;
/** 피드 시그널. 순환을 깨기 위해 두 번째 채점에서 제외한다 */
const FEED_SIGNALS = new Set(["S2", "S3"]);

const VERDICTS: Verdict[] = ["danger", "caution", "unknown", "no_signal"];

interface Row {
  url: string;
  label: Label;
  /** 엔진이 실제로 내놓은 판정 */
  verdict: Verdict | "error";
  /** 피드(S2·S3)를 빼고 다시 계산한 판정 */
  verdictNoFeeds: Verdict | "error";
  /** hit 상태였던 시그널 id들 */
  hits: string[];
  /**
   * 시그널별 상태를 `S1=clear S4=hit` 형태로 눌러 담은 것.
   * unknown이 왜 났는지는 이게 없으면 알 수 없다 — 접속 실패인지,
   * 확인된 시그널 수가 모자란 것인지 구별되어야 고칠 곳을 찾는다
   */
  states: string;
  /** 판정에 참여한 시그널 중 hit·clear로 확정된 수 */
  confirmed: number;
  elapsedMs: number;
  error?: string;
  vt?: string;
  vtDetail?: string;
}

/* ------------------------------------------------------------------ */
/* 실행                                                                */
/* ------------------------------------------------------------------ */

async function scanOne(entry: CorpusEntry): Promise<Row> {
  const startedAt = Date.now();
  const base = {
    url: entry.url,
    label: entry.label,
    hits: [] as string[],
    states: "",
    confirmed: 0,
    elapsedMs: 0,
  };

  let result: ScanResult;
  try {
    result = await withTimeout(scan(entry.url), PER_URL_TIMEOUT_MS);
  } catch (error) {
    return {
      ...base,
      verdict: "error",
      verdictNoFeeds: "error",
      elapsedMs: Date.now() - startedAt,
      error:
        error instanceof GuardError
          ? `guard: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }

  const scored: Signal[] = result.signals.filter(
    (signal) => !FEED_SIGNALS.has(signal.id),
  );

  // S9는 표시 전용이라 판정에 세지 않는다 (verdict.ts의 DISPLAY_ONLY와 같은 기준)
  const counted = result.signals.filter((signal) => signal.id !== "S9");

  return {
    ...base,
    verdict: result.verdict,
    verdictNoFeeds: decideVerdict(scored),
    hits: result.signals
      .filter((signal) => signal.status === "hit")
      .map((signal) => signal.id),
    states: result.signals
      .map((signal) => `${signal.id}=${signal.status}`)
      .join(" "),
    confirmed: counted.filter(
      (signal) => signal.status === "hit" || signal.status === "clear",
    ).length,
    elapsedMs: Date.now() - startedAt,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${ms}ms 초과`)), ms),
    ),
  ]);
}

/** 고정 개수의 작업자가 큐를 나눠 처리한다 */
async function pool<T, R>(
  items: T[],
  size: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
        done++;
        process.stderr.write(`\r  ${done}/${items.length}`);
      }
    }),
  );
  process.stderr.write("\n");
  return results;
}

/* ------------------------------------------------------------------ */
/* 리포트                                                              */
/* ------------------------------------------------------------------ */

function tally(rows: Row[], key: "verdict" | "verdictNoFeeds") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  }
  return counts;
}

function pct(n: number, total: number): string {
  return total === 0 ? "  -" : `${Math.round((n / total) * 100)}%`.padStart(4);
}

function printReport(rows: Row[], label: Label, sourceName: string): void {
  const total = rows.length;
  const asIs = tally(rows, "verdict");
  const noFeeds = tally(rows, "verdictNoFeeds");

  const heading = label === "malicious" ? "악성" : "정상";
  console.log(`\n━━━ ${heading} 코퍼스 ${total}건 ━━━`);
  console.log(`출처: ${sourceName}\n`);
  console.log("                 엔진 그대로      피드 제외");

  for (const verdict of [...VERDICTS, "error" as const]) {
    const a = asIs.get(verdict) ?? 0;
    const b = noFeeds.get(verdict) ?? 0;
    if (a === 0 && b === 0) continue;

    // 이 코퍼스에서 무엇이 실패인지 표시한다.
    // 악성인데 no_signal = 미탐, 정상인데 danger = 오탐
    const flag =
      label === "malicious" && verdict === "no_signal"
        ? "  ← 미탐"
        : label === "benign" && verdict === "danger"
          ? "  ← 오탐"
          : label === "benign" && verdict === "caution"
            ? "  ← 약한 오탐"
            : "";

    console.log(
      `  ${verdict.padEnd(12)} ${String(a).padStart(5)} ${pct(a, total)}` +
        `   ${String(b).padStart(5)} ${pct(b, total)}${flag}`,
    );
  }

  // 어떤 시그널이 실제로 일했는가. 아무 시그널도 걸리지 않는다면
  // 그 시그널은 이 코퍼스에서 쓸모가 없다는 뜻이다
  const bySignal = new Map<string, number>();
  for (const row of rows) {
    for (const id of row.hits) {
      bySignal.set(id, (bySignal.get(id) ?? 0) + 1);
    }
  }
  if (bySignal.size > 0) {
    console.log("\n  시그널 적중");
    for (const [id, count] of [...bySignal].sort()) {
      console.log(`    ${id.padEnd(4)} ${String(count).padStart(5)} ${pct(count, total)}`);
    }
  }

  // unknown은 "위험하다"도 "괜찮다"도 아닌 유보 판정이라 많으면 서비스가 쓸모없어진다.
  // 접속을 못 한 것과 확인한 시그널이 모자란 것은 고칠 방법이 전혀 다르므로 나눠 센다
  const unknowns = rows.filter((row) => row.verdict === "unknown");
  if (unknowns.length > 0) {
    const unreachable = unknowns.filter((row) =>
      /S5=(error|unavailable)/.test(row.states),
    ).length;
    console.log("\n  unknown 원인");
    console.log(`    접속 실패            ${String(unreachable).padStart(5)} ${pct(unreachable, total)}`);
    console.log(
      `    확인된 시그널 부족    ${String(unknowns.length - unreachable).padStart(5)}` +
        ` ${pct(unknowns.length - unreachable, total)}`,
    );
  }

  const timings = rows.map((row) => row.elapsedMs).sort((a, b) => a - b);
  if (timings.length > 0) {
    const median = timings[Math.floor(timings.length / 2)];
    const p95 = timings[Math.floor(timings.length * 0.95)];
    console.log(`\n  소요 중앙값 ${(median / 1000).toFixed(1)}초 · p95 ${(p95 / 1000).toFixed(1)}초`);
  }
}

function printVtComparison(rows: Row[]): void {
  const compared = rows.filter((row) => row.vt && row.vt !== "unknown");
  if (compared.length === 0) {
    console.log("\n  VirusTotal: 비교 가능한 건이 없습니다 (전부 미등록/조회 실패)");
    return;
  }

  // 둘 다 "위험 쪽"이면 일치로 본다. 4단계와 VT 통계를 1:1로 맞출 수는 없어
  // danger/caution을 하나로 묶어 비교한다
  const risky = (verdict: string) => verdict === "danger" || verdict === "caution";
  let agree = 0;
  for (const row of compared) {
    if (risky(row.verdict) === risky(row.vt!)) agree++;
  }

  console.log(`\n  VirusTotal 대조 ${compared.length}건 중 일치 ${agree}건 (${pct(agree, compared.length).trim()})`);
  console.log(`  ※ VT가 모르는 URL은 비교에서 뺐습니다 (전체 ${rows.length}건 중 ${rows.length - compared.length}건)`);
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const sourceId = arg("set", "urlhaus")!;
  const limit = Number(arg("limit", "100"));
  const concurrency = Number(arg("concurrency", "4"));
  const useVt = process.argv.includes("--vt");

  const bandRaw = arg("band");
  const band = bandRaw
    ? (bandRaw.split("-").map(Number) as [number, number])
    : undefined;

  // --urls 로 직접 목록을 넘길 수 있다. 이전 실행에서 놓친 건만 따로 뽑아
  // 다시 돌리거나, 직접 모은 한국어 스미싱 목록을 넣을 때 쓴다
  const urlsFile = arg("urls");
  const corpus: CorpusEntry[] = urlsFile
    ? readFileSync(urlsFile, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .slice(0, limit)
        .map((url) => ({
          url,
          label: (arg("label", "malicious") as Label) ?? "malicious",
          source: `직접 지정 (${urlsFile})`,
        }))
    : await loadCorpus(sourceId, { limit, band });

  if (corpus.length === 0) throw new Error("코퍼스가 비었습니다");
  const sourceName = corpus[0].source;
  if (!urlsFile) console.log("코퍼스를 준비합니다…");

  if (useVt && !vtConfigured()) {
    console.error(
      "\n⚠️  --vt 를 켰지만 VIRUSTOTAL_API_KEY 가 없습니다. 대조를 건너뜁니다.\n",
    );
  }

  console.log(
    `\n${corpus.length}건을 동시 ${concurrency}개로 검사합니다.` +
      ` 대상 사이트에 실제로 접속합니다 — 최대 ${Math.ceil((corpus.length / concurrency) * 8)}초쯤 걸립니다.\n`,
  );

  const rows = await pool(corpus, concurrency, scanOne);

  if (useVt && vtConfigured()) {
    console.log(
      `\nVirusTotal 대조 중… 무료 키는 분당 4회라 ${Math.ceil((rows.length * 16) / 60)}분쯤 걸립니다.`,
    );
    for (const [index, row] of rows.entries()) {
      const result = await lookupVirusTotal(row.url);
      row.vt = vtVerdict(result);
      row.vtDetail =
        result.status === "found"
          ? `${result.malicious}/${result.total} 악성`
          : (result.error ?? result.status);
      process.stderr.write(`\r  ${index + 1}/${rows.length}`);
    }
    process.stderr.write("\n");
  }

  const label = corpus[0].label;
  printReport(rows, label, sourceName);
  if (useVt && vtConfigured()) printVtComparison(rows);

  // 원본을 남긴다. 요약만으로는 어떤 URL이 왜 틀렸는지 알 수 없다
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = join(OUT_DIR, `${urlsFile ? "custom" : sourceId}-${stamp}`);

  writeFileSync(`${base}.json`, JSON.stringify({ sourceName, rows }, null, 1));

  const header =
    "url\tlabel\tverdict\tverdictNoFeeds\thits\tconfirmed\tstates\tvt\tvtDetail\terror";
  writeFileSync(
    `${base}.tsv`,
    [
      header,
      ...rows.map((row) =>
        [
          row.url,
          row.label,
          row.verdict,
          row.verdictNoFeeds,
          row.hits.join("|"),
          row.confirmed,
          row.states,
          row.vt ?? "",
          row.vtDetail ?? "",
          row.error ?? "",
        ].join("\t"),
      ),
    ].join("\n"),
  );

  console.log(`\n결과: ${base}.tsv`);

  // 실패 건을 바로 볼 수 있게 몇 개만 화면에 띄운다
  const failures = rows.filter((row) =>
    label === "malicious"
      ? row.verdictNoFeeds === "no_signal"
      : row.verdict === "danger",
  );
  if (failures.length > 0) {
    console.log(
      `\n${label === "malicious" ? "미탐" : "오탐"} ${failures.length}건 중 상위 5건:`,
    );
    for (const row of failures.slice(0, 5)) {
      console.log(`  ${row.url.slice(0, 90)}`);
    }
  }
}

main().catch((error) => {
  console.error("\n벤치 실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
