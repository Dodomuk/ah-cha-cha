# 아차차 — 시스템 아키텍처

**버전:** 0.2
**작성일:** 2026-05-21

---

## 1. 전체 구조 개요

```
┌─────────────────────────────────────────────────────────┐
│                        사용자 브라우저                      │
│           Next.js + D3.js + Canvas (Vercel)              │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API (HTTPS)
┌───────────────────────▼─────────────────────────────────┐
│                   FastAPI 백엔드 (Railway)                 │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│   │  API Router  │  │  Scheduler   │  │  News Worker  │  │
│   │ /countries  │  │  APScheduler │  │  GDELT 수집   │  │
│   │ /news       │  │  6:00~24:00  │  │  Claude 요약  │  │
│   └─────────────┘  └──────────────┘  └───────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
┌──────────────┐ ┌─────────────┐  ┌──────────────────┐
│  PostgreSQL  │ │  GDELT API  │  │  Claude Haiku API │
│  (Supabase)  │ │  (무료)     │  │  (뉴스 요약/분류) │
└──────────────┘ └─────────────┘  └──────────────────┘
```

---

## 2. 컴포넌트별 역할

### 2.1 프론트엔드 (Next.js + Vercel)

| 컴포넌트 | 역할 |
|----------|------|
| `WorldMap` | D3.js GeoJSON 파싱 + Canvas 렌더링 총괄 |
| `MapCanvas` | HTML Canvas 위에 국가 폴리곤 드로잉, 네온 글로우 효과 |
| `CountryLayer` | 위협 레벨 → fill 색상 매핑, 호버/클릭 이벤트 처리 |
| `CountryPanel` | 클릭한 국가의 뉴스 목록 슬라이드 패널 |
| `NewsCard` | 뉴스 제목, AI 요약, 원문 링크 카드 |
| `GlobalFeed` | 전체 최신 뉴스 피드 (P2) |

**렌더링 전략:**
- 지도 페이지: `getStaticProps` + ISR (revalidate: 120초) — SEO + 성능
- 국가 뉴스 패널: Client-side fetch (React Query)

**상태 관리:** React Query (서버 상태) + Zustand (UI 상태 — 선택된 국가, 패널 오픈 여부)

### 2.2 지도 렌더링 파이프라인

```
GeoJSON 데이터 (Natural Earth, 번들 포함)
    ↓
D3.js geoNaturalEarth1 projection 적용
    ↓
Canvas 2D Context에 국가 경계 path 드로잉
    ↓
위협 레벨별 fillStyle 적용
    ↓
shadowBlur + shadowColor로 네온 글로우 효과
    ↓
requestAnimationFrame으로 호버 애니메이션 처리
```

### 2.3 백엔드 API (FastAPI + Railway)

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/countries` | 전체 국가 위협 레벨 맵 반환 |
| `GET /api/countries/{code}/news` | 특정 국가 뉴스 목록 반환 |
| `GET /api/news/latest` | 전체 최신 뉴스 피드 반환 |
| `POST /api/internal/collect` | 수동 수집 트리거 (내부용) |

### 2.4 스케줄러 (APScheduler)

- 매일 06:00 ~ 24:00, 2시간 간격 실행 (9회/일)
- 실행 흐름: GDELT 수집 → 필터링 → Claude 요약 → DB 저장

### 2.5 뉴스 수집 파이프라인

```
GDELT API 호출
    ↓
보안 키워드 필터링
(cyber, hack, breach, ransomware, vulnerability...)
    ↓
중복 제거 (URL 기준)
    ↓
Claude Haiku API 배치 호출
(입력: 뉴스 제목 + 본문 요약)
(출력: 한국어 요약, 위협 레벨 0~4, 국가 코드)
    ↓
PostgreSQL 저장
    ↓
국가별 위협 레벨 집계 캐시 갱신
```

---

## 3. 배포 구성

| 서비스 | 플랫폼 | 비고 |
|--------|--------|------|
| 프론트엔드 | Vercel | Git push 자동 배포, ISR 지원 |
| 백엔드 + 스케줄러 | Railway | Docker 컨테이너 |
| 데이터베이스 | Supabase (PostgreSQL) | 무료 티어 |
| 환경변수 | Railway / Vercel 대시보드 | `.env` 로컬 전용 |

---

## 4. 환경변수 목록

```
# 백엔드 (Railway)
DATABASE_URL=postgresql://...
CLAUDE_API_KEY=sk-ant-...
GDELT_BASE_URL=https://api.gdeltproject.org/api/v2
INTERNAL_API_KEY=...

# 프론트엔드 (Vercel)
NEXT_PUBLIC_API_BASE_URL=https://api.ah-cha-cha.com
```

> Mapbox 토큰 불필요 — D3.js + Canvas 자체 렌더링으로 외부 지도 API 의존성 없음.

---

## 5. 보안 고려사항

- Claude API 키, DB URL 등 모든 시크릿은 환경변수로만 관리
- 내부 수집 엔드포인트 (`/api/internal/*`)는 API Key 인증으로 보호
- CORS: 프론트엔드 도메인만 허용
- Rate limiting: 외부 API 엔드포인트에 적용 (추후)
