# 아차차 — 시스템 아키텍처

**버전:** 0.4
**작성일:** 2026-05-21
**최종 수정:** 2026-05-28

---

## 1. 전체 구조 개요

```
┌─────────────────────────────────────────────────────────┐
│                        사용자 브라우저                      │
│           Next.js + D3.js + Canvas (Vercel)              │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API (HTTPS)
┌───────────────────────▼─────────────────────────────────┐
│               FastAPI 백엔드 (Render Docker)               │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│   │  API Router  │  │  Scheduler   │  │  News Worker  │  │
│   │ /countries  │  │  APScheduler │  │  RSS 수집     │  │
│   │ /news       │  │  30분 간격   │  │  Claude 요약  │  │
│   └─────────────┘  └──────────────┘  └───────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
┌──────────────┐ ┌─────────────┐  ┌──────────────────┐
│  PostgreSQL  │ │  RSS 피드   │  │  Claude Haiku API │
│  (Supabase)  │ │  7개 소스   │  │  (뉴스 요약/분류) │
└──────────────┘ └─────────────┘  └──────────────────┘
```

---

## 2. 컴포넌트별 역할

### 2.1 프론트엔드 (Next.js + Vercel)

| 컴포넌트 | 역할 |
|----------|------|
| `WorldMap` | D3.js GeoJSON 파싱 + Canvas 렌더링, 마우스 이벤트, 위협 색상 표시 |
| `MapTooltip` | 마우스 호버 시 국가명 + 위협 레벨 + delta 배지 툴팁 (글로우모피즘) |
| `DateRangeFilter` | 오늘/3일/7일 날짜 필터 (좌하단 고정) |
| `CountryPanel` | 국가 클릭 시 우측 슬라이드 패널 (뉴스 목록 + 7일 트렌드 차트) |
| `NewsCard` | 뉴스 제목, AI 요약(무슨 일/영향), 원문 링크 카드. 동일 기사 그룹화(+N개 매체) |
| `DailyReportPanel` | 우하단 플로팅 버튼 + 일일 리포트 사이드 패널, 날짜 선택, .txt 다운로드 |
| `Header` | 로고, 마지막 갱신 시각 |

**상태 관리:**
- React Query v5 — 서버 상태 (countries, news). `keepPreviousData`로 날짜 전환 중 이전 지도 유지.
- Zustand — UI 상태 (선택된 국가, 패널 오픈 여부, `hours` 필터)

**날짜 필터 동작:**
- Zustand의 `hours` 값이 변경되면 React Query 쿼리 키(`['countries', hours]`)가 바뀌어 새 데이터 요청
- `keepPreviousData`: 로딩 중 이전 지도 유지 + "지도 갱신 중..." 오버레이 표시

### 2.2 지도 렌더링 파이프라인

```
GeoJSON 데이터 (Natural Earth, /public/data/world.geojson)
    ↓ 마운트 1회만 로드
D3.js geoNaturalEarth1 projection 적용
    ↓
Path2D 캐시 생성 (resize 시 재생성)
    ↓
Canvas 2D Context에 국가 경계 path 드로잉
    ↓
위협 레벨별 fillStyle + shadowBlur 네온 글로우 효과
    ↓
requestAnimationFrame으로 호버 애니메이션 처리

히트 테스트: ctx.isPointInPath (CTM 리셋 후 CSS 픽셀 기준)
            → geoContains 대비 안티메리디안(러시아/캐나다) 오감지 해결
```

### 2.3 백엔드 API (FastAPI + Render)

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/countries?start=&end=` | 전체 국가 위협 레벨 맵 반환 (날짜 범위 KST, 기본 7일) |
| `GET /api/countries/{code}/news?start=&end=` | 특정 국가 뉴스 목록 반환 |
| `GET /api/countries/{code}/trend` | 특정 국가 최근 7일 위협 레벨 추이 |
| `GET /api/news/latest?date=YYYY-MM-DD` | 지정 날짜(KST 00:00~23:59) 기사 목록 |
| `GET /api/search?q=` | 키워드로 최근 7일 기사 검색 |
| `GET /api/stats` | 오늘/7일 수집 통계 (레벨별 건수) |
| `POST /api/internal/collect` | 수동 수집 트리거 (X-Internal-Key 인증) |
| `POST /api/internal/summarize` | 미처리 기사 수동 요약 트리거 |
| `GET /health` | 헬스체크 (GET/HEAD 모두 허용, UptimeRobot 연동) |

### 2.4 스케줄러 (APScheduler)

- **수집 주기:** `IntervalTrigger(minutes=30)` — 서버 시작 시점부터 30분 간격
- `TEST_MODE=true`: 수집만 자동 실행, 요약은 수동 트리거 (`POST /api/internal/summarize`)
- `TEST_MODE=false`: 수집 → Claude 요약 자동 실행

### 2.5 뉴스 수집 파이프라인

```
RSS 피드 7개 동시 수집 (limit=200)
  ┌─ The Hacker News      https://feeds.feedburner.com/TheHackersNews
  ├─ BleepingComputer     https://www.bleepingcomputer.com/feed/
  ├─ Krebs on Security    https://krebsonsecurity.com/feed/
  ├─ Dark Reading         https://www.darkreading.com/rss.xml
  ├─ AhnLab ASEC (국내)   https://asec.ahnlab.com/ko/feed/
  ├─ 보안뉴스 (국내)      http://www.boannews.com/media/news_rss.xml
  └─ 데일리시큐 (국내)    https://www.dailysecu.com/rss/allArticle.xml
    ↓
보안 키워드 필터 (제목 기준, 아래 섹션 참고)
    ↓
URL 중복 제거 (DB 기존 URL 대조)
    ↓
