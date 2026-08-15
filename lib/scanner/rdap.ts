/**
 * 도메인 등록 나이 조회 (S4) — IANA RDAP 부트스트랩 기반.
 *
 * 30일 미만 도메인은 강한 위험 신호다. 피싱 인프라는 차단되기 전에
 * 쓰고 버리는 구조라 도메인이 거의 항상 새것이다.
 *
 * 주의: 이 파일이 접속하는 곳은 IANA/레지스트리 RDAP 서버이지 검사 대상이
 * 아니다. 신뢰 대상이므로 일반 fetch를 쓴다 — safeFetch는 의심 URL 전용.
 */

import { registrableDomain } from "./normalize";
import type { DomainAge } from "./types";

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const RDAP_TIMEOUT_MS = 4_000;

interface BootstrapService {
  /** [ [tld, ...], [rdapBaseUrl, ...] ] */
  services: Array<[string[], string[]]>;
}

let bootstrapCache: { map: Map<string, string>; fetchedAt: number } | null = null;

async function loadBootstrap(): Promise<Map<string, string>> {
  if (bootstrapCache && Date.now() - bootstrapCache.fetchedAt < BOOTSTRAP_TTL_MS) {
    return bootstrapCache.map;
  }
  const response = await fetch(BOOTSTRAP_URL, {
    signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`bootstrap ${response.status}`);

  const data = (await response.json()) as BootstrapService;
  const map = new Map<string, string>();
  for (const [tlds, endpoints] of data.services) {
    const base = endpoints[0];
    if (!base) continue;
    for (const tld of tlds) {
      map.set(tld.toLowerCase(), base.endsWith("/") ? base : `${base}/`);
    }
  }
  bootstrapCache = { map, fetchedAt: Date.now() };
  return map;
}

interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

interface RdapEntity {
  roles?: string[];
  vcardArray?: unknown;
}

interface RdapDomain {
  events?: RdapEvent[];
  entities?: RdapEntity[];
}

/**
 * 등록일을 조회한다.
 *
 * RDAP를 제공하지 않는 TLD(.kr 등 상당수)가 있으므로 실패는 정상 경로다.
 * 실패 시 source: "none"으로 반환하고, 호출부는 이를 clear가 아니라
 * unavailable로 처리해야 한다.
 */
export async function lookupDomainAge(hostname: string): Promise<DomainAge> {
  const domain = registrableDomain(hostname);
  const empty: DomainAge = {
    domain,
    registeredAt: null,
    ageDays: null,
    registrar: null,
    source: "none",
  };

  const tld = domain.split(".").pop();
  if (!tld) return empty;

  let base: string | undefined;
  try {
    base = (await loadBootstrap()).get(tld);
  } catch {
    return empty;
  }
  if (!base) return empty; // 해당 TLD는 RDAP 미제공

  let data: RdapDomain;
  try {
    const response = await fetch(`${base}domain/${encodeURIComponent(domain)}`, {
      signal: AbortSignal.timeout(RDAP_TIMEOUT_MS),
      headers: { accept: "application/rdap+json, application/json" },
    });
    if (!response.ok) return empty;
    data = (await response.json()) as RdapDomain;
  } catch {
    return empty;
  }

  const registration = data.events?.find(
    (event) => event.eventAction === "registration",
  )?.eventDate;
  if (!registration) return empty;

  const registeredAt = new Date(registration);
  if (Number.isNaN(registeredAt.getTime())) return empty;

  const ageDays = Math.floor(
    (Date.now() - registeredAt.getTime()) / (24 * 60 * 60 * 1000),
  );

  return {
    domain,
    registeredAt: registeredAt.toISOString(),
    ageDays,
    registrar: extractRegistrar(data),
    source: "rdap",
  };
}

function extractRegistrar(data: RdapDomain): string | null {
  const entity = data.entities?.find((candidate) =>
    candidate.roles?.includes("registrar"),
  );
  // vcardArray는 ["vcard", [["fn", {}, "text", "이름"], ...]] 형태
  const vcard = entity?.vcardArray;
  if (!Array.isArray(vcard) || !Array.isArray(vcard[1])) return null;
  for (const field of vcard[1] as unknown[]) {
    if (Array.isArray(field) && field[0] === "fn" && typeof field[3] === "string") {
      return field[3];
    }
  }
  return null;
}
