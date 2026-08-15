import assert from "node:assert/strict";
import test from "node:test";

import { hasFinalConsonant, josa } from "../lib/korean.ts";

test("받침 유무를 판별한다", () => {
  assert.equal(hasFinalConsonant("KB국민은행"), true); // 행
  assert.equal(hasFinalConsonant("쿠팡"), true); // 팡
  assert.equal(hasFinalConsonant("네이버"), false); // 버
  assert.equal(hasFinalConsonant("카카오"), false); // 오
  assert.equal(hasFinalConsonant("토스"), false); // 스
});

test("한글이 아닌 글자로 끝나면 받침 없음으로 본다", () => {
  assert.equal(hasFinalConsonant("KT"), false);
  assert.equal(hasFinalConsonant(""), false);
});

test("조사를 올바르게 붙인다", () => {
  assert.equal(josa("KB국민은행", "이/가"), "KB국민은행이");
  assert.equal(josa("네이버", "이/가"), "네이버가");
  assert.equal(josa("KB국민은행", "와/과"), "KB국민은행과");
  assert.equal(josa("네이버", "와/과"), "네이버와");
  assert.equal(josa("쿠팡", "은/는"), "쿠팡은");
  assert.equal(josa("카카오", "은/는"), "카카오는");
});
