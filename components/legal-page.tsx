import Link from "next/link";

import { SITE } from "@/lib/site";

/**
 * 이용약관·개인정보처리방침·이의제기가 공유하는 문서 껍데기.
 * 본문 폭을 읽기 좋은 길이로 묶고, 어느 문서에서든 다른 문서로 넘어갈 수 있게 한다.
 */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  /** 문서 맨 앞에 오는 한 문단 요약. 전문을 안 읽는 사람이 대부분이다 */
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <nav className="mb-8 text-sm">
        <Link href="/" className="opacity-60 hover:opacity-100">
          ← {SITE.name}
        </Link>
      </nav>

      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="rounded-xl bg-current/5 px-4 py-3 text-[15px] leading-relaxed opacity-80">
            {summary}
          </p>
          <p className="text-sm opacity-50">
            최종 개정 {SITE.policyUpdatedAt}
          </p>
        </header>

        <div className="legal flex flex-col gap-6">{children}</div>
      </article>

      <LegalFooterNav />
    </main>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{heading}</h2>
      <div className="flex flex-col gap-2 text-[15px] leading-relaxed opacity-85">
        {children}
      </div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-1.5 pl-1">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function LegalFooterNav() {
  return (
    <nav className="mt-12 flex flex-wrap gap-x-4 gap-y-2 border-t border-current/10 pt-5 text-sm opacity-60">
      <Link href="/terms" className="hover:opacity-100">
        이용약관
      </Link>
      <Link href="/privacy" className="hover:opacity-100">
        개인정보처리방침
      </Link>
      <Link href="/appeal" className="hover:opacity-100">
        이의제기·삭제 요청
      </Link>
      <a href={`mailto:${SITE.contactEmail}`} className="ml-auto hover:opacity-100">
        {SITE.contactEmail}
      </a>
    </nav>
  );
}
