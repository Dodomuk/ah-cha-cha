/**
 * 한국어 조사 처리.
 *
 * 브랜드명·도메인처럼 값이 런타임에 정해지는 문구에 조사를 붙일 때 쓴다.
 * "KB국민은행가", "네이버이" 같은 문구가 결과 화면에 그대로 노출되면
 * 서비스 신뢰도에 직접 영향을 준다.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
/** 한글 한 글자당 종성 후보 수 */
const JONGSEONG_COUNT = 28;

/**
 * 마지막 글자에 받침이 있는가.
 *
 * 한글이 아닌 글자로 끝나면 받침 없음으로 본다. 영문 약칭은 읽는 소리를 따르는데
 * (KT → "케이티"), 우리 브랜드 목록의 영문 약칭은 모두 모음으로 끝나 이 기본값이 맞다.
 */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trim().at(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return false;
  return (code - HANGUL_START) % JONGSEONG_COUNT !== 0;
}

type ParticlePair = "이/가" | "은/는" | "을/를" | "와/과" | "으로/로";

const PARTICLES: Record<ParticlePair, [withFinal: string, withoutFinal: string]> = {
  "이/가": ["이", "가"],
  "은/는": ["은", "는"],
  "을/를": ["을", "를"],
  "와/과": ["과", "와"],
  "으로/로": ["으로", "로"],
};

/** `josa("KB국민은행", "이/가")` → `"KB국민은행이"` */
export function josa(word: string, pair: ParticlePair): string {
  const [withFinal, withoutFinal] = PARTICLES[pair];
  return word + (hasFinalConsonant(word) ? withFinal : withoutFinal);
}
