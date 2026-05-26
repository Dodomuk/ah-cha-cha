# 아차차 — 데이터베이스 스키마

**버전:** 0.1
**작성일:** 2026-05-21
**DB:** PostgreSQL (Supabase)

---

## 1. 테이블 목록

| 테이블 | 설명 |
|--------|------|
| `news_articles` | 수집된 원본 뉴스 및 AI 요약 |
| `country_threat_levels` | 국가별 위협 레벨 집계 (갱신 주기별 스냅샷) |

---

## 2. `news_articles`

뉴스 수집 + AI 요약 결과를 저장하는 핵심 테이블.

```sql
CREATE TABLE news_articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url             TEXT NOT NULL UNIQUE,           -- 원문 URL (중복 방지 키)
    source_title    TEXT,                           -- 원문 제목
    source_domain   TEXT,                           -- 출처 도메인 (예: bbc.com)
    published_at    TIMESTAMPTZ,                    -- 원문 발행 시각
    collected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 수집 시각

    -- AI 생성 필드
    summary_title   TEXT,                           -- 한국어 한 줄 요약 제목
    summary_what    TEXT,                           -- 무슨 일이 있었는가 (한국어)
    summary_impact  TEXT,                           -- 어떤 영향이 발생했는가 (한국어)
    threat_level    SMALLINT NOT NULL DEFAULT 0     -- 위협 레벨 0~4
                    CHECK (threat_level BETWEEN 0 AND 4),
    country_codes   TEXT[],                         -- 관련 국가 ISO 코드 배열 (예: ['KR','US'])

    -- 상태
    ai_processed    BOOLEAN NOT NULL DEFAULT FALSE, -- AI 처리 완료 여부
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_country_codes ON news_articles USING GIN (country_codes);
CREATE INDEX idx_news_collected_at  ON news_articles (collected_at DESC);
CREATE INDEX idx_news_threat_level  ON news_articles (threat_level);
```

---

## 3. `country_threat_levels` (미사용)

> **현재 구현에서 이 테이블은 사용하지 않는다.**
> `GET /api/countries?hours=N` 요청 시 `news_articles`에서 직접 집계하므로 별도 캐시 테이블 불필요.
> 아래 스키마는 향후 캐싱 최적화 시 참고용으로만 보존.

```sql
CREATE TABLE country_threat_levels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code    CHAR(2) NOT NULL,               -- ISO 3166-1 alpha-2
    threat_level    SMALLINT NOT NULL DEFAULT 0
                    CHECK (threat_level BETWEEN 0 AND 4),
    article_count   INTEGER NOT NULL DEFAULT 0,     -- 해당 사이클 뉴스 건수
    snapshot_at     TIMESTAMPTZ NOT NULL,           -- 집계 기준 시각 (갱신 사이클)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. 주요 쿼리 패턴

### 4.1 지도용: 최신 국가별 위협 레벨 전체 조회

```sql
SELECT DISTINCT ON (country_code)
    country_code,
    threat_level,
    snapshot_at
FROM country_threat_levels
ORDER BY country_code, snapshot_at DESC;
```

### 4.2 국가 클릭 시: 해당 국가 최신 뉴스 목록

```sql
SELECT
    id, summary_title, summary_what, summary_impact,
    threat_level, url, source_domain, published_at
FROM news_articles
WHERE country_codes @> ARRAY['KR']
  AND collected_at >= NOW() - INTERVAL '24 hours'
ORDER BY threat_level DESC, collected_at DESC
LIMIT 20;
```

### 4.3 스케줄러: 미처리 뉴스 배치 조회

```sql
SELECT id, url, source_title
FROM news_articles
WHERE ai_processed = FALSE
ORDER BY collected_at ASC
LIMIT 50;
```

---

## 5. 데이터 보관 정책 (미결)

- 현재 미정: 뉴스를 영구 보관할지, 일정 기간 후 삭제할지 결정 필요
- 후보 1: 90일 보관 후 삭제 (비용 절감)
- 후보 2: 영구 보관 (히스토리 기능 확장 여지)
- → [prd.md Open Question #3](../prd.md) 참고
