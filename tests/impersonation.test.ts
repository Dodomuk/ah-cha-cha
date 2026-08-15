/**
 * 브랜드 사칭 탐지 테스트.
 *
 * 오탐 케이스를 탐지 케이스만큼 비중 있게 둔다. 정밀도 우선 원칙상
 * 정상 사이트가 하나라도 걸리면 그게 더 큰 문제다.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
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
