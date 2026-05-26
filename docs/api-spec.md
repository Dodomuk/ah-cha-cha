# 아차차 — API 명세

**버전:** 0.2
**작성일:** 2026-05-21
**최종 수정:** 2026-05-26
**Base URL:** `https://ah-cha-cha.onrender.com` (로컬: `http://localhost:8000`)

---

## 공통

- 모든 응답은 `application/json`
- 날짜/시각은 ISO 8601 (UTC) 형식: `2026-05-21T06:00:00Z`
- 국가 코드는 ISO 3166-1 alpha-2 (예: `KR`, `US`, `CN`)

---

## 1. `GET /api/countries`

지도 렌더링용. 지정 기간 내 국가별 최고 위협 레벨 맵을 `news_articles`에서 직접 집계하여 반환.

### Query Parameters

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `hours` | `168` | 최근 N시간 이내 기사 기준 (1~168) |

### Response `200`

```json
{
  "snapshot_at": "2026-05-21T06:00:00Z",
  "countries": {
    "KR": { "threat_level": 3, "article_count": 5 },
    "US": { "threat_level": 4, "article_count": 12 },
    "JP": { "threat_level": 1, "article_count": 2 }
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `snapshot_at` | string | 응답 생성 시각 (현재 UTC) |
| `countries` | object | 국가 코드 → 위협 정보 맵 (threat_level=0 국가는 미포함) |
| `threat_level` | 1~4 | 해당 기간 기사 중 최고 위협 레벨 |
| `article_count` | int | 해당 기간 관련 뉴스 건수 |

---

## 2. `GET /api/countries/{code}/news`

국가 클릭 시 상세 패널용. 해당 국가의 뉴스 목록 반환.

### Path Parameters

| 파라미터 | 설명 |
|----------|------|
| `code` | ISO 3166-1 alpha-2 국가 코드 (예: `KR`) |

### Query Parameters

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `hours` | `168` | 최근 N시간 이내 기사 (날짜 필터와 연동, 1~168) |
| `limit` | `20` | 반환할 뉴스 수 (최대 50) |

### Response `200`

```json
{
  "country_code": "KR",
  "threat_level": 3,
  "articles": [
    {
      "id": "uuid",
      "summary_title": "국내 주요 금융기관 대상 DDoS 공격 발생",
      "summary_what": "2026년 5월 21일, 국내 5대 시중은행을 포함한...",
      "summary_impact": "약 3시간에 걸친 서비스 장애가 발생하였으며...",
      "threat_level": 3,
      "url": "https://example.com/news/...",
      "source_domain": "boannews.com",
      "published_at": "2026-05-21T04:30:00Z",
      "collected_at": "2026-05-21T06:02:00Z"
    }
  ]
}
```

---

## 3. `GET /api/news/latest`

일일 리포트 패널용. 위협 레벨 높은 순으로 최근 24시간 뉴스 반환.

### Query Parameters

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `limit` | `30` | 반환할 뉴스 수 (최대 100) |
| `min_level` | `1` | 최소 위협 레벨 필터 |

### Response `200`

```json
{
  "articles": [
    {
      "id": "uuid",
      "summary_title": "...",
      "threat_level": 4,
      "country_codes": ["US", "GB"],
      "source_domain": "...",
      "url": "...",
      "collected_at": "2026-05-21T06:02:00Z"
    }
  ]
}
```

---

## 4. `POST /api/internal/collect` (내부 전용)

RSS 수집 수동 트리거. `TEST_MODE=false` 시 수집 후 자동 요약까지 실행.

### Headers

```
X-Internal-Key: {INTERNAL_API_KEY}
```

### Response `200`

```json
{ "message": "collection job accepted [자동 요약 포함]" }
```

---

## 5. `POST /api/internal/summarize` (내부 전용)

미처리 기사 Claude 요약 수동 트리거. `TEST_MODE=true` 환경에서 수집 후 별도로 실행.

### Headers

```
X-Internal-Key: {INTERNAL_API_KEY}
```

### Response `200`

```json
{ "message": "summarization job accepted", "pending": 42 }
```

대기 기사 없으면:

```json
{ "message": "요약 대기 기사 없음", "pending": 0 }
```

---

## 6. `GET /health` (헬스체크)

`HEAD` 메서드도 허용. UptimeRobot 모니터링 연동.

### Response `200`

```json
{ "status": "ok" }
```

---

## 7. 에러 응답 형식

```json
{
  "detail": "에러 설명"
}
```

| HTTP 코드 | 설명 |
|-----------|------|
| `400` | 잘못된 요청 파라미터 |
| `403` | 내부 API 키 불일치 |
| `404` | 리소스 없음 |
| `500` | 서버 내부 오류 |
