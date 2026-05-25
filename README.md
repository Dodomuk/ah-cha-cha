# 아차차 (Ah-Cha-Cha)

> **아는 순간 차이 나는 차세대 보안 인텔리전스**
> *Security Intelligence, Visualized*

전 세계 사이버 보안 위협을 실시간으로 시각화하는 인터랙티브 세계 지도 서비스.
매일 수집되는 보안 뉴스를 AI가 한국어로 요약하고, 국가별 위협 수준을 지도에 색깔로 표시한다.

**라이브 서비스:** https://ah-cha-cha.vercel.app

---

## 어떻게 동작하는가

```
[RSS 피드 4종]
    ↓ 매일 06:00 KST 자동 수집
[백엔드 스케줄러 (APScheduler)]
    ↓ 중복 제거 후 신규 기사 저장
[PostgreSQL (Supabase)]
    ↓ Claude Haiku API 요약 요청 (동시 3건)
[Claude Haiku API]
    ↓ 한국어 요약 + 위협 레벨(0~4) + 국가 코드 반환
[PostgreSQL]
    ↓ 국가별 최고 위협 레벨 스냅샷 생성
[FastAPI REST API]
    ↓
[Next.js 프론트엔드 (Vercel)]
    ↓
[D3.js + HTML Canvas 세계 지도]
    ↓
사용자
```

### 수집 (RSS)

4개의 보안 전문 매체 RSS를 매일 06:00 KST에 자동 수집한다.

| 매체 | 도메인 |
|------|--------|
| The Hacker News | thehackernews.com |
| BleepingComputer | bleepingcomputer.com |
| Krebs on Security | krebsonsecurity.com |
| Dark Reading | darkreading.com |

### AI 요약 (Claude Haiku)

수집된 기사 제목을 Claude Haiku(`claude-haiku-4-5-20251001`)로 분석한다. 기사 본문 없이 제목만으로 처리해 API 비용을 최소화한다.

각 기사마다 아래를 추출한다:
- **한 줄 요약 제목** (한국어, 50자 이내)
- **사건 개요** (한국어, 3~5문장)
- **피해/영향** (한국어, 2~3문장)
- **위협 레벨** (0~4 정수)
- **관련 국가** (ISO 3166-1 alpha-2 코드 배열)

### 위협 레벨 기준

| 레벨 | 이름 | 기준 |
|------|------|------|
| 4 | Critical | 국가기반시설 공격, 사이버전, 대규모 랜섬웨어 |
| 3 | High | 금융기관/기업 침해, 대규모 데이터 유출 |
| 2 | Medium | 소규모 해킹, 데이터 유출, 취약점 악용 |
| 1 | Low | 보안 패치 권고, 취약점 발견, 경미한 피싱 |
| 0 | None | 보안과 무관하거나 지도에 표시하지 않음 |

지도에는 국가별 **최근 7일(168시간) 내 최고 위협 레벨**이 반영된다.

### 지도 시각화

- D3.js(`geoNaturalEarth1`)로 GeoJSON 투영, HTML Canvas로 렌더링
- 위협 레벨에 따라 국가를 빨강/주황/노랑/연두/회색으로 채색
- 데이터 없는 국가는 클릭 비활성화
- 국가 클릭 시 글래스모피즘 팝업으로 AI 요약 기사 목록 표시

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js (App Router), D3.js, HTML Canvas, React Query, Zustand |
| 백엔드 | Python, FastAPI, APScheduler, SQLAlchemy 2.0 |
| AI | Claude Haiku API (`claude-haiku-4-5-20251001`) |
| 데이터베이스 | PostgreSQL (Supabase) |
| 프론트 배포 | Vercel |
| 백엔드 배포 | Render (Docker) |

---

## 로컬 개발 환경 설정

### 사전 요구사항

- Node.js 18+
- Python 3.12+
- Docker Desktop

### 1. 저장소 클론

```bash
git clone https://github.com/[username]/ah-cha-cha.git
cd ah-cha-cha
```

### 2. 백엔드 설정

```bash
cd backend
cp .env.example .env  # 또는 아래 내용으로 직접 생성
```

`backend/.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ahchacha
CLAUDE_API_KEY=sk-ant-api03-...
INTERNAL_API_KEY=dev-internal-key
TEST_MODE=true
```

```bash
# DB 실행
docker compose up -d

# 의존성 설치 및 서버 실행
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

### 4. 뉴스 수집 수동 트리거 (TEST_MODE)

`TEST_MODE=true`일 때는 자동 요약이 비활성화되어 API 크레딧을 아낄 수 있다.

```bash
# RSS 수집만 (무료)
curl -X POST http://localhost:8000/api/internal/collect \
  -H "X-Internal-Key: dev-internal-key"

# AI 요약 (Claude API 크레딧 사용)
curl -X POST http://localhost:8000/api/internal/summarize \
  -H "X-Internal-Key: dev-internal-key"
```

---

## 배포 구성

| 서비스 | 용도 | 플랜 |
|--------|------|------|
| Vercel | 프론트엔드 | 무료 |
| Render | 백엔드 (Docker) | 무료 |
| Supabase | PostgreSQL | 무료 |

### 환경 변수

**Render (백엔드):**

| Key | 설명 |
|-----|------|
| `DATABASE_URL` | Supabase Session Pooler URI (`?sslmode=require` 포함) |
| `CLAUDE_API_KEY` | Anthropic API 키 |
| `INTERNAL_API_KEY` | 내부 API 보호 키 (임의 랜덤 값) |
| `TEST_MODE` | `false` (운영 시 자동 요약 활성화) |

**Vercel (프론트엔드):**

| Key | 설명 |
|-----|------|
| `NEXT_PUBLIC_API_BASE_URL` | Render 서비스 URL |

### Render 슬립 방지 (무료 플랜)

Render 무료 플랜은 15분 무요청 시 슬립된다. 매일 06:00 KST 자동 수집이 동작하려면 [UptimeRobot](https://uptimerobot.com) 무료 계정에서 `/health` 엔드포인트를 5분마다 ping하도록 설정한다.

---

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/health` | 서버 상태 확인 |
| GET | `/api/countries` | 전체 국가 위협 레벨 목록 |
| GET | `/api/news/recent` | 최근 7일 AI 요약 기사 목록 |
| GET | `/api/news/country/{code}` | 특정 국가 기사 목록 |
| POST | `/api/internal/collect` | RSS 수집 수동 트리거 |
| POST | `/api/internal/summarize` | AI 요약 수동 트리거 |

내부 API(`/internal/*`)는 `X-Internal-Key` 헤더 인증 필요.

---

## 월 운영 비용 (MVP)

| 항목 | 비용 |
|------|------|
| Claude Haiku API (1회/일, ~75건) | ~$4~5 |
| Render 백엔드 | $0 (무료) |
| Supabase DB | $0 (무료) |
| Vercel 프론트 | $0 (무료) |
| **합계** | **~$4~5/월** |

---

## 설계 문서

- [PRD](prd.md) — 제품 요구사항
- [아키텍처](docs/architecture.md)
- [DB 스키마](docs/db-schema.md)
- [AI 프롬프트 명세](docs/ai-prompt-spec.md)
- [API 명세](docs/api-spec.md)
