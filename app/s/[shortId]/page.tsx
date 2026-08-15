import type { Metadata } from "next";
import Link from "next/link";

import { Mascot } from "@/components/mascot";
import type { MascotPose } from "@/components/mascot";
import { SiteFooter } from "@/components/site-footer";
import { VERDICT_STYLE, formatScanTime } from "@/lib/display";
import { readSharedResult } from "@/lib/share";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shortId: string }>;
}): Promise<Metadata> {
  const { shortId } = await params;
  const result = await readSharedResult(shortId);
  if (!result) {
    return { title: "만료된 검사 결과", robots: { index: false } };
  }
  return {
    title: `${VERDICT_STYLE[result.verdict].label} — ${result.maskedDomain}`,
    description: result.headline,
    // 공유된 개별 결과는 검색에 노출될 이유가 없다
    robots: { index: false, follow: false },
  };
}

/**
 * 공유된 검사 결과 (prd.md 6.3).
 *
 * 🚨 원본 주소를 보여주지 않는다. 저장 자체를 마스킹된 형태로만 했다.
 *    카톡으로 퍼지는 링크라, 받은 사람이 원본 주소를 눌러볼 수 있으면
 *    경고를 전달하려던 것이 오히려 유입 경로가 된다.
 */
export default async function SharedResultPage({
  params,
}: {
  params: Promise<{ shortId: string }>;
}) {
  const { shortId } = await params;
  const result = await readSharedResult(shortId);

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-5 py-10">
        {result ? (
          <>
            <section className="flex flex-col items-center gap-4 text-center">
              {/* 위험 판정이면 마스코트를 쓰지 않는다 (CLAUDE.md 9) */}
              {VERDICT_STYLE[result.verdict].mascot && (
                <Mascot
                  pose={VERDICT_STYLE[result.verdict].mascot as MascotPose}
                  size={120}
                />
              )}

              <span
                className={`rounded-full px-4 py-1 text-sm font-bold ${VERDICT_STYLE[result.verdict].badge}`}
              >
                {VERDICT_STYLE[result.verdict].emoji}{" "}
                {VERDICT_STYLE[result.verdict].label}
              </span>

              <h1 className="text-xl leading-snug font-bold text-balance">
                {result.headline}
              </h1>
              <p className="font-mono text-sm break-all opacity-60">
                {result.maskedDomain}
              </p>
            </section>

            <ul className="flex flex-col gap-2 text-[15px]">
              {result.reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-xl bg-current/5 px-4 py-3 opacity-90"
                >
                  {reason}
                </li>
              ))}
            </ul>

            <p className="text-sm opacity-60">
              검사 시점: {formatScanTime(result.scannedAt)} · 이 결과는 그때 확인한
              범위예요. 사이트는 그 뒤에 바뀌었을 수 있어요.
            </p>
          </>
        ) : (
          <section className="flex flex-col items-center gap-4 text-center">
            <Mascot pose="sleeping" size={120} />
            <h1 className="text-xl font-bold">만료된 링크예요</h1>
            <p className="text-[15px] opacity-70">
              공유된 검사 결과는 30일 뒤에 사라져요. 직접 검사해 보세요.
            </p>
          </section>
        )}

        <Link
          href="/"
          className="self-center rounded-xl bg-brand px-6 py-3 font-bold text-white"
        >
          나도 링크 검사해보기
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
