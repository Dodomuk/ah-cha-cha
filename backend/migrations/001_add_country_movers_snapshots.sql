-- 국가별 종목 무버스 스냅샷 테이블 생성 (Rate Limit 방지용 DB 캐시)
CREATE TABLE IF NOT EXISTS country_movers_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL UNIQUE,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_country_movers_country_code ON country_movers_snapshots(country_code);
CREATE INDEX IF NOT EXISTS idx_country_movers_updated_at ON country_movers_snapshots(updated_at);

-- 업데이트 시각 자동 갱신 트리거 (선택사항)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_country_movers_updated_at
    BEFORE UPDATE ON country_movers_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
