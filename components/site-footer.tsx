import Link from "next/link";

import { SITE } from "@/lib/site";

/**
 * 전역 푸터.
 *
 * 🚨 이의제기 경로는 **상시 노출**이어야 한다 (prd.md 5절).
 *    남의 사이트를 "위험"이라고 표시하는 서비스에서, 잘못 표시된 운영자가
 *    항의할 곳을 찾지 못하면 그건 곧 분쟁이 된다. 이 링크를 접거나 숨기지 말 것.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl px-5 pb-8 text-sm">
      <div className="flex flex-col gap-3 border-t border-current/10 pt-5">
        <p className="opacity-60">
          검사 결과는 참고 정보이며 법적 판단이 아닙니다. 위험 신호가 없다는 것이
          안전을 보증하지는 않습니다.
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 opacity-60">
          <Link href="/terms" className="hover:opacity-100">
            이용약관
          </Link>
          <Link href="/privacy" className="hover:opacity-100">
            개인정보처리방침
          </Link>
          <Link href="/appeal" className="font-medium hover:opacity-100">
            내 사이트가 잘못 표시됐어요
          </Link>
        </nav>
        <p className="opacity-40">
          {SITE.name} · {SITE.domain}
        </p>
      </div>
    </footer>
  );
}