제목 유사도 중복 제거 (Jaccard ≥ 0.5, 신규 수집분 내 중복)
    ↓
asyncio.Semaphore(2) 병렬 Claude Haiku API 배치 호출
(입력: 영문/국문 제목)
(출력: 한국어 요약, 위협 레벨 0~4, 국가 코드, 공격자/피해국)
U+FFFD 깨짐 감지 시 자동 재시도 (최대 3회)
    ↓
PostgreSQL (news_articles) 저장
```

**집계 방식:** `country_threat_levels` 캐시 테이블 미사용.
API 요청 시 `news_articles`에서 직접 집계, 날짜 범위는 KST → UTC 명시 변환 후 비교.

---

## 3. 보안 키워드 목록

`backend/app/services/rss.py`의 `SECURITY_KEYWORDS` 세트 기준.
제목에 아래 키워드 중 하나라도 포함된 기사만 수집.

### 3.1 기본 공격/침해 (영문)
```
ransomware, malware, breach, hack, hacked, hacking,
vulnerability, cve, exploit, exploited, phishing,
ddos, attack, cyber, threat, zero-day, 0-day,
backdoor, botnet, apt, data leak, data theft,
supply chain, trojan, spyware, keylogger, rootkit,
credential, bypass, injection, xss, rce,
remote code, privilege escalation, lateral movement,
nation-state, critical infrastructure, industrial control
```

### 3.2 추가 공격 기법 (영문)
```
wiper, infostealer, stealer, cryptojacking, cryptominer,
skimmer, bec, smishing, vishing, spear-phishing, spear phishing,
watering hole, account takeover, credential stuffing,
dark web, darknet, darkweb, espionage, surveillance,
scada, ics, ss7
```

### 3.3 취약점/패치 (영문)
```
patch, security update, emergency patch, patch tuesday,
proof-of-concept, poc exploit, cvss, advisory,
memory corruption, buffer overflow, use-after-free, ssrf,
leaked, exposed, compromised, hijacked, infected, stolen
```

### 3.4 위협 행위자/그룹 (영문)
```
lazarus, kimsuky, andariel, volt typhoon, salt typhoon,
sandworm, fancy bear, cozy bear, nobelium, charming kitten,
mustang panda, threat actor, threat group
```

### 3.5 클라우드/설정 오류 (영문)
```
s3 bucket, misconfiguration, cloud breach, cloud credentials,
exposed bucket, azure ad, google cloud
```

### 3.6 금융/암호화폐 (영문)
```
crypto, bitcoin theft, exchange hack, defi exploit,
wire fraud, bec attack
```

### 3.7 모바일/플랫폼 (영문)
```
android, ios, iphone, ipad, mobile malware, mobile threat,
mobile security, smartphone,
apk, google play, play store, malicious app, fake app,
trojanized app, sideload, testflight,
zero-click, zero click, pegasus, stalkerware,
sim swap, sim swapping, sim hijack,
imsi, stingray, baseband,
webkit, jailbreak, rooting,
mdm bypass, clipper malware, banking trojan,
overlay attack, push bombing, mfa fatigue,
nfc attack, bluetooth exploit, adware, dropper
```

### 3.8 국문 기본
```
랜섬웨어, 악성코드, 해킹, 해커, 취약점, 침해,
피싱, 사이버, 보안, 위협, 공격, 유출, 침투,
백도어, 봇넷, 스파이웨어, 크리덴셜, 정보탈취,
디도스, 제로데이, 원격코드실행, 권한상승, 공급망, 국가배후, 기반시설
```

### 3.9 국문 추가
```
스미싱, 보이스피싱, 큐싱, 스피어피싱,
개인정보, 정보유출, 계정탈취, 탈취,
다크웹, 사칭, 암호화폐, 가상자산, 내부자,
패치, 보안패치, 긴급패치
```

### 3.10 국문 모바일
```
모바일, 스마트폰, 악성앱, 문자사기,
심스와핑, 소액결제 사기, 원격제어앱,
페가수스, 앱스토어 악성, 구글플레이 악성
```

---

## 4. 배포 구성

| 서비스 | 플랫폼 | 비고 |
|--------|--------|------|
| 프론트엔드 | Vercel | Git push 자동 배포 |
| 백엔드 + 스케줄러 | Render | Docker 컨테이너, 자동 배포 |
| 데이터베이스 | Supabase (PostgreSQL) | 무료 티어, Session Pooler (IPv4) |
| 환경변수 | Render / Vercel 대시보드 | `.env` 로컬 전용 |
| 헬스모니터 | UptimeRobot | `HEAD /health` 5분 간격 |

**Supabase 연결:** Session Pooler (port 5432) 사용 — Render 무료 티어는 IPv6 미지원이므로 IPv4 호환 방식 필수.

---

## 5. 환경변수 목록

```
# 백엔드 (Render)
DATABASE_URL=postgresql://postgres:...@...supabase.com:5432/postgres
CLAUDE_API_KEY=sk-ant-...
INTERNAL_API_KEY=...
TEST_MODE=false          # true 시 Claude 요약 자동 실행 안 함

# 프론트엔드 (Vercel)
NEXT_PUBLIC_API_BASE_URL=https://ah-cha-cha.onrender.com
```

---

## 6. 보안 고려사항

- Claude API 키, DB URL 등 모든 시크릿은 환경변수로만 관리 (`.env` 미커밋)
- 내부 수집·요약 엔드포인트 (`/api/internal/*`)는 `X-Internal-Key` 헤더 인증
- CORS: 프론트엔드 도메인만 허용
- Vercel 개발 툴바 비활성화 (`frontend/vercel.json`)
