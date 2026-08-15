"use client";

import { useEffect, useState } from "react";

import { Mascot } from "./mascot";

/**
 * 검사 중 화면 (prd.md 6.2 ②).
 *
 * 진행 단계는 **연출이다.** 실제 엔진 진행률과 무관하게 시간에 따라 순환한다.
 * API가 단일 JSON 응답이라 실제 진행 상황을 흘려보낼 수 없기 때문이고,
 * 이건 Sprint 2 착수 시 확정한 선택이다 (prd.md 8절).
 * 나중에 스트리밍으로 바꾼다면 이 컴포넌트가 교체 지점이다.
 */
const STEPS = [
  "주소를 따라가 보는 중…",
  "이 사이트가 언제 만들어졌는지 확인 중…",
  "위험 목록과 대조하는 중…",
  "차차가 정리하고 있어요…",
];

const STEP_INTERVAL_MS = 1_100;
/** 이 시간을 넘기면 안내 문구를 덧붙인다 (prd.md 6.2 ②) */
const SLOW_AFTER_MS = 8_000;

export function ScanningView() {
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    // 마지막 단계에서 멈춘다. 계속 돌리면 끝나지 않는 것처럼 보인다
    const ticker = setInterval(() => {
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);
    const slowTimer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);

    return () => {
      clearInterval(ticker);
      clearTimeout(slowTimer);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="animate-bounce">
        <Mascot pose="excited" size={130} />
      </div>

      <div aria-live="polite" className="min-h-12">
        <p className="text-lg font-medium">{STEPS[step]}</p>
        {slow && (
          <p className="mt-2 text-sm opacity-60">
            시간이 걸리네요. 조금만 더 기다려 주세요.
          </p>
        )}
      </div>

      <div
        className="h-1.5 w-48 overflow-hidden rounded-full bg-current/10"
        role="progressbar"
        aria-label="검사 진행 중"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-700 ease-out"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
    </div>
  );
}
