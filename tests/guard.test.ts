/**
 * SSRF 가드 테스트.
 *
 * 이 파일이 깨지면 서비스의 보안 경계가 뚫린 것이다. 가드를 수정할 때는
 * 반드시 여기에 케이스를 먼저 추가할 것.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  GuardError,
  assertScannableUrl,
  isBlockedIp,
  resolveAndVerify,
} from "../lib/scanner/guard.ts";

test("사설·예약 IPv4 대역을 차단한다", () => {
  const blocked = [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "169.254.169.254", // 클라우드 메타데이터
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
  ];
  for (const ip of blocked) {
    assert.equal(isBlockedIp(ip), true, `${ip} 는 차단되어야 한다`);
  }
});

test("공인 IPv4는 통과시킨다", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1"]) {
    assert.equal(isBlockedIp(ip), false, `${ip} 는 통과해야 한다`);
  }
});

test("IPv6 사설·루프백 대역을 차단한다", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
    assert.equal(isBlockedIp(ip), true, `${ip} 는 차단되어야 한다`);
  }
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
});

test("IPv6에 감싼 IPv4 우회를 차단한다", () => {
  const disguised = [
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1", // 16진 표기 127.0.0.1
    "::ffff:a9fe:a9fe", // 16진 표기 169.254.169.254
    "64:ff9b::127.0.0.1", // NAT64
  ];
  for (const ip of disguised) {
    assert.equal(isBlockedIp(ip), true, `${ip} 는 차단되어야 한다`);
  }
});

test("파싱할 수 없는 입력은 차단으로 처리한다", () => {
  for (const value of ["", "not-an-ip", "999.999.999.999", "localhost"]) {
    assert.equal(isBlockedIp(value), true);
  }
});

test("http/https 이외의 스킴을 거부한다", () => {
  for (const url of [
    "file:///etc/passwd",
    "gopher://example.com",
    "ftp://example.com",
    "javascript:alert(1)",
    "data:text/html,hi",
  ]) {
    assert.throws(() => assertScannableUrl(url), GuardError, url);
  }
});

test("자격증명이 섞인 URL을 거부한다", () => {
  assert.throws(
    () => assertScannableUrl("https://user:pass@evil.example/"),
    GuardError,
  );
  assert.throws(() => assertScannableUrl("https://admin@10.0.0.1/"), GuardError);
});

test("정상 URL은 통과시킨다", () => {
  assert.equal(
    assertScannableUrl("https://example.com/a?b=c").hostname,
    "example.com",
  );
  assert.equal(assertScannableUrl("http://example.com:8080/").port, "8080");
});

test("내부망을 가리키는 호스트는 해석 단계에서 막는다", async () => {
  await assert.rejects(() => resolveAndVerify("127.0.0.1"), GuardError);
  await assert.rejects(() => resolveAndVerify("192.168.0.1"), GuardError);
  await assert.rejects(() => resolveAndVerify("::1"), GuardError);
  // localhost는 DNS 해석 결과가 루프백이므로 차단되어야 한다
  await assert.rejects(() => resolveAndVerify("localhost"), GuardError);
});
