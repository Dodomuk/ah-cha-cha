# 아차차 — 시스템 아키텍처

**버전:** 0.3
**작성일:** 2026-05-21
**최종 수정:** 2026-05-26

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
│   │ /news       │  │  06:00 KST   │  │  Claude 요약  │  │
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
| `MapTooltip` | 마우스 호버 시 국가명 툴팁 (글로우모피즘) |
| `DateRangeFilter` | 오늘/3일/7일 날짜 필터 (좌하단 고정) |
| `CountryPanel` | 국가 클릭 시 우측 슬라이드 패널 (뉴스 목록) |
| `NewsCard` | 뉴스 제목, AI 요약(무슨 일/영향), 원문 링크 카드 |
| `DailyReportPanel` | 우하단 플로팅 버튼 + 일일 리포트 사이드 패널, .txt 다운로드 |
| `Header` | 로고, 마지막 갱신 시각 |

**상태 관리:**
- React Query v5 — 서버 상태 (countries, news). `keepPreviousData`로 날짜 전환 중 이전 지도 유지.
- Zustand — UI 상태 (선택된 국가, 패널 오픈 여부, `hours` 필터)

**날짜 필터 동작:**
- Zustand의 `hours` 값이 변경되면 React Query 쿼리 키(`['countries', hours]`)가 바뀌어 새 데이터 요청
- `keepPreviousData`: 로딩 중 이전 지도 유지 + "지도 갱신 중..." 오버레이 표시
- `WorldMap`의 `drawMap`은 `threatDataRef`를 통해 최신 데이터를 읽어 렌더링

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
| `GET /api/countries?hours=N` | 전체 국가 위협 레벨 맵 반환 (news_articles 직접 집계) |
| `GET /api/countries/{code}/news?hours=N` | 특정 국가 뉴스 목록 반환 |
| `GET /api/news/latest` | 전체 최신 뉴스 피드 반환 (최근 24h) |
| `POST /api/internal/collect` | 수동 수집 트리거 (X-Internal-Key 인증) |
| `POST /api/internal/summarize` | 미처리 기사 수동 요약 트리거 (TEST_MODE용) |
| `GET /health` | 헬스체크 (GET/HEAD 모두 허용, UptimeRobot 연동) |

### 2.4 스케줄러 (APScheduler)

- 매일 **06:00 KST** 1회 실행
- `TEST_MODE=true`: 수집만 자동 실행, 요약은 수동 트리거
- `TEST_MODE=false`: 수집 → Claude 요약 자동 실행

### 2.5 뉴스 수집 파이프라인

```
RSS 피드 7개 동시 수집 (limit=100)
  ┌─ The Hacker News (국제)
  ├─ BleepingComputer (국제)
  ├─ Krebs on Security (국제)
  ├─ Dark Reading (국제)
  ├─ AhnLab ASEC (국내)
  ├─ 보안뉴스 (국내)
  └─ 데일리시큐 (국내)
    ↓
중복 제거 (URL 기준)
    ↓
asyncio.Semaphore(3) 병렬 Claude Haiku API 배치 호출
(입력: 뉴스 제목만)
(출력: 한국어 요약, 위협 레벨 0~4, 국가 코드)
    ↓
PostgreSQL (news_articles) 저장
```

**집계 방식:** `country_threat_levels` 캐시 테이블 미사용.
`GET /api/countries?hours=N` 요청 시 `news_articles`에서 직접 집계 (hours 파라미터 기준).

---

## 3. 배포 구성

| 서비스 | 플랫폼 | 비고 |
|--------|--------|------|
| 프론트엔드 | Vercel | Git push 자동 배포 |
| 백엔드 + 스케줄러 | Render | Docker 컨테이너, 자동 배포 |
| 데이터베이스 | Supabase (PostgreSQL) | 무료 티어, Session Pooler (IPv4) |
| 환경변수 | Render / Vercel 대시보드 | `.env` 로컬 전용 |
| 헬스모니터 | UptimeRobot | `HEAD /health` 5분 간격 |

**Supabase 연결:** Session Pooler (port 5432) 사용 — Render 무료 티어는 IPv6 미지원이므로 IPv4 호환 방식 필수.

---

## 4. 환경변수 목록

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

## 5. 보안 고려사항

- Claude API 키, DB URL 등 모든 시크릿은 환경변수로만 관리 (`.env` 미커밋)
- 내부 수집·요약 엔드포인트 (`/api/internal/*`)는 `X-Internal-Key` 헤더 인증
- CORS: 프론트엔드 도메인만 허용
- Vercel 개발 툴바 비활성화 (`frontend/vercel.json`)
