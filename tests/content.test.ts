/**
 * 자격증명 수집 페이지 탐지 (S11) 테스트.
 *
 * 오탐 케이스를 탐지 케이스보다 먼저 둔다. 이 시그널은 페이지 제목 문자열
 * 하나로 판정을 올리는 구조라, 잘못 만들면 정상 로그인 페이지를 전부 긁는다.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { contentSeverity, inspectHtml } from "../lib/scanner/content.ts";
import { freeHostingPlatform } from "../lib/scanner/hosting.ts";

const page = (title: string, body = "") =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`;

const PASSWORD = `<form><input name="id"><input type="password" name="pw"></form>`;
const ID_ONLY = `<form><input name="username"></form>`;

/* ------------------------------------------------------------------ */
/* 오탐 방지                                                            */
/* ------------------------------------------------------------------ */

test("로그인 폼만 있는 정상 사이트는 잡지 않는다", () => {
  const finding = inspectHtml(page("로그인 - 우리 동네 카페", PASSWORD), "example.com");
  assert.equal(finding.status, "clear");
});

test("브랜드 이름이 있어도 자격증명 입력란이 없으면 잡지 않는다", () => {
  // 은행 이야기를 하는 블로그 글·뉴스 기사가 여기 해당한다
  const finding = inspectHtml(page("KB국민은행 대출 후기 총정리"), "someblog.com");
  assert.equal(finding.status, "clear");
  assert.equal(finding.credential, null);
});

test("진짜 브랜드 사이트는 잡지 않는다", () => {
  const finding = inspectHtml(page("KB스타뱅킹 로그인", PASSWORD), "obank.kbstar.com");
  assert.equal(finding.status, "clear");
  assert.equal(finding.claimedBrand, null);
});

test("다른 정식 브랜드 도메인 위의 페이지는 사칭으로 보지 않는다", () => {
  // 네이버 블로그에 올라온 "국민은행 …" 글. 네이버 페이지에는 로그인 폼이 있다.
  // 이걸 국민은행 사칭으로 잡으면 대형 오탐이 된다
  const finding = inspectHtml(
    page("KB국민은행 금리 비교 : 네이버 블로그", PASSWORD),
    "blog.naver.com",
  );
  assert.equal(finding.status, "clear");
  assert.equal(finding.claimedBrand, null);
});

test("무료 호스팅이라도 비밀번호를 받지 않으면 잡지 않는다", () => {
  const finding = inspectHtml(page("내 포트폴리오"), "my-project.vercel.app");
  assert.equal(finding.status, "clear");
  assert.equal(finding.freeHost, "vercel.app");
});

/* ------------------------------------------------------------------ */
/* 탐지                                                                */
/* ------------------------------------------------------------------ */

test("남의 도메인에서 브랜드를 내세우고 비밀번호를 받으면 잡는다", () => {
  const finding = inspectHtml(
    page("KB스타뱅킹 로그인", PASSWORD),
    "kbstar-login.some-host.com",
  );
  assert.equal(finding.status, "hit");
  assert.equal(finding.claimedBrand?.name, "KB국민은행");
  assert.equal(finding.credential, "password");
});

test("아이디만 먼저 받는 2단계 피싱도 잡는다", () => {
  const finding = inspectHtml(page("신한 SOL", ID_ONLY), "xyz.workers.dev");
  assert.equal(finding.status, "hit");
  assert.equal(finding.credential, "identifier");
  assert.equal(finding.claimedBrand?.name, "신한은행");
});

test("og:title 에만 브랜드가 있어도 잡는다", () => {
  const html = `<html><head><title>Sign in</title>
    <meta property="og:title" content="하나원큐 인증">
    </head><body>${PASSWORD}</body></html>`;
  const finding = inspectHtml(html, "random.pages.dev");
  assert.equal(finding.status, "hit");
  assert.equal(finding.claimedBrand?.name, "하나은행");
});

test("무료 호스팅 + 비밀번호는 브랜드가 없어도 잡는다", () => {
  const finding = inspectHtml(page("Secure Login", PASSWORD), "abc123.workers.dev");
  assert.equal(finding.status, "hit");
  assert.equal(finding.claimedBrand, null);
  assert.equal(finding.freeHost, "workers.dev");
});

/* ------------------------------------------------------------------ */
/* 판정 강도                                                            */
/* ------------------------------------------------------------------ */

test("브랜드 사칭은 정황이 하나 더 있을 때만 danger 까지 올린다", () => {
  const onBrandOnly = inspectHtml(page("KB스타뱅킹", PASSWORD), "kbstar-login.com");
  // 제목 문자열 하나만으로는 danger 로 올리지 않는다
  assert.equal(contentSeverity(onBrandOnly, { newDomain: false }), "high");
  // 갓 만든 도메인이면 정상 사업자로 보기 어렵다 → danger
  assert.equal(contentSeverity(onBrandOnly, { newDomain: true }), "critical");

  const onFreeHost = inspectHtml(page("KB스타뱅킹", PASSWORD), "x.vercel.app");
  assert.equal(contentSeverity(onFreeHost, { newDomain: false }), "critical");
});

test("무료 호스팅만으로는 단독 판정을 올리지 않는다", () => {
  // medium 은 verdict.ts 에서 단독으로 아무 판정도 올리지 않는다.
  // 정상 개인 프로젝트도 "무료 호스팅 + 로그인 폼" 모양이기 때문이다
  const finding = inspectHtml(page("Login", PASSWORD), "abc.vercel.app");
  assert.equal(contentSeverity(finding, { newDomain: false }), "medium");
});

test("clear 상태에는 severity를 주지 않는다", () => {
  const finding = inspectHtml(page("그냥 사이트"), "example.com");
  assert.equal(contentSeverity(finding, { newDomain: true }), undefined);
});

/* ------------------------------------------------------------------ */
/* 무료 호스팅 판별                                                     */
/* ------------------------------------------------------------------ */

test("무료 호스팅은 서브도메인이 있을 때만 인정한다", () => {
  assert.equal(freeHostingPlatform("foo.vercel.app"), "vercel.app");
  assert.equal(freeHostingPlatform("user.github.io"), "github.io");
  // 플랫폼 자기 도메인은 남이 얻어 쓴 자리가 아니다
  assert.equal(freeHostingPlatform("vercel.app"), null);
  assert.equal(freeHostingPlatform("www.vercel.app"), null);
  // 접미사 사칭. `.evil.com`으로 끝나므로 걸리면 안 된다
  assert.equal(freeHostingPlatform("vercel.app.evil.com"), null);
  assert.equal(freeHostingPlatform("www.naver.com"), null);
});
