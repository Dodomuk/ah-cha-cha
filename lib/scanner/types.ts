/**
 * 스캔 엔진 공용 타입.
 *
 * 시그널을 추가할 때는 SignalId에 등록하고 verdict.ts의 가중치 테이블도 함께 수정할 것.
 */

/** 판정 4단계. "safe"라는 값은 존재하지 않는다 — CLAUDE.md 규칙 7 참조. */
export type Verdict = "danger" | "caution" | "unknown" | "no_signal";

/** prd.md 3.1 시그널 소스 표와 1:1 대응 */
export type SignalId =
  | "S1" // 알려진 악성 URL (Google Safe Browsing)
  | "S2" // 피싱 피드 대조 (OpenPhish / PhishTank)
  | "S3" // 멀웨어 배포 도메인 (URLhaus)
  | "S4" // 도메인 등록 나이 (RDAP)
  | "S5" // 리디렉션 체인
  | "S6" // TLS 인증서
  | "S7" // 브랜드 유사 도메인
  | "S8" // APK 직접 다운로드 유도
  | "S9" // 사용자 신고 누적 — 표시 전용, 판정 미반영
  | "S10" // 다중 백신 스캔 (VirusTotal)
  | "S11"; // 자격증명 수집 페이지 (본문 검사)

/**
 * hit         위험 신호가 확인됨
 * clear       확인했고 위험 신호가 없음
 * unavailable 확인하지 못함 (API 키 없음/미구현). clear로 간주하지 말 것
 * error       확인 시도가 실패함
 */
export type SignalStatus = "hit" | "clear" | "unavailable" | "error";

export interface Signal {
  id: SignalId;
  /** 내부 로그·상세 리포트용 영문 라벨 */
  name: string;
  status: SignalStatus;
  /** hit일 때만 의미 있음. 판정 가중치 결정에 사용 */
  severity?: "critical" | "high" | "medium" | "low";
  /** 상세 리포트(④)에 노출되는 한국어 한 줄 설명 */
  detail?: string;
  /** 상세 리포트 원문 영역용. 사용자 노출 문구로 바로 쓰지 말 것 */
  raw?: unknown;
}

export interface RedirectHop {
  url: string;
  /** 이 홉에 실제로 연결한 IP. SSRF 가드가 검증한 주소 */
  ip: string;
  status: number;
  /** 다음 홉 URL (마지막 홉이면 null) */
  location: string | null;
  contentType: string | null;
  elapsedMs: number;
}

export interface RedirectResult {
  hops: RedirectHop[];
  finalUrl: string;
  finalStatus: number | null;
  finalContentType: string | null;
  /** Content-Disposition 등에서 추출한 파일명 */
  finalFilename: string | null;
  /** 10홉 초과로 추적을 중단했는지 */
  truncated: boolean;
  /** 추적이 실패한 경우 사유 (접속 불가, 가드 차단 등) */
  error: string | null;
}

export interface DomainAge {
  domain: string;
  registeredAt: string | null;
  ageDays: number | null;
  registrar: string | null;
  source: "rdap" | "none";
}

/**
 * 사용자에게 보이는 설명. 템플릿과 LLM이 같은 모양을 만든다.
 * 클라이언트도 쓰는 타입이라 여기(node 의존 없는 파일)에 둔다.
 */
export interface Explanation {
  headline: string;
  /** 2~4개, 각 1문장 */
  reasons: string[];
  /** 사용자가 지금 할 일 1문장 */
  action: string;
  source: "template" | "llm";
}

export interface ScanResult {
  urlHash: string;
  normalizedUrl: string;
  finalUrl: string;
  verdict: Verdict;
  signals: Signal[];
  redirectChain: RedirectHop[];
  domainAge: DomainAge | null;
  scannedAt: string;
  /** 캐시 만료 시각. 클로킹 대비 6시간 초과 금지 — CLAUDE.md 규칙 6 */
  expiresAt: string;
  elapsedMs: number;
}

/** `POST /api/scan` 성공 응답 */
export interface ScanResponse extends ScanResult {
  explanation: Explanation;
  /**
   * 저장해둔 결과를 그대로 돌려준 것인가.
   * 화면에서 이 사실을 알려야 한다 — 6시간 전 결과를 방금 확인한 것처럼
   * 보여주면 그 사이 위험해진 사이트를 안전하다고 말하는 셈이 된다.
   */
  fromCache?: boolean;
}

/** `POST /api/scan` 실패 응답 */
export interface ScanError {
  error: string;
  message: string;
}
