export type ThreatLevel = 0 | 1 | 2 | 3 | 4

export interface CountryThreat {
  threat_level: ThreatLevel
  article_count: number
  delta?: number | null
  role?: 'attacker' | 'victim' | 'both' | null
}

export interface CountriesResponse {
  snapshot_at: string
  countries: Record<string, CountryThreat>
}

export interface NewsArticle {
  id: string
  source_title?: string | null
  summary_title: string
  summary_what: string
  summary_impact: string
  summary_title_en?: string | null
  summary_what_en?: string | null
  summary_impact_en?: string | null
  threat_level: ThreatLevel
  url: string
  source_domain: string
  published_at: string | null
  collected_at: string
  attacker_codes?: string[] | null
  victim_codes?: string[] | null
}

export interface CountryNewsResponse {
  country_code: string
  threat_level: ThreatLevel
  articles: NewsArticle[]
}

export interface LatestNewsResponse {
  articles: NewsArticle[]
}

export interface TooltipState {
  visible: boolean
  x: number
  y: number
  countryName: string
  threatLevel: ThreatLevel
  delta?: number | null
  role?: string | null
}

export interface TrendPoint {
  date: string
  level: number
}

export interface TrendResponse {
  points: TrendPoint[]
}

export interface SearchResponse {
  articles: NewsArticle[]
  query: string
}

// ── 증시 ────────────────────────────────────────────────────────────

export interface MarketSnapshot {
  country_code: string
  index_name: string
  index_name_ko: string
  ticker: string
  current_value: number | null
  prev_close: number | null
  change_pct: number | null
  change_abs: number | null
  is_open: boolean
  updated_at: string
}

export interface MarketsResponse {
  markets: Record<string, MarketSnapshot>
  updated_at: string
}

export interface HistoryPoint {
  date: string
  close: number | null
}

export interface CountryMarketDetail {
  snapshot: MarketSnapshot
  history: HistoryPoint[]
}

export interface MarketTooltipState {
  visible: boolean
  x: number
  y: number
  countryName: string
  changePct: number | null
  isOpen: boolean
}

// ── 종목 무버스 ──────────────────────────────────────────────────────

export interface StockMover {
  ticker: string
  name: string
  name_ko: string
  sector: string
  sector_ko: string
  sector_color: string
  change_pct: number
  current_price: number
  has_spread: boolean
}

export interface CountryMovers {
  supported: boolean
  country_code: string
  leading_sector: string | null
  leading_sector_ko: string | null
  leading_sector_color: string
  leading_avg_pct: number
  direction: 'up' | 'down'
  summary_ko: string
  summary_en: string
  gainers: StockMover[]
  losers: StockMover[]
  all: StockMover[]
  error?: string
}

// ── 종목 상세 ────────────────────────────────────────────────────────

export interface NewsSegment {
  text: string
  highlight: boolean
}

export interface StockNews {
  title: string
  segments: NewsSegment[]
  link: string
  publisher: string
  published_at: number
}

export interface OHLCPoint {
  date: string
  close: number | null
  open: number | null
  high: number | null
  low: number | null
  volume: number | null
}

export interface SpreadAffected {
  country: string
  reason_ko: string
  reason_en: string
}

export interface GlobalSpread {
  desc_ko: string
  desc_en: string
  affected: SpreadAffected[]
}

export interface StockDetail {
  ticker: string
  name: string
  sector: string
  industry: string
  current_price: number | null
  change_pct: number | null
  market_cap: number | null
  pe_ratio: number | null
  forward_pe: number | null
  '52w_high': number | null
  '52w_low': number | null
  avg_volume: number | null
  dividend_yield: number | null
  beta: number | null
  history: OHLCPoint[]
  news: StockNews[]
  spread: GlobalSpread | null
  error?: string
}
