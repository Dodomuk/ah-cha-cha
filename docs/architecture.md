# 아차차 — 시스템 아키텍처

**버전:** 2.0 (Breaking News Dashboard)
**최종 수정:** 2026-06-04

---

## 1. 전체 구조 개요

```
┌────────────────────────────────────────────────────────────┐
│              사용자 브라우저 (Next.js + React)              │
│         https://ahchacha.com (Vercel CDN)                  │
│  - D3.js 세계 지도 렌더링                                    │
│  - 실시간 속보 카드 애니메이션                                │
│  - WebSocket + Polling 연결                                 │
└────────────────────┬─────────────────────────────────────┘
                     │ REST API + WebSocket (HTTPS)
┌────────────────────▼─────────────────────────────────────┐
│         FastAPI 백엔드 (Render Docker)                    │
│       https://ah-cha-cha.onrender.com                     │
│                                                            │
│  ┌──────────────────┐      ┌──────────────────────────┐  │
│  │   API Routes     │      │   Scheduler + WebSocket  │  │
│  │ GET /api/events  │      │   - 실시간 뉴스 수집        │  │
│  │ WS /ws           │      │   - 자동 번역 (Claude)     │  │
│  │ POST /internal/* │      │   - 브라우저로 스트리밍    │  │
│  └──────────────────┘      └──────────────────────────┘  │
│                                                            │
│  ┌──────────────────┐      ┌──────────────────────────┐  │
│  │  SQLAlchemy ORM  │      │     AI 모듈                │  │
│  │  - 모델 정의      │      │  - Claude API 통합         │  │
│  │  - 데이터 조작    │      │  - 한국어 감지 & 번역      │  │
│  │  - 키워드 추출    │      │  - 카테고리 분류          │  │
│  └──────────────────┘      └──────────────────────────┘  │
└────────────────────┬─────────────────────────────────────┘
                     │ 데이터 계층
        ┌────────────┼──────────────┐
        ▼            ▼              ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────┐
│  PostgreSQL  │ │ Redis Cache │ │  외부 API    │
│  (Supabase)  │ │  (선택)      │ │  (뉴스 소스) │
└──────────────┘ └─────────────┘ └──────────────┘
```

---

## 2. 메인 서비스 — 실시간 속보 대시보드

### 2-1. 데이터 흐름

```
[뉴스 소스]
  ├─ RSS 피드
  ├─ API 통합
  └─ 웹 스크래핑
    ↓
[백엔드 수집기]
  ├─ 중복 검사
  ├─ 언어 감지 (한국어 여부)
  └─ 원본 저장
    ↓
[Claude API 번역]
  ├─ 한국어만 영어로 번역
  ├─ 제목 + 요약 번역
  └─ 번역 캐싱
    ↓
[키워드 추출]
  ├─ 고유명사 추출
  ├─ 국가 코드 매핑
  └─ 카테고리 분류
    ↓
[NewsArticle 저장]
  ├─ title (영어)
  ├─ summary (영어)
  ├─ keywords
  ├─ threat_level (1-4)
  ├─ country_codes
  └─ collected_at
    ↓
[API 응답]
  GET /api/events (HTTP)
    └─ 최신 50개 기사 + 번역
  WS /ws (WebSocket)
    └─ 새 속보 실시간 스트리밍
    ↓
[프론트엔드 렌더링]
  ├─ 팝업 카드 애니메이션
  ├─ 단어별 reveal (2-3개 묶음)
  ├─ 상대 시간 표시
  ├─ 자동 슬라이드쇼 (12초 간격)
  └─ 세계 지도 마커
```

### 2-2. 수집 및 처리

**뉴스 수집 스케줄:**
- 주기: 5분 (또는 설정 가능)
- 소스: RSS 피드, API 통합
- 중복 제거: URL 기반

**번역 프로세스:**
1. `is_korean(text)` - 한국어 감지 (Unicode U+AC00-U+D7A3)
2. 한국어 있으면만 `translate_to_english()` 호출
3. Claude Haiku 모델로 번역 (최대 토큰: 1024)
4. 번역 실패 시 원본 반환

**위협 수준 판단:**
- 1: 낮음 (일반 뉴스)
- 2: 중간 (국제 분쟁, 재난)
- 3: 높음 (사이버 공격, 테러)
- 4: 매우 높음 (대규모 사건)

### 2-3. 실시간 업데이트

**WebSocket 연결:**
```
프론트엔드
  ↓
브라우저: 수동으로 /ws 연결 시도
  ↓
백엔드: ConnectionManager에 등록
  ↓
새 이벤트 발생 시:
  └─ `manager.broadcast()` → 모든 클라이언트에 푸시
     {"type": "new_event", "event": {...}}
```

**Polling Fallback:**
- WebSocket 실패 시 자동으로 30초 주기 polling 시작
- GET /api/events?limit=50

### 2-4. 프론트엔드 UX 기능

| 기능 | 구현 |
|------|------|
| 20초 자동 재개 | 기사 클릭 → isPlaying=false → resumeTimer 20초 → 자동 재개 |
| 스피너 애니메이션 | 새 속보 도착 → showNewEventBadge=true → 3초 후 false |
| 단어 묶음 애니메이션 | `chunkWords(words, 2)` → 250ms/150ms 간격 |
| 상대 시간 | `getRelativeTime(date)` → "2h ago", "3d ago" |
| 3일 이력 + 그룹화 | `getDateKey(date)` → "Today/Yesterday/2 days ago" |
| 즉시 정지 | 클릭 → `slideshowIntervalRef` 즉시 정지 |

