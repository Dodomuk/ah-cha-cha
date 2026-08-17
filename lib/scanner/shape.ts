/**
 * 일회용 도메인 형태 (S12).
 *
 * 한국 스미싱은 무료 호스팅을 쓰지 않는다. 도메인을 직접 사서 한 번 쓰고
 * 버린다 — KISA 표본에서 등록도메인 하나당 URL이 평균 7개, 그중 54.6%는
 * URL 하나만 쓰고 사라졌다.
 *
 * 그렇게 대량으로 사려면 이름을 사람이 짓지 않는다. 기계가 만든다:
 *
 *     aw1y.bar   gh7w.yachts   ae1t.yachts   fb6m.mom   gm7p.info
 *
 * 짧고, 발음되지 않고, 숫자가 글자 사이에 끼어 있다. 등록 가능한 이름을
 * 긁어모으려면 그 모양이 될 수밖에 없다.
 *
 * 🚨 단독으로는 판정을 올리지 않는다 (severity: medium).
 *    실측(2026-08-17)에서 정상 도메인의 0.15~0.20%가 같은 모양이었다.
 *    `g2a.com`(게임 키 마켓), `n8n.io`(워크플로 도구), `a2z.com` 같은
 *    멀쩡한 사이트들이다. 0.2%는 낮지만 0이 아니고, 이 시그널 하나로
 *    caution 을 띄우면 그 사이트들이 전부 걸린다.
 *
 *    다른 신호와 겹칠 때만 의미가 있다. 갓 만든 도메인(S4)이면서 이 모양이면
 *    "대량으로 산 일회용"이라는 정황이 두 겹이 된다.
 *
 * 왜 "숫자가 가운데"인가 — 이 조건 하나가 판별력을 만든다:
 *
 *     조건                        악성      정상(10만~100만위)
 *     ≤4글자 + 숫자혼합           56.7%     1.16%
 *     ≤4글자 + 숫자가 가운데      55.6%     0.15%   ← 8배 개선, 재현율은 그대로
 *
 *    정상 짧은 도메인은 뜻이 있는 줄임말이라 숫자가 끝에 붙는다
 *    (`tv2.no`, `ic3.gov`, `1drv.ms`, `4pda.to`). 기계가 만든 이름은
 *    글자와 숫자가 뒤섞인다.
 */

import { registrableDomain } from "./normalize";

/** 이 길이를 넘으면 사람이 지은 이름일 가능성이 커진다 */
const MAX_LABEL = 4;

/**
 * 등록에 심사·자격 확인이 필요한 TLD. 아무나 살 수 없으므로
 * 이름 모양만으로 의심하면 안 된다.
 */
const CONTROLLED_TLDS = new Set([
  "gov", "edu", "mil", "int",
  "go.kr", "or.kr", "ac.kr", "re.kr", "mil.kr",
  "go.jp", "ac.jp", "gov.uk", "ac.uk", "gov.au", "edu.au",
]);

/** `aw1y`처럼 글자–숫자–글자 순으로 섞인 이름 */
const MACHINE_MADE = /^[a-z]+\d+[a-z]+$/;

export interface DomainShape {
  /** 검사한 등록가능 도메인 */
  domain: string;
  /** 기계가 만든 것처럼 보이는 이름인가 */
  disposable: boolean;
}

export function inspectDomainShape(hostname: string): DomainShape {
  const domain = registrableDomain(hostname.toLowerCase().replace(/\.$/, ""));
  const [label, ...rest] = domain.split(".");
  const tld = rest.join(".");

  return {
    domain,
    disposable:
      label.length <= MAX_LABEL &&
      MACHINE_MADE.test(label) &&
      !CONTROLLED_TLDS.has(tld),
  };
}
