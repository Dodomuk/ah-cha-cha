# 아차차 (ahchacha.com) — 프로젝트 규칙

악성 웹/앱 판별 서비스. **처음 보는 링크를 대신 열어보고 판정한다.**
사용자 신고는 보조 — 판정에 반영하지 않고, 미탐을 찾는 데 쓴다 (prd.md 0.1절).
전체 요구사항은 [prd.md](prd.md) 참조.

---

## 🚨 협상 불가 규칙 (보안)

이 서비스는 "악성 URL을 일부러 접속하는 서비스"이므로 **스스로가 공격 표면**이다.

1. **의심 URL은 절대 클라이언트에서 fetch하지 않는다.** 모든 접속은 서버사이드.
2. **외부 URL 접속은 `lib/scanner/` 아래 서버 코드에서만** 한다.
3. **의심 URL로 나가는 모든 요청은 `lib/scanner/guard.ts`의 가드를 통과시킨다.**
   - `safeFetch()` 외의 경로로 대상 URL에 접속하는 코드를 추가하지 말 것
   - 리디렉션 체인의 **매 홉마다** 목적지 IP를 재검증 (DNS rebinding 대비)
   - `redirect: "manual"` 고정. 런타임 자동 리디렉션 추적 금지
4. **스캐너 코드는 Node 런타임 전용.** Edge 런타임(`export const runtime = "edge"`)으로 옮기지 말 것 — `dns`/undici dispatcher가 없어 가드가 무력화된다.
5. 스캔 워커(Phase 3)는 **DB 쓰기 권한·자격증명을 갖지 않는다.** 결과는 큐로 반환.
6. 캐시 TTL은 **6시간을 넘기지 않는다.** 피싱 사이트는 클로킹을 하므로 오래된 clean 결과가 더 위험하다.

---

## 🚨 협상 불가 규칙 (제품·법무)

7. **사용자 노출 문구에 "안전합니다" 류의 단정 표현을 쓰지 않는다.**
   - ❌ "안전한 사이트입니다"
   - ✅ "지금 확인한 범위에서는 위험 신호가 없었어요"
   - clean 결과에는 항상 검사 시각과 "새 위험 사이트는 계속 생겨요" 고지를 병기
8. **판정(verdict)과 사용자 신고(report_count)를 UI에서 섞어 표시하지 않는다.**
   - 판정 = 엔진 결과(객관적 근거)
   - 신고 = "사용자 신고 N건"이라는 *사실*의 표시. 자동 판정에 반영하지 않는다
9. **위험 판정 화면에서는 마스코트(차차)를 축소/제거한다.** 귀여움은 진입장벽을 낮추는 장치이지 경고를 부드럽게 만드는 장치가 아니다.
10. **검사 대상 URL을 클릭 가능한 링크로 렌더링하지 않는다.** 피드·결과·공유카드 전부 해당. 도메인은 부분 마스킹.
11. **오탐(false positive)이 미탐보다 비싸다.** 재현율보다 정밀도 우선. 근거 없는 위험 판정 금지.

---

## 판정 체계

```
🚨 danger      : S1~S3 히트 또는 S8 히트 또는 S7 고신뢰 매칭 또는 S11 정황 보강
⚠️ caution     : S4(30일 미만) + 다른 시그널 1개 이상
🤔 unknown     : 응답 없음 / 접속 불가 / 시그널 부족
✅ no_signal   : 확인된 위험 신호 없음  ← "안전"이 아니다
```

verdict 값은 위 4개 문자열로 고정. `safe`라는 값을 쓰지 말 것.

---

## 디렉토리 구조

```
app/
  api/scan/route.ts     검사 API (Node 런타임)
  page.tsx              홈
lib/
  scanner/
    guard.ts            🔒 SSRF 가드 + safeFetch — 가장 먼저 읽을 것
    redirect.ts         리디렉션 체인 추적 (S5, S8)
    rdap.ts             도메인 등록 나이 (S4)
    safebrowsing.ts     Google Safe Browsing (S1)
    feeds.ts            피싱·멀웨어 피드 동기화·대조 (S2, S3)
    impersonation.ts    주소 기반 브랜드 사칭 (S7)
    content.ts          본문 기반 자격증명 수집 페이지 (S11)
    brands.ts           정식 브랜드 도메인 화이트리스트 (S7, S11)
    hosting.ts          무료·즉시 발급 호스팅 목록 (S11 보조)
    reports.ts          사용자 신고 건수 조회 (S9, 표시 전용)
    verdict.ts          시그널 → 4단계 판정
    normalize.ts        URL 정규화 + url_hash
    types.ts            공용 타입
  ratelimit.ts          IP 기준 rate limit
bench/                  교차검증 하네스 — bench/README.md 참조
worker/                 (Phase 3) 격리 스캔 워커 — 스크린샷 전담
```

## 코드 규칙

- 사용자 노출 문구는 한국어. 코드 식별자·주석 설명은 영어 혼용 허용
- 시그널 추가 시 `lib/scanner/types.ts`의 `SignalId`에 등록하고 `verdict.ts`의 가중치 테이블을 함께 수정
- 외부 API 키가 없으면 해당 시그널은 `status: "unavailable"`로 반환. **키 없음을 clean으로 처리하지 말 것**
- LLM(설명 레이어)은 부가 레이어다. 실패해도 판정은 나와야 하므로 템플릿 폴백을 항상 유지

## 커밋 규칙

- **커밋/푸시는 사용자의 명시적 요청이 있을 때만.** 작업 완료 후 보고하고 대기
- `.env` 절대 커밋 금지. 시크릿은 환경변수로만

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
