"use client";

import { useCallback, useRef, useState } from "react";

import type { ScanError, ScanResponse } from "@/lib/scanner/types";

import { Mascot } from "./mascot";
import { ResultView } from "./result-view";
import { ScanningView } from "./scanning-view";

type Phase =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "result"; result: ScanResponse }
  | { status: "error"; message: string };

export function ScanExperience() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const runScan = useCallback(
    async (target: string, refresh = false) => {
      const trimmed = target.trim();
      if (!trimmed) return;

      setPhase({ status: "scanning" });
      try {
        // 🚨 의심 URL을 여기서 직접 fetch하지 않는다. 우리 서버에만 보낸다
        //    (CLAUDE.md 1). 대상 사이트 접속은 전부 서버가 한다.
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: trimmed, refresh }),
        });
        const data = (await response.json()) as ScanResponse | ScanError;

        if (!response.ok || "error" in data) {
          setPhase({
            status: "error",
            message:
              "message" in data
                ? data.message
                : "검사 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.",
          });
          return;
        }
        setPhase({ status: "result", result: data });
      } catch {
        setPhase({
          status: "error",
          message: "인터넷 연결을 확인하고 다시 시도해 주세요.",
        });
      }
    },
    [],
  );

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      if (phase.status === "scanning") return;
      void runScan(url);
    },
    [url, phase.status, runScan],
  );

  const reset = useCallback(() => {
    setUrl("");
    setPhase({ status: "idle" });
    inputRef.current?.focus();
  }, []);

  /**
   * 붙여넣기 칩. 브라우저는 사용자 동작 없이 클립보드를 읽지 못하므로
   * 자동 감지가 아니라 버튼으로 둔다. (앱에서는 Capacitor로 자동 감지 — Sprint 4)
   */
  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
        inputRef.current?.focus();
      }
    } catch {
      // 권한 거부·미지원. 직접 붙여넣으면 되므로 조용히 넘어간다
    }
  }, []);

  if (phase.status === "scanning") return <ScanningView />;

  if (phase.status === "result") {
    return (
      <ResultView
        result={phase.result}
        onReset={reset}
        onRefresh={() => void runScan(phase.result.normalizedUrl, true)}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Mascot pose="greet" size={150} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">아차차</h1>
        <p className="mt-1 text-lg text-balance opacity-80">
          누르기 전에, 차차한테 먼저 물어보세요
        </p>
      </div>

      {/* 시선을 분산시키지 않도록 입력창 하나만 둔다 (prd.md 6.2 ①) */}
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="의심스러운 링크를 붙여넣어 주세요"
          aria-label="검사할 링크"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="url"
          className="w-full rounded-xl border-2 border-current/15 bg-transparent px-4 py-3.5 text-base outline-none focus:border-brand"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="rounded-full border border-current/20 px-3 py-1.5 text-sm transition hover:bg-current/5"
          >
            붙여넣기
          </button>
          <button
            type="submit"
            disabled={!url.trim()}
            className="ml-auto rounded-xl bg-brand px-6 py-3 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            검사하기
          </button>
        </div>
      </form>

      {phase.status === "error" && (
        <p
          role="alert"
          className="w-full rounded-xl bg-verdict-danger/10 px-4 py-3 text-left text-[15px] text-verdict-danger"
        >
          {phase.message}
        </p>
      )}

      <p className="text-sm opacity-50">
        검사 결과는 참고 정보예요. 새 위험 사이트는 계속 생기기 때문에 검사 시점
        기준으로만 알려드려요.
      </p>
    </div>
  );
}
