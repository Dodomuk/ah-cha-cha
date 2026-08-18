/**
 * 카카오톡 채널 연동 테스트.
 *
 * 실제 스미싱 문자 모양을 넣어본다. 주소를 못 뽑으면 검사 자체가 시작되지
 * 않으므로, 이 추출이 연동 전체에서 가장 잘 깨지는 지점이다.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  extractUrl,
  feedbackButtons,
  feedbackIntent,
  REPORT_PHISHING_TEXT,
  REPORT_SAFE_TEXT,
  resultMessage,
  textReply,
} from "../lib/kakao.ts";
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

/* ------------------------------------------------------------------ */
/* 결과가 틀렸다고 알려주는 버튼                                          */
/* ------------------------------------------------------------------ */

test("버튼 문구를 그대로 돌려받으면 제보로 알아본다", () => {
  assert.equal(feedbackIntent(REPORT_PHISHING_TEXT), "phishing");
  assert.equal(feedbackIntent(REPORT_SAFE_TEXT), "false_positive");
});

test("손으로 친 말도 받아준다", () => {
  assert.equal(feedbackIntent("신고"), "phishing");
  assert.equal(feedbackIntent("  피싱  "), "phishing");
  assert.equal(feedbackIntent("정상"), "false_positive");
});

test("주소가 든 발화를 제보로 오인하지 않는다", () => {
  // 제보 판단이 주소 추출보다 먼저 돌기 때문에, 여기서 잘못 잡으면
  // 검사 요청이 통째로 제보로 빠진다
  assert.equal(feedbackIntent("신고합니다 abc.kr/x1"), null);
  assert.equal(feedbackIntent("[Web발신] 피싱 주의 안내 buly.kr/aB"), null);
  assert.equal(feedbackIntent("www.google.com"), null);
});

test("판정 결과에는 양방향 버튼이 함께 나간다", () => {
  // 미탐(놓친 것)과 오탐(멀쩡한 곳을 위험이라 한 것) 둘 다 받아야 한다.
  // 오탐은 미탐보다 비싼데(규칙 11) 사용자가 알려주지 않으면 영영 모른다
  const reply = textReply("결과입니다", feedbackButtons());
  const labels = reply.template.quickReplies?.map((q) => q.label) ?? [];
  assert.equal(labels.length, 2);
  assert.ok(labels.some((l) => l.includes("피싱")));
  assert.ok(labels.some((l) => l.includes("정상")));
});

test("버튼이 없으면 quickReplies 자체를 넣지 않는다", () => {
  // 빈 배열을 보내면 카카오가 빈 버튼 줄을 그린다
  assert.equal("quickReplies" in textReply("안녕").template, false);
  assert.equal("quickReplies" in textReply("안녕", []).template, false);
});
