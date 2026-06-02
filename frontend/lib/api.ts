import axios from 'axios'
import { CountriesResponse, CountryNewsResponse, LatestNewsResponse, TrendResponse, SearchResponse, MarketsResponse, CountryMarketDetail, CountryMovers, StockDetail } from '@/types'

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  timeout: 10000,
})

export async function fetchCountries(start: string, end: string): Promise<CountriesResponse> {
  const { data } = await client.get<CountriesResponse>('/api/countries', {
    params: { start, end },
  })
  return data
}

export async function fetchCountryNews(
  code: string,
  start: string,
  end: string,
  limit = 20
): Promise<CountryNewsResponse> {
  const { data } = await client.get<CountryNewsResponse>(
    `/api/countries/${code}/news`,
    { params: { start, end, limit } }
  )
  return data
}

export async function fetchCountryTrend(code: string): Promise<TrendResponse> {
  const { data } = await client.get<TrendResponse>(`/api/countries/${code}/trend`)
  return data
}

export async function fetchSearch(q: string, limit = 20): Promise<SearchResponse> {
  const { data } = await client.get<SearchResponse>('/api/search', { params: { q, limit } })
  return data
}

export interface StatsData {
  total_7d: number
  today: number
  by_level: Record<string, number>
}

export async function fetchStats(): Promise<StatsData> {
  const { data } = await client.get<StatsData>('/api/stats')
  return data
}

export async function fetchLatestNews(limit = 100, date?: string): Promise<LatestNewsResponse> {
  const { data } = await client.get<LatestNewsResponse>('/api/news/latest', {
    params: { limit, min_level: 1, ...(date ? { date } : {}) },
  })
  return data
}

export async function fetchMarkets(): Promise<MarketsResponse> {
  const { data } = await client.get<MarketsResponse>('/api/market/countries')
  return data
}

export async function fetchCountryMarket(code: string): Promise<CountryMarketDetail> {
  const { data } = await client.get<CountryMarketDetail>(`/api/market/country/${code}`)
  return data
}

export async function fetchCountryMovers(code: string): Promise<CountryMovers> {
  const { data } = await client.get<CountryMovers>(`/api/market/country/${code}/movers`, { timeout: 40000 })
  return data
}

export async function fetchStockDetail(ticker: string): Promise<StockDetail> {
  const { data } = await client.get<StockDetail>(`/api/market/stock/${encodeURIComponent(ticker)}/detail`, { timeout: 30000 })
  return data
}
