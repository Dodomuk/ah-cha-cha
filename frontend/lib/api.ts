import axios from 'axios'
import { CountriesResponse, CountryNewsResponse, LatestNewsResponse } from '@/types'

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  timeout: 10000,
})

export async function fetchCountries(hours = 168): Promise<CountriesResponse> {
  const { data } = await client.get<CountriesResponse>('/api/countries', {
    params: { hours },
  })
  return data
}

export async function fetchCountryNews(
  code: string,
  hours = 168,
  limit = 20
): Promise<CountryNewsResponse> {
  const { data } = await client.get<CountryNewsResponse>(
    `/api/countries/${code}/news`,
    { params: { hours, limit } }
  )
  return data
}

export async function fetchLatestNews(limit = 100): Promise<LatestNewsResponse> {
  const { data } = await client.get<LatestNewsResponse>('/api/news/latest', {
    params: { limit, min_level: 1 },
  })
  return data
}
