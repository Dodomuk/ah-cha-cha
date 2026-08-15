"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

const CATEGORIES = [
  { value: "phishing", label: "피싱 / 가짜 사이트" },
  { value: "malware_app", label: "악성앱 설치 유도" },
  { value: "scam_shop", label: "사기 쇼핑몰" },
  { value: "gambling", label: "도박 / 불법" },
  { value: "spam", label: "스팸" },
  { value: "false_positive", label: "오탐 (안전한데 위험으로 나왔어요)" },
] as const;

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "flexible" | "compact";
        },
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

/**
 * 신고 폼 (prd.md 6.2 ⑤).
 *
 * 로그인이 없으므로 Turnstile로 자동 프로그램을 거른다. 위젯은 대부분의 경우
 * 사용자에게 아무것도 요구하지 않는다.
 */
export function ReportForm({
  urlHash,
  onDone,
}: {
  urlHash: string;
  onDone: () => void;
}) {
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const renderWidget = useCallback(() => {
    if (renderedRef.current || !widgetRef.current || !window.turnstile || !siteKey) {
      return;
    }
    renderedRef.current = true;
    window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      callback: setToken,
      "error-callback": () => setToken(null),
      theme: "auto",
      size: "flexible",
    });
  }, [siteKey]);

  useEffect(() => {
    // 스크립트가 이미 로드된 상태로 폼이 열릴 수 있다
    renderWidget();
  }, [renderWidget]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!category || state === "sending") return;

      setState("sending");
      try {
        const response = await fetch("/api/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            urlHash,
            category,
            description: description.trim() || undefined,
            turnstileToken: token ?? undefined,
          }),
        });
        const data = (await response.json()) as { message?: string };
        setMessage(data.message ?? "신고를 접수했어요.");
        setState(response.ok ? "done" : "error");
        if (!response.ok) {
          window.turnstile?.reset();
          setToken(null);
        }
      } catch {
        setMessage("연결에 실패했어요. 잠시 뒤 다시 시도해 주세요.");
        setState("error");
      }
    },
    [category, description, state, token, urlHash],
  );

  if (state === "done") {
    return (
      <div className="rounded-xl border border-verdict-clear/40 bg-verdict-clear/5 px-4 py-4 text-[15px]">
        <p>{message}</p>
        <button
          type="button"
          onClick={onDone}
          className="mt-3 text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="lazyOnload"
        onLoad={renderWidget}
      />
      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-xl border border-current/15 px-4 py-4"
      >
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold">어떤 점이 문제인가요?</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                aria-pressed={category === item.value}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  category === item.value
                    ? "border-brand bg-brand text-white"
                    : "border-current/20 hover:bg-current/5"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm opacity-70">
            더 알려주실 내용이 있나요? (선택)
          </span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value.slice(0, 200))}
            rows={3}
            placeholder="예: 문자로 택배 배송 조회라며 받았어요"
            className="resize-none rounded-lg border border-current/15 bg-transparent px-3 py-2 text-[15px] outline-none focus:border-brand"
          />
          <span className="self-end text-xs opacity-40">
            {description.length}/200
          </span>
        </label>

        <div ref={widgetRef} />

        {state === "error" && (
          <p role="alert" className="text-sm text-verdict-danger">
            {message}
          </p>
        )}

        <p className="text-xs opacity-50">
          신고는 판정을 바로 바꾸지 않아요. 차차가 확인한 뒤에 반영됩니다.
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!category || state === "sending"}
            className="rounded-xl bg-brand px-5 py-2.5 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state === "sending" ? "보내는 중…" : "신고하기"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-current/20 px-4 py-2.5 transition hover:bg-current/5"
          >
            취소
          </button>
        </div>
      </form>
    </>
  );
}
