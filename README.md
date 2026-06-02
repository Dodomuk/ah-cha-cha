# 아차차 (Ah-Cha-Cha)

> **아는 순간 차이 나는 차세대 글로벌 증시**
> *World Markets, Visualized*

전 세계 30개국 주요 증시 등락률을 실시간 세계 지도로 시각화하는 서비스.
어느 나라 주식이 오르고 내렸는지 지도 색상만으로 즉시 파악할 수 있다.

**라이브 서비스:** https://ahchacha.com
**레거시 (보안 대시보드):** https://ahchacha.com/legacy

---

## 어떻게 동작하는가

```
[yfinance (Yahoo Finance)]
    ↓ 15분 주기 자동 수집
[백엔드 스케줄러 (APScheduler)]
    ↓ 30개국 주요 지수 upsert
[PostgreSQL (Supabase)]
    ↓ 국가별 등락률 스냅샷
[FastAPI REST API]
    ↓
[Next.js 프론트엔드 (Vercel)]
    ↓
[D3.js + HTML Canvas 세계 지도]
    ↓
사용자
```

### 수집 (yfinance)

30개국 주요 지수를 15분 주기로 자동 수집한다. 별도 API 키 불필요.

| 지역 | 국가 (지수) |
|------|------------|
| 북미 | 미국 (S&P 500), 캐나다 (TSX), 멕시코 (IPC) |
| 남미 | 브라질 (IBOVESPA), 아르헨티나 (MERVAL) |
| 유럽 | 영국 (FTSE 100), 독일 (DAX), 프랑스 (CAC 40), 이탈리아 (FTSE MIB), 스페인 (IBEX 35), 네덜란드 (AEX), 스위스 (SMI), 스웨덴 (OMX 30), 폴란드 (WIG20), 터키 (BIST 100) |
| 아시아 | 일본 (Nikkei 225), 중국 (Shanghai), 홍콩 (Hang Seng), 한국 (KOSPI), 대만 (TAIEX), 인도 (NIFTY 50), 싱가포르 (STI), 말레이시아 (KLCI), 인도네시아 (IDX), 태국 (SET), 베트남 (VN-Index), 필리핀 (PSEi) |
| 중동/아프리카 | 사우디 (TASI), 남아공 (JSE Top 40) |
| 오세아니아 | 호주 (ASX 200) |

### 지도 시각화

- D3.js(`geoNaturalEarth1`)로 GeoJSON 투영, HTML Canvas로 렌더링
- 등락률에 따라 국가를 **초록(상승) / 빨강(하락) / 회색(데이터 없음)** 으로 채색
- 등락폭이 클수록 색상 진해짐 (±3% 기준 최대 채도)
- 국가 클릭 시 지수명, 현재값, 등락률, 30일 스파크라인, 장 마감 여부 표시
- 모바일: 바텀시트 UI, 터치 이벤트 지원
- PWA 지원 (홈 화면 추가)
- 1분 주기 자동 새로고침

### 장 마감 여부

각 시장의 UTC 기준 운영 시간을 기반으로 `is_open` 여부를 판단한다.
마감된 시장은 마지막 종가 기준으로 등락률을 표시한다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js (App Router), D3.js, HTML Canvas, React Query, Zustand |
| 백엔드 | Python, FastAPI, APScheduler, SQLAlchemy 2.0 |
| 데이터 | yfinance (Yahoo Finance, 무료) |
| 데이터베이스 | PostgreSQL (Supabase) |
| 프론트 배포 | Vercel |
| 백엔드 배포 | Render (Docker) |
| DNS / CDN | Cloudflare |

---

## 로컬 개발 환경 설정

### 사전 요구사항

- Node.js 18+
- Python 3.12+
- Docker Desktop

### 1. 저장소 클론

```bash
git clone https://github.com/Dodomuk/ah-cha-cha.git
cd ah-cha-cha
```

### 2. 백엔드 설정

```bash
cd backend
cp .env.example .env
```

`backend/.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ahchacha
INTERNAL_API_KEY=dev-internal-key
TEST_MODE=true
```

```bash
docker compose up -d
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. 프론트엔드 설정

```bash
cd frontend
```

`frontend/.env.local`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속.

### 4. 시장 데이터 수동 수집

```bash
curl -X POST http://localhost:8000/api/internal/market/fetch \
  -H "X-Internal-Key: dev-internal-key"
```

---

## 배포 구성

| 서비스 | 용도 | 플랜 |
|--------|------|------|
| Vercel | 프론트엔드 | 무료 |
| Render | 백엔드 (Docker) | 무료 |
| Supabase | PostgreSQL | 무료 |
| Cloudflare | DNS / CDN / SSL | 무료 |

### 환경 변수

**Render (백엔드):**

| Key | 설명 |
|-----|------|
| `DATABASE_URL` | Supabase Session Pooler URI (`?sslmode=require` 포함) |
| `INTERNAL_API_KEY` | 내부 API 보호 키 (임의 랜덤 값) |
| `TEST_MODE` | `false` (운영 시) |

**Vercel (프론트엔드):**

| Key | 설명 |
|-----|------|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.ahchacha.com` |

### Render 슬립 방지

Render 무료 플랜은 15분 무요청 시 슬립된다.
[UptimeRobot](https://uptimerobot.com)에서 `/health` 엔드포인트를 5분마다 ping하도록 설정한다.

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 서버 상태 확인 |
| GET | `/api/market/countries` | 전체 국가 증시 스냅샷 (지도용) |
| GET | `/api/market/country/{code}` | 특정 국가 스냅샷 + 30일 이력 |
| POST | `/api/internal/market/fetch` | 시장 데이터 수동 수집 트리거 |

내부 API(`/internal/*`)는 `X-Internal-Key` 헤더 인증 필요.

---

## 레거시 서비스 (/legacy)

`ahchacha.com/legacy`에서 기존 글로벌 사이버 보안 위협 인텔리전스 대시보드를 제공한다.

- 보안 뉴스 RSS 수집 (7개 매체, 30분 주기)
- Claude Haiku API로 한국어 요약 + 위협 레벨 분류
- 세계 지도에 국가별 위협 수준 시각화

---

## 월 운영 비용

| 항목 | 비용 |
|------|------|
| yfinance (Yahoo Finance) | $0 (무료) |
| Render 백엔드 | $0 (무료) |
| Supabase DB | $0 (무료) |
| Vercel 프론트 | $0 (무료) |
| Cloudflare | $0 (무료) |
| **합계** | **$0/월** |

---

## 설계 문서

- [아키텍처](docs/architecture.md)
- [DB 스키마](docs/db-schema.md)
- [API 명세](docs/api-spec.md)
- [로컬 개발 가이드](docs/DEV_START.md)
