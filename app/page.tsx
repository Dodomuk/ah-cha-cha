/**
 * 홈 — Sprint 2에서 실제 검사 화면(prd.md 6.2 ①)으로 교체된다.
 * 지금은 엔진만 동작하는 상태이므로 자리표시자만 둔다.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">아차차</h1>
      <p className="text-lg text-balance opacity-80">
        누르기 전에, 차차한테 먼저 물어보세요
      </p>
      <p className="text-sm opacity-60">
        검사 화면을 준비하고 있어요. 엔진은 <code>POST /api/scan</code> 으로
        먼저 확인할 수 있어요.
      </p>
    </main>
  );
}
