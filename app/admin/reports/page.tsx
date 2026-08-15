import { db } from "@/lib/db";
import { maskDomain } from "@/lib/display";

export const dynamic = "force-dynamic";

export const metadata = { title: "신고 검토", robots: { index: false, follow: false } };

const CATEGORY_LABEL: Record<string, string> = {
  phishing: "피싱/가짜사이트",
  malware_app: "악성앱 설치 유도",
  scam_shop: "사기 쇼핑몰",
  gambling: "도박/불법",
  spam: "스팸",
  false_positive: "오탐 신고",
};

interface ReportRow {
  id: string;
  category: string;
  description: string | null;
  created_at: string;
  review_status: string;
  domains: { domain: string; report_count: number; current_verdict: string | null } | null;
}

/**
 * 신고 검토 큐 (prd.md 5절).
 *
 * 🚨 신고가 쌓였다고 자동으로 위험 표시를 올리지 않는다. 이 화면에서 사람이
 *    확인한 뒤에만 반영한다. 실존 사업자를 신고 몇 건으로 "사기"라고 표시했다가
 *    오탐이면 그건 명예훼손 분쟁이다.
 */
export default async function AdminReportsPage() {
  const store = db();
  if (!store) {
    return <Shell title="신고 검토">데이터베이스가 설정되지 않았습니다.</Shell>;
  }

  const { data, error } = await store
    .from("reports")
    .select(
      "id,category,description,created_at,review_status,domains(domain,report_count,current_verdict)",
    )
    .eq("review_status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return <Shell title="신고 검토">불러오지 못했습니다: {error.message}</Shell>;
  }

  const reports = (data ?? []) as unknown as ReportRow[];

  return (
    <Shell title="신고 검토">
      <p className="text-sm opacity-60">
        검토 대기 {reports.length}건. 신고는 여기서 확인하기 전까지 사용자 화면의
        판정에 영향을 주지 않습니다.
      </p>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-current/15 px-4 py-8 text-center opacity-60">
          대기 중인 신고가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((report) => (
            <li
              key={report.id}
              className="flex flex-col gap-2 rounded-xl border border-current/15 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-current/10 px-2 py-0.5 font-mono text-xs">
                  {CATEGORY_LABEL[report.category] ?? report.category}
                </span>
                {report.category === "false_positive" && (
                  <span className="rounded-md bg-verdict-caution/20 px-2 py-0.5 text-xs">
                    신고 수에 포함 안 됨
                  </span>
                )}
                <span className="ml-auto text-xs opacity-50">
                  {new Date(report.created_at).toLocaleString("ko-KR")}
                </span>
              </div>

              {/* 관리자도 원본 주소를 클릭하면 안 된다. 실제 악성 사이트다 */}
              <p className="font-mono text-sm break-all">
                {report.domains ? maskDomain(report.domains.domain) : "(도메인 없음)"}
                <span className="ml-2 opacity-50">
                  누적 {report.domains?.report_count ?? 0}건
                  {report.domains?.current_verdict &&
                    ` · 현재 판정 ${report.domains.current_verdict}`}
                </span>
              </p>

              {report.description && (
                <p className="rounded-lg bg-current/5 px-3 py-2 text-[15px] opacity-80">
                  {report.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-xl border border-current/15 px-4 py-3 text-sm opacity-60">
        처리(승인·기각) 기능은 아직 없습니다. 지금은 Supabase 대시보드에서{" "}
        <code className="font-mono">reports.review_status</code>를 직접 바꾸세요.
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-10">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </main>
  );
}
