# 아차차 (ahchacha.com)

> 누르기 전에, 차차한테 먼저 물어보세요

의심스러운 링크를 대신 확인해 주는 서비스. 리디렉션을 따라가 최종 목적지를 밝히고,
알려진 악성 목록·도메인 등록 나이·앱 설치 파일 유도 여부를 확인해 4단계로 판정한다.

- 기획: [prd.md](prd.md)
- 개발 규칙(필독): [CLAUDE.md](CLAUDE.md)
- 이전 서비스(IT 뉴스·증시 대시보드) 코드: `legacy` 브랜치

## 실행

```bash
npm install
cp .env.example .env.local   # 키 없이도 동작한다 (해당 시그널은 "확인 못 함" 처리)
npm run dev
```

```bash
npm run build      # 프로덕션 빌드
npm run typecheck  # 타입 검사
npm run lint       # ESLint
npm test           # SSRF 가드 테스트 — 가드를 고쳤다면 반드시 실행
```

## API

### `POST /api/scan`

```bash
curl -X POST http://localhost:3000/api/scan \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com"}'
```

응답의 `verdict`는 `danger` / `caution` / `unknown` / `no_signal` 네 가지다.
`no_signal`은 "안전"이 아니라 **"검사 시점에 위험 신호가 없었다"**는 뜻이다.

`signals[]`는 확인하지 못한 항목까지 `status: "unavailable"`로 모두 포함한다.
무엇을 확인했고 무엇을 확인하지 못했는지가 판정만큼 중요한 정보이기 때문이다.

제한: IP당 분당 10회.

## 구조

```
app/api/scan/route.ts   검사 API (Node 런타임 고정)
lib/scanner/guard.ts    🔒 SSRF 가드 — 의심 URL 접속은 전부 여기를 통과한다
lib/scanner/redirect.ts 리디렉션 체인 추적 + APK 유도 탐지
lib/scanner/rdap.ts     도메인 등록 나이
lib/scanner/verdict.ts  시그널 → 판정
tests/guard.test.ts     가드 회귀 테스트
```

## 피드 동기화

`/api/cron/sync-feeds` 가 OpenPhish·URLhaus 목록을 받아 Redis에 채운다.
`Authorization: Bearer $CRON_SECRET` 이 없으면 401.

스케줄은 [vercel.json](vercel.json)에 **하루 1회(18:00 UTC = 03:00 KST)** 로 걸려 있다.
Hobby 플랜의 cron이 하루 1회로 제한되기 때문이다. Pro로 올리면 `0 */6 * * *` 로
되돌릴 것 — 피싱 URL은 수명이 짧아 6시간 주기가 실제로 더 많이 잡는다.

하루 묵은 목록으로 대조하는 구간은 **S1(Safe Browsing)이 메운다.** S1은 검사할
때마다 구글에 실시간 조회하므로 피드 신선도와 무관하다.

```bash
# 수동 동기화
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-feeds
```

## 배포

Vercel. **아직 배포하지 않았다.**

배포 시 저장소를 루트 평탄화했으므로 **Vercel 프로젝트의 Root Directory 설정을
`frontend` → `.` 로 먼저 바꿔야 한다.** 이 설정을 바꾸기 전에 푸시하면 빌드가 깨진다.
