/**
 * SSRF 가드 — 이 파일이 서비스 전체의 보안 경계다.
 *
 * 의심 URL로 나가는 모든 요청은 반드시 safeFetch()를 통과해야 한다.
 * 다른 경로로 대상 URL에 접속하는 코드를 추가하지 말 것 (CLAUDE.md 규칙 3).
 *
 * 방어 대상:
 *  - 사설/예약 IP 대역 접근 (클라우드 메타데이터 169.254.169.254 포함)
 *  - DNS rebinding: 검증한 IP를 그대로 커넥션에 고정(pin)해서 연결한다
 *  - 자동 리디렉션 추적: redirect="manual" 고정. 매 홉을 호출자가 다시 검증
 *  - 무한 응답: 본문 크기 상한
 *  - 느린 응답: 헤더/본문/전체 타임아웃
 *
 * Node 런타임 전용. Edge 런타임에서는 dns/undici가 없어 가드가 무력화된다.
 */

import { constants as cryptoConstants } from "node:crypto";
import { BlockList, isIP } from "node:net";
import { lookup as dnsLookupCb } from "node:dns";
import { promisify } from "node:util";
import { Agent, request as undiciRequest } from "undici";

const dnsLookup = promisify(dnsLookupCb) as (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Array<{ address: string; family: number }>>;

/* ------------------------------------------------------------------ */
/* 차단 대역                                                            */
/* ------------------------------------------------------------------ */

const blocked = new BlockList();

// IPv4 — RFC 1918 사설, 루프백, 링크로컬(클라우드 메타데이터), CGNAT, 예약/문서용
blocked.addSubnet("0.0.0.0", 8, "ipv4"); // "this network"
blocked.addSubnet("10.0.0.0", 8, "ipv4"); // 사설
blocked.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT
blocked.addSubnet("127.0.0.0", 8, "ipv4"); // 루프백
blocked.addSubnet("169.254.0.0", 16, "ipv4"); // 링크로컬 — 169.254.169.254 메타데이터
blocked.addSubnet("172.16.0.0", 12, "ipv4"); // 사설
blocked.addSubnet("192.0.0.0", 24, "ipv4"); // IETF 프로토콜 할당
blocked.addSubnet("192.0.2.0", 24, "ipv4"); // TEST-NET-1
blocked.addSubnet("192.88.99.0", 24, "ipv4"); // 6to4 릴레이 (폐기)
blocked.addSubnet("192.168.0.0", 16, "ipv4"); // 사설
blocked.addSubnet("198.18.0.0", 15, "ipv4"); // 벤치마크
blocked.addSubnet("198.51.100.0", 24, "ipv4"); // TEST-NET-2
blocked.addSubnet("203.0.113.0", 24, "ipv4"); // TEST-NET-3
blocked.addSubnet("224.0.0.0", 4, "ipv4"); // 멀티캐스트
blocked.addSubnet("240.0.0.0", 4, "ipv4"); // 예약 + 255.255.255.255

// IPv6
blocked.addAddress("::", "ipv6"); // 미지정
blocked.addAddress("::1", "ipv6"); // 루프백
blocked.addSubnet("100::", 64, "ipv6"); // discard-only
blocked.addSubnet("2001:db8::", 32, "ipv6"); // 문서용
blocked.addSubnet("fc00::", 7, "ipv6"); // ULA (사설)
blocked.addSubnet("fe80::", 10, "ipv6"); // 링크로컬
blocked.addSubnet("ff00::", 8, "ipv6"); // 멀티캐스트

/**
 * IPv6에 감싸인 IPv4를 꺼낸다.
 * BlockList는 ::ffff:10.0.0.1 을 ipv6로만 판정해서 ipv4 규칙에 걸리지 않으므로
 * 검사 전에 반드시 벗겨내야 한다.
 */
function unwrapIpv4(address: string): string {
  const lower = address.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64 (64:ff9b::a.b.c.d)
  const embedded = lower.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (embedded && (lower.startsWith("::") || lower.startsWith("64:ff9b:"))) {
    return embedded[1];
  }
  // 16진 표기 IPv4-mapped: ::ffff:0a00:0001
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return address;
}

/** 이 IP로 나가면 안 되는가? 판단 불가능한 입력도 차단으로 처리한다. */
export function isBlockedIp(address: string): boolean {
  const addr = unwrapIpv4(address);
  const version = isIP(addr);
  if (version === 4) return blocked.check(addr, "ipv4");
  if (version === 6) return blocked.check(addr, "ipv6");
  return true; // 파싱 불가 → 차단
}

/* ------------------------------------------------------------------ */
/* URL 검증                                                            */
/* ------------------------------------------------------------------ */

export class GuardError extends Error {
  constructor(
    message: string,
    /** 사용자에게 노출해도 되는 한국어 사유 */
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

/**
 * 스킴·형식 수준의 1차 검증.
 * DNS 해석 전에 걸러낼 수 있는 것만 여기서 처리한다.
 */
export function assertScannableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuardError(`invalid url: ${raw}`, "주소 형식을 알아보지 못했어요.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GuardError(
      `unsupported protocol: ${url.protocol}`,
      "http 또는 https 주소만 검사할 수 있어요.",
    );
  }
  // user:pass@host 형태는 호스트 오인을 유발하므로 거부
  if (url.username || url.password) {
    throw new GuardError(
      "url contains credentials",
      "주소에 아이디·비밀번호가 섞여 있어요. 그 부분을 빼고 다시 넣어주세요.",
    );
  }
  if (!url.hostname) {
    throw new GuardError("empty hostname", "주소에 사이트 이름이 없어요.");
  }
  return url;
}

export interface ResolvedHost {
  hostname: string;
  /** 실제로 연결할, 검증을 통과한 IP */
  address: string;
  family: 4 | 6;
}

/**
 * 호스트명을 해석하고 모든 결과 IP를 검증한다.
 *
 * 하나라도 차단 대역이면 전체를 거부한다 — 일부만 공인 IP인 응답은
 * rebinding 공격의 전형적인 형태이므로 보수적으로 막는다.
 */
export async function resolveAndVerify(hostname: string): Promise<ResolvedHost> {
  const literal = isIP(hostname);
  if (literal) {
    if (isBlockedIp(hostname)) {
      throw new GuardError(
        `blocked ip literal: ${hostname}`,
        "내부망 주소는 검사할 수 없어요.",
      );
    }
    return { hostname, address: hostname, family: literal === 4 ? 4 : 6 };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new GuardError(
      `dns lookup failed: ${hostname}`,
      "이 주소를 찾을 수 없어요. 사이트가 이미 사라졌을 수도 있어요.",
    );
  }

  if (records.length === 0) {
    throw new GuardError(
      `dns lookup empty: ${hostname}`,
      "이 주소를 찾을 수 없어요.",
    );
  }
  for (const record of records) {
    if (isBlockedIp(record.address)) {
      throw new GuardError(
        `blocked address ${record.address} for ${hostname}`,
        "내부망을 가리키는 주소예요. 검사하지 않았어요.",
      );
    }
  }

  const chosen = records[0];
  return {
    hostname,
    address: chosen.address,
    family: chosen.family === 4 ? 4 : 6,
  };
}

/* ------------------------------------------------------------------ */
/* 가드된 fetch                                                        */
/* ------------------------------------------------------------------ */

/** 브라우저처럼 보이되 정체를 숨기지 않는다. 클로킹 회피 목적이 아님 */
const USER_AGENT =
  "Mozilla/5.0 (compatible; AhchachaBot/0.1; +https://ahchacha.com/bot)";

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 512 * 1024;

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  /** 본문을 읽을지. 헤더만 필요하면 false로 두어 대역폭·위험을 줄인다 */
  readBody?: boolean;
  maxBodyBytes?: number;
  /** `name=value; name2=value2` 형태. 호출부가 스코프를 책임진다 */
  cookie?: string;
}

