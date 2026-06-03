# 데이터베이스 스키마

**버전:** 2.0
**최종 수정:** 2026-06-04

---

## 개요

PostgreSQL (Supabase) 기반. SQLAlchemy 2.0로 관리.

---

## 메인 서비스 테이블

### news_articles

실시간 속보 저장

```sql
CREATE TABLE news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,           -- 영어 (자동 번역됨)
  summary TEXT NOT NULL,          -- 영어 (자동 번역됨)
  original_title TEXT,            -- 원본 (한국어일 수 있음)
  original_summary TEXT,          -- 원본
  category VARCHAR(50),           -- conflict, disaster, cyber, etc
  threat_level INTEGER CHECK (threat_level BETWEEN 1 AND 4),
  country_codes TEXT[],           -- ['US', 'KR', ...]
  keywords TEXT[],                -- ['Russia', 'Finance', ...]
  animation_config JSONB,         -- null (향후 확장)
  collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ai_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_collected_at (collected_at DESC),
  INDEX idx_threat_level (threat_level),
  INDEX idx_category (category),
  INDEX idx_country_codes (country_codes)
);
```

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | 기사 고유 ID |
| title | TEXT | 영어 제목 (Claude API로 번역) |
| summary | TEXT | 영어 요약 (Claude API로 번역) |
| original_title | TEXT | 원본 제목 |
| original_summary | TEXT | 원본 요약 |
| category | VARCHAR(50) | 뉴스 카테고리 |
| threat_level | INTEGER | 위협 수준 (1-4) |
| country_codes | TEXT[] | 관련 국가 배열 |
| keywords | TEXT[] | 추출 키워드 배열 |
| animation_config | JSONB | 애니메이션 설정 (null) |
| collected_at | TIMESTAMP TZ | 수집 시간 (UTC) |
| ai_processed | BOOLEAN | AI 처리 완료 여부 |
| created_at | TIMESTAMP TZ | 기록 생성 시간 |
| updated_at | TIMESTAMP TZ | 최종 수정 시간 |

**인덱스:**
- `collected_at DESC` - 최신 기사 조회 성능
- `threat_level` - 위협 수준 필터링
- `category` - 카테고리 필터링
- `country_codes` - 국가별 조회

---

## 레거시 서비스 테이블

### news_articles (레거시)

보안 뉴스 저장 (한국어 전용)

```sql
CREATE TABLE news_articles_legacy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT UNIQUE NOT NULL,
  source_name VARCHAR(100),              -- "ASEC Blog", "보안뉴스", etc
  summary_title TEXT NOT NULL,           -- 한국어 제목
  summary_what TEXT NOT NULL,            -- 한국어 요약
  threat_level INTEGER CHECK (threat_level BETWEEN 0 AND 4),
  affected_countries TEXT[],             -- ['KR', 'US', ...]
  category VARCHAR(50),                  -- 카테고리
  collected_at TIMESTAMP WITH TIME ZONE,
  ai_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_collected_at (collected_at DESC),
  INDEX idx_threat_level (threat_level)
);
```

---

### threat_levels (레거시)

국가별 위협 레벨 스냅샷

```sql
CREATE TABLE threat_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(2) NOT NULL,
  threat_level INTEGER,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(country_code),
  INDEX idx_country_code (country_code)
);
```

---

## 데이터 관계도

```
news_articles
  ├─ country_codes → ISO 3166-1 alpha-2
  ├─ category → enum (conflict, disaster, ...)
  ├─ threat_level → 1-4
  └─ keywords → array
      
threat_levels
  └─ country_code → ISO 3166-1 alpha-2
```

---

## 쿼리 예제

### 최신 기사 50개 조회

```sql
SELECT id, title, summary, category, threat_level, country_codes, keywords, collected_at
FROM news_articles
ORDER BY collected_at DESC
LIMIT 50;
```

### 위협 수준 3 이상 기사

```sql
SELECT id, title, threat_level, country_codes
FROM news_articles
WHERE threat_level >= 3
ORDER BY collected_at DESC
LIMIT 20;
```

### 특정 국가 관련 기사

```sql
SELECT id, title, threat_level, collected_at
FROM news_articles
WHERE country_codes @> ARRAY['US']  -- PostgreSQL 배열 연산
ORDER BY collected_at DESC
LIMIT 20;
```

### 국가별 위협 레벨

```sql
SELECT country_code, threat_level, last_updated
FROM threat_levels
ORDER BY threat_level DESC;
```

---

## 성능 최적화

| 항목 | 전략 |
|------|------|
| 대량 조회 | `collected_at DESC` 인덱스 |
| 필터링 | `threat_level`, `category` 인덱스 |
| 국가 검색 | `country_codes` 배열 인덱스 |
| 자동 정리 | cron: 90일 이상 기사 삭제 |

---

## 백업 및 복구

Supabase 자동 백업 (일일)

- 일일 백업: 최대 7일 보관
- 복구: Supabase 대시보드에서 원클릭 복구

---

## 마이그레이션

SQLAlchemy로 관리됨 (`app/models/news.py`)

새 버전 배포 시:
```bash
# 스키마 확인
alembic current

# 마이그레이션 생성 (필요 시)
alembic revision --autogenerate -m "message"

# 적용
alembic upgrade head
```
