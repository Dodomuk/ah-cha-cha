# API 명세

**버전:** 2.0
**최종 수정:** 2026-06-04

---

## 1. 메인 서비스 API

### 1-1. 헬스 체크

#### GET `/`
서버 상태 확인 (Render 헬스 체크용)

**응답:**
```json
{
  "status": "ok",
  "service": "Ah-Cha-Cha Breaking News API"
}
```

**상태 코드:**
- `200 OK`

---

#### GET `/health`
상세 상태 확인

**응답:**
```json
{
  "status": "ok"
}
```

---

### 1-2. 속보 조회

#### GET `/api/events`
최신 속보 목록 조회

**쿼리 파라미터:**
| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| limit | integer | 50 | 반환 기사 수 (max: 100) |
| category | string | null | 카테고리 필터 |

**예제:**
```bash
GET /api/events?limit=20&category=conflict
```

**응답:**
```json
{
  "events": [
    {
      "id": "a2fec09b-9edf-4c6b-a1ec-1c38a3c23ed5",
      "title": "Russia, supported by international funding, deteriorates national finances",
      "summary": "The Russian government is providing billions in support...",
      "category": "conflict",
      "threat_level": 2,
      "countries": ["RU"],
      "keywords": ["Russia", "Finance", "Conflict"],
      "animation_config": null,
      "collected_at": "2026-06-03T14:25:51.504241+00:00"
    },
    ...
  ]
}
```

**응답 필드:**
| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 기사 고유 ID (UUID) |
| title | string | 기사 제목 (영어, 자동 번역) |
| summary | string | 기사 요약 (영어, 자동 번역) |
| category | string | 카테고리 |
| threat_level | integer | 위협 수준 (1-4) |
| countries | array[string] | 관련 국가 코드 (ISO 3166-1 alpha-2) |
| keywords | array[string] | 추출 키워드 |
| animation_config | object | null (향후 확장용) |
| collected_at | string | 수집 시간 (ISO 8601) |

**상태 코드:**
- `200 OK` - 성공
- `400 Bad Request` - 잘못된 파라미터

---

### 1-3. 실시간 WebSocket

#### WS `/ws`
실시간 속보 스트리밍

**연결:**
```javascript
const ws = new WebSocket('wss://ah-cha-cha.onrender.com/ws')
```

**메시지 형식:**
```json
{
  "type": "new_event",
  "event": {
    "id": "...",
    "title": "Breaking News Title",
    "summary": "News details...",
    ...
  }
}
```

**이벤트 타입:**
- `new_event` - 새 속보 도착

**예제 (JavaScript):**
```javascript
ws.onopen = () => console.log('Connected')
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.type === 'new_event') {
    console.log('New article:', data.event.title)
  }
}
ws.onerror = () => console.log('WebSocket failed, fallback to polling')
```

**Fallback Polling:**
WebSocket 연결 실패 시 자동으로 30초 주기 polling 실행

---

## 2. 레거시 서비스 API (/legacy)

### 2-1. 국가별 위협 수준

#### GET `/api/countries`
모든 국가의 최신 위협 레벨

**응답:**
```json
{
  "countries": [
    {
      "code": "US",
      "threat_level": 2,
      "total_events": 15,
      "latest_at": "2026-06-03T10:00:00Z"
    }
  ]
}
```

---

### 2-2. 국가별 기사

#### GET `/api/countries/{code}/news`
특정 국가의 보안 기사

**경로 파라미터:**
- `code` (string): ISO 3166-1 alpha-2 (예: "US", "KR")

**응답:**
```json
{
  "country": "KR",
  "news": [
    {
      "id": "...",
      "title": "[한국어] 제목",
      "summary": "[한국어] 요약",
      "threat_level": 3,
      "collected_at": "2026-06-03T10:00:00Z"
    }
  ]
}
```

---

## 3. 에러 응답

### 표준 에러 형식

```json
{
  "detail": "Error message",
  "status": 400
}
```

### 일반적인 에러 코드

| 상태 코드 | 설명 |
|----------|------|
| 400 | 잘못된 요청 |
| 404 | 리소스 없음 |
| 500 | 서버 오류 |

---

## 4. 카테고리 정의

| 카테고리 | 설명 |
|---------|------|
| conflict | 국제 분쟁, 전쟁 |
| disaster | 재난, 자연재해 |
| cyber | 사이버 공격 |
| political | 정치 사건 |
| economic | 경제 뉴스 |
| health | 보건 사건 |
| general | 기타 |

---

## 5. 위협 수준 정의

| 수준 | 설명 |
|------|------|
| 1 | 낮음 |
| 2 | 중간 |
| 3 | 높음 |
| 4 | 매우 높음 |

---

## 6. 변경 로그

### v2.0 (2026-06-04)
- 실시간 속보 대시보드 전환
- `/api/events` 엔드포인트
- WebSocket `/ws` 실시간 스트리밍
- Claude API 자동 번역

### v1.0 (2026-05-26)
- 시장 데이터 API
