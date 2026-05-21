export type ThreatLevel = 0 | 1 | 2 | 3 | 4

export interface CountryThreat {
  threat_level: ThreatLevel
  article_count: number
}

export interface CountriesResponse {
  snapshot_at: string
  countries: Record<string, CountryThreat>
}

export interface NewsArticle {
  id: string
  summary_title: string
  summary_what: string
  summary_impact: string
  threat_level: ThreatLevel
  url: string
  source_domain: string
  published_at: string
  collected_at: string
}

export interface CountryNewsResponse {
  country_code: string
  threat_level: ThreatLevel
  articles: NewsArticle[]
}

export interface TooltipState {
  visible: boolean
  x: number
  y: number
  countryName: string
  threatLevel: ThreatLevel
}
