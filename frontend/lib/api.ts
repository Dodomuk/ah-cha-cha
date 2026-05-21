import axios from 'axios'
import { CountriesResponse, CountryNewsResponse } from '@/types'

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000',
  timeout: 10000,
})

export async function fetchCountries(): Promise<CountriesResponse> {
  const { data } = await client.get<CountriesResponse>('/api/countries')
  return data
}

export async function fetchCountryNews(
  code: string,
  hours = 24,
  limit = 20
): Promise<CountryNewsResponse> {
  const { data } = await client.get<CountryNewsResponse>(
    `/api/countries/${code}/news`,
    { params: { hours, limit } }
  )
  return data
}
