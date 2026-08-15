/**
 * APK 배포 신뢰 호스트 (S8 오탐 보정).
 *
 * 스토어 밖 APK 배포는 한국 스미싱의 주 경로라 기본이 danger다. 다만 구글 플레이가
 * 아니어도 정당한 배포 경로는 존재하므로, 그것만 좁게 caution으로 낮춘다.
 *
 * 🚨 이 목록에 호스트를 추가하는 것은 곧 우회 경로를 만드는 일이다.
 *    - GitHub Releases, 각종 파일 공유·클라우드 드라이브는 절대 넣지 말 것.
 *      공격자가 가장 흔히 쓰는 배포처이며, 한 번 넣으면 그 도메인 뒤에 숨은
 *      모든 APK가 통과한다.
 *    - "개발자가 자기 앱을 직접 배포하는 자사 홈페이지" 같은 것도 넣지 말 것.
 *      정당해 보여도 판별 기준이 없어 결국 목록이 무한히 늘어난다.
 *    - 추가 기준은 하나다: 심사 절차를 갖춘 공개 앱 스토어의 공식 배포 도메인인가.
 */

interface TrustedStore {
  /** 사용자에게 노출되는 이름 */
  name: string;
  /** 정식 배포 도메인. 서브도메인까지 신뢰한다 */
  domains: string[];
}

const TRUSTED_APK_STORES: TrustedStore[] = [
  { name: "F-Droid", domains: ["f-droid.org"] },
  { name: "원스토어", domains: ["onestore.co.kr"] },
  {
    name: "삼성 갤럭시스토어",
    domains: ["galaxystore.samsung.com", "samsungapps.com"],
  },
];

/**
 * 이 호스트가 정식 스토어인가? 아니면 null.
 *
 * 정확히 일치하거나 서브도메인일 때만 인정한다. `f-droid.org.evil.com` 같은
 * 접미사 사칭은 `.evil.com`으로 끝나므로 걸리지 않는다.
 */
export function trustedApkStore(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  for (const store of TRUSTED_APK_STORES) {
    for (const domain of store.domains) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        return store.name;
      }
    }
  }
  return null;
}
