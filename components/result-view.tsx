"use client";

import {
  VERDICT_STYLE,
  formatScanTime,
  hostnameOf,
  maskDomain,
} from "@/lib/display";
import type { ScanResponse } from "@/lib/scanner/types";

import { Mascot } from "./mascot";
import type { MascotPose } from "./mascot";

/**
 * 결과 화면 (prd.md 6.2 ③).
 *
 * 🚨 판정에 따라 레이아웃이 갈린다. danger는 마스코트를 빼고 경고가 화면을
 *    차지한다 (CLAUDE.md 9). 두 분기를 하나로 합치지 말 것 — 합치는 순간
 *    귀여움이 경고를 무르게 만드는 구조가 된다.
 *
 * 🚨 검사한 주소를 클릭 가능한 링크(<a href>)로 만들지 말 것 (CLAUDE.md 10).
 *    도메인은 부분 마스킹해서 텍스트로만 보여준다.
 */
export function ResultView({
  result,
  onReset,
}: {
  result: ScanResponse;
  onReset: () => void;
}) {
  const style = VERDICT_STYLE[result.verdict];
  const maskedDomain = maskDomain(hostnameOf(result.finalUrl));

  return (
    <div className="flex flex-col gap-6">
      {result.verdict === "danger" ? (
        <DangerHeader result={result} maskedDomain={maskedDomain} />
      ) : (
        <SafeHeader
          result={result}
          maskedDomain={maskedDomain}
          pose={style.mascot as MascotPose}
        />
      )}

      <DetailReport result={result} />

      <footer className="flex flex-col gap-3 border-t border-current/10 pt-4 text-sm">
        <p className="opacity-60">
          검사 시점: {formatScanTime(result.scannedAt)} · 새 위험 사이트는 계속
          생겨요. 이 결과는 지금 확인한 범위입니다.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="self-start rounded-full border border-current/20 px-5 py-2 font-medium transition hover:bg-current/5"
        >
          다른 주소 검사하기
        </button>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 위험 — 경고가 전면                                                   */
/* ------------------------------------------------------------------ */

function DangerHeader({
  result,
  maskedDomain,
}: {
  result: ScanResponse;
  maskedDomain: string;
}) {
  // APK 설치 유도가 있었는지에 따라 대처 안내가 달라진다
  const apkDetected = result.signals.some(
    (signal) => signal.id === "S8" && signal.status === "hit",
  );

  return (
    <section>
      <div className="rounded-2xl bg-verdict-danger p-6 text-white">
        <p className="text-sm font-bold tracking-wide opacity-90">🚨 위험</p>
        <h2 className="mt-2 text-2xl leading-snug font-bold text-balance">
          {result.explanation.headline}
        </h2>
        <p className="mt-3 font-mono text-sm break-all opacity-80">
          {maskedDomain}
        </p>

        <ul className="mt-5 flex flex-col gap-2 text-[15px]">
          {result.explanation.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-2xl border-2 border-verdict-danger/30 p-5">
        <h3 className="text-lg font-bold">지금 할 일</h3>
        <dl className="mt-4 flex flex-col gap-4 text-[15px]">
          <ActionItem term="아직 아무것도 안 했다면">
            이 링크를 열지 말고 지우세요. 보낸 사람이 아는 사람이라면 그 사람
            계정이 도용된 것일 수 있으니 전화로 확인하세요.
          </ActionItem>
          <ActionItem term="이미 아이디·비밀번호를 입력했다면">
            지금 바로 해당 사이트의 비밀번호를 바꾸고, 같은 비밀번호를 쓰는 다른
            곳도 함께 바꾸세요. 금융 정보를 넣었다면 금융감독원{" "}
            <strong>1332</strong>, 경찰청 <strong>112</strong>로 신고하세요.
          </ActionItem>
          {apkDetected && (
            <ActionItem term="앱을 설치했다면">
              설정 → 애플리케이션에서 해당 앱을 삭제하고,{" "}
              <strong>다운로드 폴더에 남은 설치 파일(.apk)까지</strong>{" "}
              지우세요. 삭제가 안 되면 기기를 비행기 모드로 바꾼 뒤 통신사나
              경찰에 문의하세요.
            </ActionItem>
          )}
        </dl>
      </div>
    </section>
  );
}

function ActionItem({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-bold">{term}</dt>
      <dd className="mt-1 opacity-80">{children}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 이상 없음 · 주의 · 정보 부족 — 차차가 전면                            */
/* ------------------------------------------------------------------ */

function SafeHeader({
  result,
  maskedDomain,
  pose,
}: {
  result: ScanResponse;
  maskedDomain: string;
  pose: MascotPose;
}) {
  const style = VERDICT_STYLE[result.verdict];

  return (
    <section className="flex flex-col items-center gap-4 text-center">
      <Mascot pose={pose} size={130} />

      <span
        className={`rounded-full px-4 py-1 text-sm font-bold ${style.badge}`}
      >
        {style.emoji} {style.label}
      </span>

      <h2 className="text-xl leading-snug font-bold text-balance">
        {result.explanation.headline}
      </h2>
      <p className="font-mono text-sm break-all opacity-60">{maskedDomain}</p>

      <ul className="mt-2 flex w-full flex-col gap-2 text-left text-[15px]">
        {result.explanation.reasons.map((reason) => (
          <li
            key={reason}
            className="rounded-xl bg-current/5 px-4 py-3 opacity-90"
          >
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-2 w-full rounded-xl border border-current/15 px-4 py-3 text-left">
        <p className="text-sm font-bold">그래도 조심할 점</p>
        <p className="mt-1 text-[15px] opacity-80">
          {result.explanation.action}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 상세 리포트 (prd.md 6.2 ④) — 기본 접힘                               */
/* ------------------------------------------------------------------ */

const SIGNAL_STATUS_LABEL: Record<string, string> = {
  hit: "발견",
  clear: "확인함",
  unavailable: "확인 못 함",
  error: "확인 실패",
};

function DetailReport({ result }: { result: ScanResponse }) {
  return (
    <details className="rounded-xl border border-current/15">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium select-none">
        어떻게 확인했는지 보기
      </summary>

      <div className="flex flex-col gap-5 border-t border-current/10 px-4 py-4 text-sm">
        <div>
          <h4 className="font-bold">확인한 항목</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {result.signals.map((signal) => (
              <li key={signal.id} className="flex gap-2">
                <span className="shrink-0 opacity-50">
                  [{SIGNAL_STATUS_LABEL[signal.status] ?? signal.status}]
                </span>
                <span className="opacity-80">{signal.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {result.redirectChain.length > 0 && (
          <div>
            <h4 className="font-bold">거쳐 간 주소</h4>
            <ol className="mt-2 flex flex-col gap-1.5">
              {result.redirectChain.map((hop, index) => (
                <li key={hop.url} className="flex gap-2 font-mono text-xs">
                  <span className="shrink-0 opacity-50">
                    {index + 1}. [{hop.status}]
                  </span>
                  {/* 링크로 만들지 않는다 — CLAUDE.md 10 */}
                  <span className="break-all opacity-80">
                    {maskDomain(hostnameOf(hop.url))}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {result.domainAge && (
          <div>
            <h4 className="font-bold">사이트가 만들어진 날</h4>
            <p className="mt-1 opacity-80">
              {result.domainAge.registeredAt?.slice(0, 10) ?? "확인 못 함"}
              {result.domainAge.ageDays !== null &&
                ` (${result.domainAge.ageDays}일 전)`}
              {result.domainAge.registrar && ` · ${result.domainAge.registrar}`}
            </p>
          </div>
        )}

        <p className="opacity-50">
          설명 생성: {result.explanation.source === "llm" ? "AI" : "기본 문구"} ·
          검사에 걸린 시간 {result.elapsedMs}ms
        </p>
      </div>
    </details>
  );
}
