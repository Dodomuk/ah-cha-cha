/**
 * 브랜드 사칭 탐지 테스트.
 *
 * 오탐 케이스를 탐지 케이스만큼 비중 있게 둔다. 정밀도 우선 원칙상
 * 정상 사이트가 하나라도 걸리면 그게 더 큰 문제다.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { BRANDS } from "../lib/scanner/brands.ts";
import {
  capConfidence,
  detectImpersonation,
  foldHomoglyphs,
  levenshtein,
} from "../lib/scanner/impersonation.ts";

const detect = (url: string) => detectImpersonation(new URL(url));

test("정식 도메인은 사칭으로 잡지 않는다", () => {
  for (const url of [
    "https://kbstar.com/",
    "https://www.kbstar.com/login",
    "https://obank.kbstar.com/quics?page=C101538",
    "https://www.shinhancard.com/",
    "https://hometax.go.kr/",
    "https://www.coupang.com/np/search?q=abc",
  ]) {
    assert.equal(detect(url), null, `${url} 는 정상이어야 한다`);
  }
});

test("무관한 도메인을 사칭으로 잡지 않는다", () => {
  for (const url of [
    "https://github.com/",
    "https://www.google.com/",
    "https://vercel.com/docs",
    "https://news.ycombinator.com/",
    "https://example.org/",
  ]) {
    assert.equal(detect(url), null, `${url} 는 정상이어야 한다`);
  }
});

test("서브도메인 사칭을 고신뢰로 잡는다", () => {
  const finding = detect("https://kbstar.evil-domain.com/login");
  assert.ok(finding);
  assert.equal(finding.kind, "subdomain");
  assert.equal(finding.confidence, "high");
  assert.equal(finding.brand, "KB국민은행");
});

test("숫자 치환 homoglyph를 고신뢰로 잡는다", () => {
  // kbstar → kbst4r (4 → a)
  const finding = detect("https://kbst4r.com/");
  assert.ok(finding);
  assert.equal(finding.confidence, "high");
  assert.equal(finding.brand, "KB국민은행");
});

test("키릴 문자 혼입을 잡는다", () => {
  // coupang 의 o, a 를 키릴 문자로 치환
  const finding = detect("https://cоupаng.com/");
  assert.ok(finding);
  assert.equal(finding.kind, "homoglyph");
  assert.equal(finding.confidence, "high");
});

test("한 글자 차이는 high, 두 글자 차이는 medium", () => {
  const one = detect("https://kbstat.com/");
  assert.ok(one);
  assert.equal(one.kind, "lookalike");
  assert.equal(one.confidence, "high");

  const two = detect("https://kbsttat.com/");
  assert.ok(two);
  assert.equal(two.confidence, "medium");
});

test("경로에만 브랜드명이 있으면 저신뢰로 둔다", () => {
  const finding = detect("https://some-random-host.com/kbstar/login");
  assert.ok(finding);
  assert.equal(finding.kind, "path_only");
  assert.equal(finding.confidence, "low");
});

test("짧은 브랜드 라벨은 편집거리 비교에서 제외한다", () => {
  // kt.com(라벨 "kt")과 거리가 가까운 무관한 도메인들이 걸리면 안 된다
  for (const url of ["https://ktx.com/", "https://kts.com/", "https://ibkx.com/"]) {
    const finding = detect(url);
    assert.equal(finding, null, `${url} 는 잡히면 안 된다`);
  }
});

test("foldHomoglyphs는 조합 치환까지 처리한다", () => {
  assert.equal(foldHomoglyphs("rnaver"), "maver");
  assert.equal(foldHomoglyphs("KB-STAR"), "kbstar");
  assert.equal(foldHomoglyphs("kbst0r"), "kbstor");
});

test("levenshtein은 상한을 넘으면 조기 종료한다", () => {
  assert.equal(levenshtein("kbstar", "kbstar"), 0);
  assert.equal(levenshtein("kbstar", "kbstat"), 1);
  assert.equal(levenshtein("kbstar", "kbsttat"), 2);
  assert.ok(levenshtein("kbstar", "completely-different") > 3);
});

test("이름이 같고 TLD만 다르면 위험으로 단정하지 않는다", () => {
  // 대형 플랫폼은 자기 이름의 다른 TLD를 직접 갖고 있는 경우가 많다.
  // 실측으로 naver.co.kr·naver.net·coupang.co.kr·gmarket.com·kakao.co.kr이
  // 전부 본인 소유임을 확인했다. 이걸 danger로 올리면 진짜 사이트가
  // "가짜"로 표시된다 — 오탐 중에서도 최악이다.
  for (const url of [
    "https://kakao.net/",
    "https://naver.io/",
    "https://coupang.net/",
  ]) {
    const finding = detect(url);
    assert.ok(finding, `${url} 는 정황으로는 잡혀야 한다`);
    assert.equal(finding.kind, "other_tld", url);
    assert.equal(finding.confidence, "low", `${url} 는 단독으로 판정을 올리면 안 된다`);
  }
});

test("짧은 라벨 브랜드는 TLD 검사에서도 제외된다", () => {
  // 11st(4글자), toss(4글자)처럼 짧은 라벨은 편집거리 비교에서 빠지는데,
  // TLD 검사도 같은 분기 안에 있어서 함께 빠진다. 의도한 동작이다 —
  // 짧은 라벨은 무관한 도메인과도 쉽게 겹쳐 오탐이 난다.
  assert.equal(detect("https://11st.com/"), null);
  assert.equal(detect("https://toss.net/"), null);
});

test("글자를 실제로 바꾼 경우는 여전히 고신뢰로 잡는다", () => {
  // other_tld 분기가 homoglyph 탐지를 삼키지 않았는지 확인
  const folded = detect("https://kakα o.com/".replace(" ", ""));
  assert.ok(folded);
  assert.equal(folded.confidence, "high");
  assert.equal(folded.kind, "homoglyph");
});

test("확인되지 않은 브랜드는 danger 까지 올리지 않는다", () => {
  // 화이트리스트에 오타가 있으면 그 오타 도메인이 "정식"이 되고,
  // 진짜 사이트가 사칭으로 잡혀 danger 가 뜬다. 오탐 중 최악이다.
  // 확인 전 브랜드는 caution 까지만 가게 막는다.
  const unverified = {
    name: "테스트은행",
    category: "bank" as const,
    domains: ["testbank-example.com"],
    verified: false,
  };
  BRANDS.push(unverified);
  try {
    // 모듈 로드 시점에 후보 목록이 굳으므로, 여기서는 상한 로직만 직접 검증한다
    const capped = capConfidence({ confidence: "high", verified: false });
    assert.equal(capped.confidence, "medium");
    assert.equal(capped.cappedByVerification, true);

    const kept = capConfidence({ confidence: "high", verified: true });
    assert.equal(kept.confidence, "high");
    assert.equal(kept.cappedByVerification, undefined);
  } finally {
    BRANDS.pop();
  }
});

test("확인된 브랜드 53개는 모두 verified 다", () => {
  const unverified = BRANDS.filter((b) => !b.verified).map((b) => b.name);
  assert.deepEqual(unverified, [], `확인 안 된 브랜드: ${unverified.join(", ")}`);
});
