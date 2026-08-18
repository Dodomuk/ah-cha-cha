/**
 * 카카오톡 채널 연동 테스트.
 *
 * 실제 스미싱 문자 모양을 넣어본다. 주소를 못 뽑으면 검사 자체가 시작되지
 * 않으므로, 이 추출이 연동 전체에서 가장 잘 깨지는 지점이다.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { extractUrl, resultMessage, textReply } from "../lib/kakao.ts";
import type { Explanation, ScanResult } from "../lib/scanner/types.ts";

test("스킴 없는 한국식 단축 주소를 뽑는다", () => {
  // 한국 스미싱 문자는 http를 안 붙이고 오는 경우가 대부분이다
  assert.equal(
    extractUrl("[Web발신]\n택배 주소지가 잘못되었습니다 buly.kr/6Bv61QM"),
    "buly.kr/6Bv61QM",
  );
  assert.equal(extractUrl("확인하세요 gov.aw1y.bar"), "gov.aw1y.bar");
});

test("주소가 여러 개면 마지막 것을 쓴다", () => {
  // 앞에 진짜 기관 주소를 적어두고 뒤에 가짜 링크를 두는 형태가 흔하다
  assert.equal(
    extractUrl("국민건강보험공단 nhis.or.kr 안내입니다. 확인 go9.co/Wdw"),
    "go9.co/Wdw",
  );
});

test("주소가 없으면 null", () => {
  assert.equal(extractUrl("안녕하세요"), null);
  assert.equal(extractUrl(""), null);
});

test("금액·숫자를 주소로 오인하지 않는다", () => {
  assert.equal(extractUrl("결제금액 1.000.000원이 승인되었습니다"), null);
  assert.equal(extractUrl("버전 1.2.3 업데이트"), null);
});

test("문장 끝 문장부호를 떼어낸다", () => {
  assert.equal(extractUrl("여기서 확인하세요: abc.kr/xY."), "abc.kr/xY");
  assert.equal(extractUrl("(kb-star.co/a1)"), "kb-star.co/a1");
});

test("답장에 주소 원문이 들어가지 않는다", () => {
  // 🚨 카카오톡은 본문의 주소를 자동으로 눌리는 링크로 만든다.
  //    경고를 읽는 화면에서 그 링크를 누를 수 있게 되면 최악이다
  const result = {
    verdict: "danger",
    scannedAt: "2026-08-18T01:23:00.000Z",
    normalizedUrl: "https://gov.aw1y.bar/login",
    finalUrl: "https://gov.aw1y.bar/login",
  } as ScanResult;
  const explanation: Explanation = {
    headline: "이 링크는 누르면 안 돼요.",
    reasons: ["주소 앞부분에 정부24가 붙어 있지만, 실제 주인은 aw**.bar 입니다."],
    action: "링크를 누르지 말고 지우세요.",
    source: "template",
  };

  const text = resultMessage(result, explanation);
  assert.ok(!text.includes("aw1y.bar"), `주소 원문이 노출됐다:\n${text}`);
  assert.ok(!text.includes("gov.aw1y"), `주소 원문이 노출됐다:\n${text}`);
});

test("clean 결과에도 검사 시각과 고지를 붙인다", () => {
  const result = {
    verdict: "no_signal",
    scannedAt: "2026-08-18T01:23:00.000Z",
  } as ScanResult;
  const explanation: Explanation = {
    headline: "지금 확인한 범위에서는 위험 신호가 없었어요.",
    reasons: ["구글 목록에는 없었어요."],
    action: "주소창을 한 번 더 확인하세요.",
    source: "template",
  };

  const text = resultMessage(result, explanation);
  assert.ok(text.includes("계속 새로 생겨요"), "고지가 빠졌다");
  assert.ok(text.includes("10:23"), `KST 변환이 틀렸다:\n${text}`);
  assert.ok(!text.includes("안전"), "단정 표현이 들어갔다");
});

test("응답 형식이 카카오 스킬 규격을 따른다", () => {
  const reply = textReply("안녕");
  assert.equal(reply.version, "2.0");
  assert.equal(reply.template.outputs[0].simpleText.text, "안녕");
});
