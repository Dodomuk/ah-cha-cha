import axios from 'axios'
import { CountriesResponse, CountryNewsResponse, LatestNewsResponse, TrendResponse, SearchResponse } from '@/types'

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

export async function fetchLatestNews(limit = 100): Promise<LatestNewsResponse> {
  const { data } = await client.get<LatestNewsResponse>('/api/news/latest', {
    params: { limit, min_level: 1 },
  })
  return data
}