export interface SafeFetchResult {
  url: string;
  /** 실제로 연결한 IP */
  ip: string;
  status: number;
  headers: Record<string, string>;
  /**
   * Set-Cookie 원본. headers에 합쳐 넣으면 Expires의 쉼표와 구분되지 않아
   * 파싱이 깨지므로 배열 그대로 따로 보관한다.
   */
  setCookie: string[];
  /** readBody가 true일 때만. 상한까지만 읽는다 */
  body: string | null;
  bodyTruncated: boolean;
  elapsedMs: number;
}

/**
 * 검증된 IP에 고정(pin)해서 한 번만 요청한다. 리디렉션은 따라가지 않는다.
 *
 * DNS를 여기서 다시 조회하지 않는 것이 핵심이다. undici의 커넥션 lookup을
 * 이미 검증한 주소로 덮어써서, 검증 시점과 연결 시점 사이에 DNS 응답이
 * 바뀌어도(rebinding) 다른 곳으로 나가지 않는다.
 */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const {
    method = "GET",
    timeoutMs = DEFAULT_TIMEOUT_MS,
    readBody = false,
    maxBodyBytes = MAX_BODY_BYTES,
    cookie,
  } = options;

  const url = assertScannableUrl(rawUrl);
  const resolved = await resolveAndVerify(url.hostname);

  // 검증된 주소만 반환하는 lookup. undici가 커넥션을 맺을 때 이 값을 쓴다.
  const pinnedLookup = (
    _hostname: string,
    lookupOptions: { all?: boolean },
    callback: (
      err: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => {
    if (lookupOptions?.all) {
      callback(null, [{ address: resolved.address, family: resolved.family }]);
    } else {
      callback(null, resolved.address, resolved.family);
    }
  };

  const agent = new Agent({
    connect: {
      lookup: pinnedLookup,
      // SNI/인증서 검증은 원래 호스트명 기준으로 유지된다.
      // 인증서가 유효하지 않아도 스캔은 계속해야 하므로(그 자체가 시그널)
      // 검증 실패를 오류로 만들지 않는다.
      rejectUnauthorized: false,
      // 구형 TLS 스택을 쓰는 서버와도 연결한다. OpenSSL 3가 기본 차단하는
      // legacy renegotiation을 허용하지 않으면 국내 금융·공공 사이트 상당수가
      // "응답 없음"으로 빠진다(현대카드 등 실측 확인).
      // 스캐너는 대상 사이트를 애초에 신뢰하지 않고 비밀도 보내지 않으므로
      // 이 완화가 우리 쪽 자산을 노출시키지는 않는다.
      secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT,
      timeout: timeoutMs,
    },
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    // 매 요청 새 커넥션. 커넥션 재사용으로 검증을 건너뛰는 일이 없도록
    pipelining: 0,
  });

  const startedAt = Date.now();
  const abort = AbortSignal.timeout(timeoutMs);

  try {
    const response = await undiciRequest(url.toString(), {
      method,
      dispatcher: agent,
      // undici는 리디렉션 인터셉터를 붙이지 않는 한 3xx를 그대로 돌려준다.
      // 이 Agent에는 붙이지 않는다 — 매 홉을 호출자가 가드에 다시 통과시켜야 하므로
      // 자동 추적을 켜면 중간 홉의 IP 검증이 통째로 우회된다.
      signal: abort,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
        ...(cookie ? { cookie } : {}),
      },
    });

    const rawSetCookie = response.headers["set-cookie"];
    const setCookie = Array.isArray(rawSetCookie)
      ? rawSetCookie
      : rawSetCookie
        ? [String(rawSetCookie)]
        : [];

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      headers[key.toLowerCase()] = Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
    }

    let body: string | null = null;
    let bodyTruncated = false;

    if (readBody && method === "GET") {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response.body) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBodyBytes) {
          chunks.push(buffer.subarray(0, buffer.length - (total - maxBodyBytes)));
          bodyTruncated = true;
          break;
        }
        chunks.push(buffer);
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    // 본문을 읽지 않더라도 소켓을 비워야 커넥션이 정리된다
    await response.body.dump().catch(() => {});

    return {
      url: url.toString(),
      ip: resolved.address,
      status: response.statusCode,
      headers,
      setCookie,
      body,
      bodyTruncated,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error instanceof GuardError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    throw new GuardError(
      `fetch failed for ${url.hostname}: ${reason}`,
      "사이트가 응답하지 않아요. 이미 차단됐거나 사라진 주소일 수 있어요.",
    );
  } finally {
    // close()는 미소비 본문이 남으면 대기한다. 스캐너는 커넥션을 재사용하지
    // 않으므로 무조건 끊는다.
    await agent.destroy().catch(() => {});
  }
}
