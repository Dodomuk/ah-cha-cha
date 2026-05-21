# 아차차 — API 명세

**버전:** 0.1
**작성일:** 2026-05-21
**Base URL:** `https://api.ah-cha-cha.com` (로컬: `http://localhost:8000`)

---

## 공통

- 모든 응답은 `application/json`
- 날짜/시각은 ISO 8601 (UTC) 형식: `2026-05-21T06:00:00Z`
- 국가 코드는 ISO 3166-1 alpha-2 (예: `KR`, `US`, `CN`)

---

## 1. `GET /api/countries`

지도 렌더링용. 전체 국가의 최신 위협 레벨 맵을 반환.

### Response `200`

```json
{
  "snapshot_at": "2026-05-21T06:00:00Z",
  "countries": {
    "KR": { "threat_level": 3, "article_count": 5 },
    "US": { "threat_level": 4, "article_count": 12 },
    "JP": { "threat_level": 1, "article_count": 2 },
    "DE": { "threat_level": 0, "article_count": 0 }
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `snapshot_at` | string | 마지막 갱신 사이클 시각 |
| `countries` | object | 국가 코드 → 위협 정보 맵 |
| `threat_level` | 0~4 | 위협 레벨 |
| `article_count` | int | 해당 사이클 관련 뉴스 건수 |

---

## 2. `GET /api/countries/{code}/news`

국가 클릭 시 상세 패널용. 해당 국가의 최신 뉴스 목록 반환.

### Path Parameters

| 파라미터 | 설명 |
|----------|------|
| `code` | ISO 3166-1 alpha-2 국가 코드 (예: `KR`) |

### Query Parameters

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `limit` | `20` | 반환할 뉴스 수 (최대 50) |
| `hours` | `24` | 최근 N시간 이내 뉴스 |

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

### Response `404`

```json
{ "error": "country_not_found", "code": "XX" }
```

---

## 3. `GET /api/news/latest`

글로벌 피드용. 위협 레벨 높은 순으로 전체 최신 뉴스 반환.

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
      "country_codes": ["US", "UK"],
      "source_domain": "...",
      "url": "...",
      "collected_at": "2026-05-21T06:02:00Z"
    }
  ]
}
```

---

## 4. `POST /api/internal/collect` (내부 전용)

수동 수집 트리거. 스케줄러 외 강제 실행 시 사용.

### Headers

```
X-Internal-Key: {INTERNAL_API_KEY}
```

### Response `202`

```json
{ "message": "collection job accepted", "job_id": "uuid" }
```

---

## 5. 에러 응답 형식

```json
{
  "error": "error_code_snake_case",
  "message": "사람이 읽을 수 있는 설명"
}
```

| HTTP 코드 | 설명 |
|-----------|------|
| `400` | 잘못된 요청 파라미터 |
| `404` | 리소스 없음 |
| `429` | Rate limit 초과 |
| `500` | 서버 내부 오류 |
