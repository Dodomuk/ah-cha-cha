/**
 * APK 신뢰 호스트 목록 테스트.
 *
 * 이 목록은 곧 우회 경로이므로, 접미사 사칭이 통과하지 않는지가 핵심이다.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { trustedApkStore } from "../lib/scanner/allowlist.ts";

test("정식 스토어 도메인과 서브도메인을 인정한다", () => {
  assert.equal(trustedApkStore("f-droid.org"), "F-Droid");
  assert.equal(trustedApkStore("www.f-droid.org"), "F-Droid");
  assert.equal(trustedApkStore("F-Droid.ORG"), "F-Droid");
  assert.equal(trustedApkStore("onestore.co.kr"), "원스토어");
  assert.equal(trustedApkStore("galaxystore.samsung.com"), "삼성 갤럭시스토어");
});

test("접미사를 흉내 낸 사칭 도메인을 통과시키지 않는다", () => {
  const spoofed = [
    "f-droid.org.evil.com",
    "f-droid.org.kr",
    "notf-droid.org",
    "f-droid.com",
    "onestore.co.kr.attacker.net",
    "galaxystore.samsung.com.evil.io",
    "samsung.com", // 스토어 도메인이 아님
  ];
  for (const host of spoofed) {
    assert.equal(trustedApkStore(host), null, `${host} 는 신뢰하면 안 된다`);
  }
});

test("목록에 없는 흔한 배포처는 신뢰하지 않는다", () => {
  // 화이트리스트에 넣으면 그대로 우회 경로가 되는 호스트들
  for (const host of [
    "github.com",
    "objects.githubusercontent.com",
    "drive.google.com",
    "cdn.discordapp.com",
    "apkmirror.com",
  ]) {
    assert.equal(trustedApkStore(host), null, `${host} 는 신뢰하면 안 된다`);
  }
});
