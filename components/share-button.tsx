"use client";

import { useCallback, useState } from "react";

/**
 * 공유 버튼 (prd.md 6.3).
 *
 * 모바일에서는 시스템 공유 시트를 띄워 카톡·문자로 바로 넘긴다.
 * 데스크톱에는 공유 시트가 없으므로 링크를 복사한다.
 */
export function ShareButton({ urlHash }: { urlHash: string }) {
  const [state, setState] = useState<"idle" | "working" | "copied" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const share = useCallback(async () => {
    if (state === "working") return;
    setState("working");

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ urlHash }),
      });
      const data = (await response.json()) as { url?: string; message?: string };

      if (!response.ok || !data.url) {
        setMessage(data.message ?? "공유 링크를 만들지 못했어요.");
        setState("error");
        return;
      }

      // navigator.share는 사용자 동작 안에서 호출해야 한다. fetch를 await한 뒤라
      // 일부 브라우저가 거부할 수 있으므로 실패하면 복사로 넘어간다
      if (navigator.share) {
        try {
          await navigator.share({
            title: "아차차 검사 결과",
            text: "이 링크 검사해봤어요",
            url: data.url,
          });
          setState("idle");
          return;
        } catch {
          /* 사용자가 취소했거나 브라우저가 거부. 복사로 대체 */
        }
      }

      await navigator.clipboard.writeText(data.url);
      setMessage("링크를 복사했어요. 붙여넣기로 보내주세요.");
      setState("copied");
    } catch {
      setMessage("공유에 실패했어요. 잠시 뒤 다시 시도해 주세요.");
      setState("error");
    }
  }, [state, urlHash]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={share}
        disabled={state === "working"}
        className="self-start rounded-full border border-current/20 px-5 py-2 font-medium transition hover:bg-current/5 disabled:opacity-50"
      >
        {state === "working" ? "만드는 중…" : "결과 공유하기"}
      </button>
      {(state === "copied" || state === "error") && (
        <p
          role="status"
          className={`text-sm ${state === "error" ? "text-verdict-danger" : "opacity-70"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
