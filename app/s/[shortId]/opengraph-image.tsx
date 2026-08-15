import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { readSharedResult } from "@/lib/share";
import { SITE } from "@/lib/site";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "아차차 검사 결과";

/**
 * 공유 카드 이미지 (prd.md 6.3).
 *
 * 🚨 카드에 실제 주소를 넣지 않는다. 마스킹된 도메인만 쓴다.
 *    카톡으로 퍼지는 이미지라, 원본 주소가 찍히면 그걸 보고 따라 들어가는
 *    사람이 생긴다.
 *
 * 한글은 폰트를 직접 넘겨야 렌더링된다. 안 넘기면 전부 □로 찍힌다.
 */

const VERDICT_STYLE = {
  danger: { label: "위험", bg: "#C81E2B", fg: "#FFFFFF", sub: "rgba(255,255,255,0.85)" },
  caution: { label: "주의", bg: "#E8A33D", fg: "#231F13", sub: "rgba(35,31,19,0.75)" },
  unknown: { label: "정보 부족", bg: "#8A90A6", fg: "#FFFFFF", sub: "rgba(255,255,255,0.85)" },
  no_signal: { label: "이상 없음", bg: "#2E9160", fg: "#FFFFFF", sub: "rgba(255,255,255,0.85)" },
} as const;

/**
 * 헤드라인 글자 크기. 문구가 AI 생성이라 길이를 예측할 수 없다.
 * 고정 크기로 두면 긴 문장에서 마지막 한 글자만 다음 줄로 떨어져 카드가 깨진다.
 */
function headlineSize(text: string): number {
  if (text.length <= 18) return 64;
  if (text.length <= 26) return 54;
  if (text.length <= 36) return 46;
  return 40;
}

let fontCache: Buffer | null = null;
async function loadFont(): Promise<Buffer> {
  fontCache ??= await readFile(
    join(process.cwd(), "public/fonts/noto-sans-kr-700.ttf"),
  );
  return fontCache;
}

export default async function Image({
  params,
}: {
  params: Promise<{ shortId: string }>;
}) {
  const { shortId } = await params;
  const result = await readSharedResult(shortId);
  const font = await loadFont();

  const style = result
    ? VERDICT_STYLE[result.verdict]
    : { label: "만료됨", bg: "#4A5164", fg: "#FFFFFF", sub: "rgba(255,255,255,0.8)" };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: style.bg,
          color: style.fg,
          padding: "72px 80px",
          fontFamily: "NotoKR",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              border: `3px solid ${style.fg}`,
              borderRadius: 999,
              padding: "8px 28px",
              fontSize: 34,
            }}
          >
            {style.label}
          </div>

          <div
            style={{
              display: "flex",
              fontSize: result ? headlineSize(result.headline) : 48,
              lineHeight: 1.25,
              // 한글은 어절 단위로 끊어야 한다. 없으면 "사이트입니/다."처럼 잘린다
              wordBreak: "keep-all",
            }}
          >
            {result ? result.headline.slice(0, 60) : "만료된 검사 결과예요"}
          </div>

          {result && (
            <div style={{ display: "flex", fontSize: 32, color: style.sub }}>
              {result.maskedDomain}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 26,
            color: style.sub,
          }}
        >
          <div style={{ display: "flex", maxWidth: 760, wordBreak: "keep-all" }}>
            {result?.reasons[0]?.slice(0, 52) ??
              "링크를 누르기 전에 먼저 확인해 보세요"}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: style.fg }}>
            {SITE.domain}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "NotoKR", data: font, weight: 700, style: "normal" }],
    },
  );
}