---

## 3. 프론트엔드 아키텍처

### 3-1. 핵심 컴포넌트

**page.tsx (메인 대시보드)**
- State: events[], currentEventIndex, isPlaying, displayedTitleWords, displayedSummaryWords
- WebSocket 연결 및 관리
- 단어별 애니메이션 (useEffect)
- 자동 슬라이드쇼 (SLIDESHOW_INTERVAL = 12000ms)

**WorldMap (레거시에서 추가됨)**
- D3.js geoMercator 투영
- TopoJSON 국가 경계 렌더링
- SVG 마커 위치 지정
- 색상 기반 위협 수준 표시

**UI 라이브러리**
- CSS-in-JS: 인라인 스타일
- 애니메이션: @keyframes (slideDown, fadeInWord, spin, pulse)
- Glassmorphism: backdrop-filter blur(10px)

### 3-2. 실시간 연결 로직

```typescript
// 프론트엔드 초기 연결
useEffect(() => {
  const connectWebSocket = () => {
    const ws = new WebSocket(wsUrl)
    ws.onopen = () => console.log('Connected')
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'new_event') {
        setEvents(prev => [msg, ...prev].slice(0, 50))
        setShowNewEventBadge(true)
      }
    }
    ws.onerror = () => startPolling()
  }
  connectWebSocket()
}, [])
```

---

## 4. 백엔드 아키텍처

### 4-1. 핵심 모듈

**app/main.py**
- FastAPI 앱 초기화
- CORS 설정
- 라우터 등록
- 스케줄러 시작

**app/api/routes.py**
```python
# 주요 엔드포인트
GET /api/events
  - 최신 기사 반환 (limit=50 기본)
  - 자동 번역 적용
  - 키워드 포함

WS /ws
  - 실시간 스트리밍
  - ConnectionManager로 클라이언트 관리
  - broadcast() → 모든 클라이언트에 푸시

# 번역 함수
translate_to_english(text: str) → str
  - is_korean() 확인
  - Claude API 호출
  - 캐싱 (선택)

extract_keywords(text: str) → list[str]
  - 3+ 글자 고유명사 추출
  - 정규식 기반
```

**app/models/news.py**
```python
class NewsArticle(Base):
    id: UUID
    title: str  # 원본 (한국어일 수 있음)
    summary: str
    category: str
    threat_level: int (1-4)
    country_codes: list[str]
    keywords: list[str]
    collected_at: DateTime
    ai_processed: bool
```

**app/scheduler/jobs.py**
- APScheduler 기반 주기 작업
- 5분마다 뉴스 수집
- 실패 시 재시도 로직

### 4-2. 외부 API 통합

**Claude API (번역)**
```python
client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
message = client.messages.create(
    model="claude-3-5-haiku-20241022",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": "Translate to English: {text}"
    }]
)
```

**뉴스 소스**
- RSS 피드 (feedparser)
- 뉴스 API (requests)
- 웹 스크래핑 (BeautifulSoup)

---

## 5. 데이터베이스

### 5-1. 주요 테이블

**news_articles**
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 기사 고유 ID |
| title | String | 영어 제목 |
| summary | String | 영어 요약 |
| category | String | 뉴스 카테고리 |
| threat_level | Integer | 위협 수준 (1-4) |
| country_codes | Array | 관련 국가 |
| keywords | Array | 추출 키워드 |
| collected_at | DateTime | 수집 시간 |
| ai_processed | Boolean | 처리 완료 여부 |

**legacy_news_articles** (보안 대시보드용)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| source_url | String | 원본 URL |
| summary_title | String | 한국어 제목 |
| summary_what | String | 한국어 요약 |
| threat_level | Integer | 위협도 |
| affected_countries | Array | 영향국가 |

---

## 6. 배포 구성

| 구성 | 서비스 | 비용 |
|------|--------|------|
| 프론트엔드 | Vercel | 무료 |
| 백엔드 | Render (Docker) | 무료 |
| DB | Supabase (PostgreSQL) | 무료 |
| DNS/CDN | Cloudflare | 무료 |

### Render 설정
- Docker 이미지: Python 3.11
- 시작 명령: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- 헬스 체크: GET /health
- 슬립 방지: UptimeRobot → 5분 주기 ping /health

---

## 7. 성능 고려사항

| 항목 | 최적화 |
|------|--------|
| 번역 지연 | 비동기 처리 + 캐싱 |
| WebSocket 연결 | Fallback polling 자동 전환 |
| DB 쿼리 | limit=50 기본, 인덱스 (collected_at) |
| 프론트 애니메이션 | CSS @keyframes (JS 계산 최소화) |
| 번들 크기 | D3.js 제외 (레거시에서만 사용) |

---

## 8. 보안

| 항목 | 조치 |
|------|------|
| API 인증 | 공개 (특수 엔드포인트는 토큰 필요) |
| CORS | Vercel 도메인만 허용 |
| HTTPS | Cloudflare SSL 필수 |
| 환경변수 | Render 시크릿 저장소 사용 |
| 데이터 검증 | Pydantic 스키마 |
