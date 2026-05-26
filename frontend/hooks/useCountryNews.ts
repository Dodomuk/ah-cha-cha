import { useQuery } from '@tanstack/react-query'
import { fetchCountryNews } from '@/lib/api'

export function useCountryNews(code: string | null, start: string, end: string) {
  return useQuery({
    queryKey: ['countryNews', code, start, end],
    queryFn: () => fetchCountryNews(code!, start, end),
    enabled: !!code,
    staleTime: 60 * 1000,
  })
}
