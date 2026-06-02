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
