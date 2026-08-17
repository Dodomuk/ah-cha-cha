/**
 * 일회용 도메인 형태 (S12) 테스트.
 *
 * 이 시그널은 재현율보다 **오탐이 나면 안 되는 지점**이 명확하다.
 * 정상 짧은 도메인(1drv.ms, ic3.gov, tv2.no)이 걸리면 안 된다.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { inspectDomainShape } from "../lib/scanner/shape.ts";

const disposable = (host: string) => inspectDomainShape(host).disposable;

test("기계가 찍어낸 짧은 이름을 잡는다", () => {
  // 전부 KISA 2024 피싱 목록에 실제로 있던 도메인이다
  for (const host of [
    "gov.aw1y.bar",
    "ibe.gh7w.yachts",
    "xnr.ae1t.yachts",
    "gov.fb6m.mom",
    "gov.gm7p.info",
  ]) {
    assert.equal(disposable(host), true, `${host} 는 잡혀야 한다`);
  }
});

test("숫자가 끝이나 앞에 붙은 정상 줄임말은 잡지 않는다", () => {
  // 뜻이 있는 이름은 숫자가 가장자리에 붙는다. 이 구분이 이 시그널의 전부다.
  // 실측에서 오탐 후보로 나왔던 실제 도메인들이다
  for (const host of [
    "1drv.ms",        // 마이크로소프트 원드라이브 단축 도메인
    "ic3.gov",        // 미국 FBI 신고센터
    "tv2.no",         // 노르웨이 방송사
    "4pda.to",
    "o2.cz",
    "a1.by",
  ]) {
    assert.equal(disposable(host), false, `${host} 는 잡히면 안 된다`);
  }
});

test("긴 이름은 사람이 지은 것으로 본다", () => {
  assert.equal(disposable("wooribank.com"), false);
  assert.equal(disposable("some1thing.com"), false);
  assert.equal(disposable("kbstar.com"), false);
});

test("심사가 필요한 TLD는 형태만으로 의심하지 않는다", () => {
  // 아무나 살 수 없는 주소다. 이름이 어떻게 생겼든 대량 구매 대상이 아니다
  assert.equal(disposable("a1b.gov"), false);
  assert.equal(disposable("a1b.go.kr"), false);
  assert.equal(disposable("a1b.ac.kr"), false);
  // 같은 이름이라도 아무나 살 수 있는 TLD면 잡는다
  assert.equal(disposable("a1b.bar"), true);
});

test("서브도메인이 아니라 등록가능 도메인을 본다", () => {
  // 판단 대상은 "산 이름"이다. 앞에 뭘 붙였는지는 S7이 본다
  assert.equal(inspectDomainShape("gov.aw1y.bar").domain, "aw1y.bar");
  assert.equal(inspectDomainShape("www.kbstar.com").domain, "kbstar.com");
});
