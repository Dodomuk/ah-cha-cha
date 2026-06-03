# 아차차 (Ah-Cha-Cha)

> **실시간 글로벌 속보 대시보드**
> *Real-time Breaking News, Visualized on a World Map*

전 세계 주요 뉴스 속보를 실시간으로 수집하고, 세계 지도 위에 시각화하는 서비스.
위협 수준별로 색상 표시되는 속보들을 한눈에 파악할 수 있다.

**라이브 서비스:** https://ahchacha.com
**레거시 (보안 대시보드):** https://ahchacha.com/legacy

---

## 주요 기능

### 메인 서비스: 실시간 속보 대시보드
- **실시간 뉴스 수집**: RSS 피드 및 뉴스 API에서 글로벌 속보 자동 수집
- **자동 영어 번역**: Claude API로 모든 기사를 자동으로 영어로 번역
- **세계 지도 시각화**: D3.js를 활용한 인터랙티브 세계 지도 표시
- **위협 수준 표시**: 기사별 위협 수준(1~4)을 색상과 아이콘으로 표시
- **실시간 업데이트**: WebSocket + Polling으로 새 속보 실시간 스트리밍
- **UX 기능**:
  - 20초 자동 재개 (기사 클릭 후)
  - 새 속보 도착 시 헤더 스피너 애니메이션
  - 단어 2-3개씩 묶어 표시 (애니메이션)
  - 상대 시간 표시 ("2h ago", "3d ago")
  - 3일 이력 + 날짜별 그룹화 (Today/Yesterday/2 days ago)
  - 클릭 시 자동 재생 즉시 정지

### 레거시 서비스: 보안 뉴스 대시보드 (/legacy)
- 보안 RSS 피드 수집 (7개 매체)
- Claude Haiku로 한국어 요약 및 위협 분류
- 국가별 위협 수준 세계 지도 시각화

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 16+ (App Router), React, D3.js, TypeScript |
| 백엔드 | Python 3.9+, FastAPI, SQLAlchemy 2.0, APScheduler |
| 데이터베이스 | PostgreSQL (Supabase) |
| 실시간 | WebSocket (FastAPI), Polling Fallback |
| AI/번역 | Claude API (Haiku 모델) |
| 배포 | Vercel (프론트엔드), Render (백엔드) |
| DNS/CDN | Cloudflare |

---

## 데이터 흐름

```
[뉴스 소스 (RSS/API)]
    ↓ 자동 수집
[백엔드 스케줄러]
    ├─ 한국어 감지
    ├─ Claude API로 영어 번역
    └─ 키워드 추출
    ↓
[PostgreSQL (Supabase)]
    ↓
[FastAPI REST API + WebSocket]
    ├─ GET /api/events (기사 목록)
    └─ WS /ws (실시간 스트리밍)
    ↓
[Next.js 프론트엔드 (Vercel)]
    ├─ D3.js 세계 지도 렌더링
    ├─ 실시간 속보 업데이트
    └─ 사용자 인터랙션
    ↓
사용자
```

---

## 로컬 개발 환경 설정

### 사전 요구사항

- Node.js 18+
- Python 3.9+
- Docker Desktop
- PostgreSQL 또는 Supabase 계정

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
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ahchacha
ANTHROPIC_API_KEY=your_claude_api_key
CORS_ORIGINS=["http://localhost:3000"]
```

```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 프론트엔드 설정

```bash
cd frontend
npm install
```

`frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속.

---

## 배포

### Vercel (프론트엔드)
- GitHub 연동으로 자동 배포
- `main` 브랜치 push 시 자동 빌드 및 배포

### Render (백엔드)
- Docker 기반 배포
- 환경 변수 설정 후 배포

환경 변수:
- `DATABASE_URL`: Supabase PostgreSQL 연결 문자열
- `ANTHROPIC_API_KEY`: Claude API 키
- `CORS_ORIGINS`: 허용할 프론트엔드 도메인

### Supabase (데이터베이스)
- PostgreSQL 무료 플랜 사용
- Session Pooler로 연결 안정성 확보

---

## API 엔드포인트

### 메인 서비스

| Method | Path | 설명 |
|--------|------|------|
| GET | `/` | 헬스 체크 |
| GET | `/health` | 상태 확인 |
| GET | `/api/events` | 최신 속보 목록 (쿼리: limit, language) |
| WS | `/ws` | 실시간 속보 WebSocket 스트리밍 |

### 레거시 서비스

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/countries` | 국가별 위협 레벨 |
| GET | `/api/countries/{code}/news` | 특정 국가 보안 기사 |
| GET | `/api/news/latest` | 최신 보안 기사 |
| POST | `/api/internal/collect` | RSS 수집 트리거 (인증 필요) |

---

## 월 운영 비용

| 항목 | 비용 |
|------|------|
| Vercel | $0 (무료 플랜) |
| Render | $0 (무료 플랜) |
| Supabase | $0 (무료 플랜) |
| Cloudflare | $0 (무료 플랜) |
| 도메인 (ahchacha.com) | 유료 |
| Claude API | 사용량 기반 |
| **합계** | **$5~20/월** (API 사용량에 따라) |

---

## 설계 문서

- [시스템 아키텍처](docs/architecture.md)
- [데이터베이스 스키마](docs/db-schema.md)
- [API 명세](docs/api-spec.md)
- [로컬 개발 가이드](docs/DEV_START.md)
- [UI/UX 설계](docs/ui-design.md)
- [AI 프롬프트 명세](docs/ai-prompt-spec.md)

---

## 라이센스

MIT
