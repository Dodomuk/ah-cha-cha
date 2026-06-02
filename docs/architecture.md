# 아차차 — 시스템 아키텍처

**버전:** 1.0
**최종 수정:** 2026-06-02

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
│   ┌─────────────────┐  ┌──────────────────────────────┐  │
│   │   API Router     │  │        Scheduler              │  │
│   │ /market/...     │  │  Market: 15분 간격             │  │
│   │ /legacy/...     │  │  News: 30분 간격               │  │
│   └─────────────────┘  └──────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼──────────────────┐
        ▼               ▼                  ▼
┌──────────────┐ ┌─────────────┐  ┌──────────────────┐
│  PostgreSQL  │ │  yfinance   │  │  RSS 피드 + Claude │
│  (Supabase)  │ │  (Yahoo Fi) │  │  (레거시 /legacy) │
└──────────────┘ └─────────────┘  └──────────────────┘
```

---

## 2. 메인 서비스 — 전 세계 증시 대시보드

### 2-1. 데이터 흐름

```
yfinance.download(tickers, period="5d")
    ↓ 30개국 지수 일괄 요청
파싱: 현재값, 전일 종가, 등락률(%), 등락폭
    ↓
market_snapshots (DB upsert — country_code 기준)
market_history (일별 OHLCV 누적)
    ↓
GET /api/market/countries → 프론트 지도 렌더링
GET /api/market/country/{code} → 클릭 패널 + 30일 히스토리
```

### 2-2. 수집 스케줄

- **15분 간격** (APScheduler IntervalTrigger)
- yfinance는 API 키 없이 Yahoo Finance 데이터 사용 (무료)
- 다운로드 1회 호출로 전체 30개 티커 일괄 처리

### 2-3. 시장 운영 시간 판단

`market_config.py`에 각 시장별 UTC 기준 open/close 시간 저장.
현재 UTC 시각과 비교해 `is_open: bool` 결정.
자정 넘김(예: 호주 23:00~05:00) 처리 포함.

### 2-4. 지도 컬러 스킴

| 등락률 | 색상 |
|--------|------|
| +3% 이상 | 진초록 `rgb(0,255,100)` |
| +0% ~ +3% | 연초록 (강도 비례) |
| 데이터 없음 | 회색 `#0e1a1a` |
| 0% ~ -3% | 연빨강 (강도 비례) |
| -3% 이하 | 진빨강 `rgb(255,0,0)` |

---

## 3. 레거시 서비스 — 보안 인텔리전스 (/legacy)

`ahchacha.com/legacy`에서 서비스 중. 한국어 전용.

### 3-1. RSS 수집 소스 (7개)

| 매체 | 분류 |
|------|------|
| The Hacker News | 글로벌 |
| BleepingComputer | 글로벌 |
| Krebs on Security | 글로벌 |
| Dark Reading | 글로벌 |
| ASEC Blog (AhnLab) | 국내 |
| 보안뉴스 | 국내 |
| 데일리시큐 | 국내 |

### 3-2. 키워드 필터 (10개 카테고리)

ransomware, APT, vulnerability/CVE, data breach, mobile, finance/crypto, infrastructure, cloud, nation-state, Korea

### 3-3. Claude Haiku 요약

- 모델: `claude-haiku-4-5-20251001`
- 출력: 한국어 제목/사건개요/피해영향 + 위협레벨(0~4) + 국가코드
- 동시 처리: Semaphore(2)
- U+FFFD 버그 대응: 최대 3회 재시도

---

## 4. 인프라

| 구성요소 | 서비스 | 비용 |
|----------|--------|------|
| 프론트엔드 | Vercel (Next.js App Router) | 무료 |
| 백엔드 | Render (Docker, 단일 컨테이너) | 무료 |
| DB | Supabase (PostgreSQL) | 무료 |
| DNS/CDN | Cloudflare | 무료 |
| 도메인 | 가비아 (ahchacha.com) | 유료 |

### DNS 구성

| 레코드 | 값 |
|--------|-----|
| `ahchacha.com` | Vercel (CNAME flattening) |
| `www.ahchacha.com` | Vercel (redirect) |
| `api.ahchacha.com` | Render (CNAME) |

---

## 5. API 엔드포인트 목록

### 증시 (메인)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/market/countries` | 전체 국가 스냅샷 (지도용) |
| GET | `/api/market/country/{code}` | 특정 국가 상세 + 30일 이력 |
| POST | `/api/internal/market/fetch` | 수동 수집 트리거 |

### 보안 (레거시)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/countries` | 국가별 위협 레벨 스냅샷 |
| GET | `/api/countries/{code}/news` | 특정 국가 보안 기사 |
| GET | `/api/news/latest` | 최신 보안 기사 목록 |
| GET | `/api/stats` | 수집 통계 |
| POST | `/api/internal/collect` | RSS 수집 트리거 |
| POST | `/api/internal/summarize` | AI 요약 트리거 |

---

## 6. DB 스키마 요약

### market_snapshots
국가별 최신 지수 스냅샷 (upsert, country_code unique)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| country_code | String(2) | ISO 3166-1 alpha-2 |
| index_name | String | 영문 지수명 |
| index_name_ko | String | 한국어 지수명 |
| ticker | String | yfinance 티커 |
| current_value | Float | 현재값 |
| prev_close | Float | 전일 종가 |
| change_pct | Float | 등락률(%) |
| change_abs | Float | 절대 등락 |
| is_open | Boolean | 장 운영 중 여부 |
| updated_at | DateTime | 마지막 갱신 시각 |

### market_history
일별 OHLCV (스파크라인용)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| country_code | String(2) | |
| date | Date | 날짜 |
| open/high/low/close | Float | OHLC |
| volume | Float | 거래량 |

### news_articles (레거시)
보안 기사 저장. 자세한 스키마는 `db-schema.md` 참조.
