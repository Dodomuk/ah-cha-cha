import { useQuery } from '@tanstack/react-query'
import { fetchCountryNews } from '@/lib/api'

export function useCountryNews(code: string | null, hours = 168) {
  return useQuery({
    queryKey: ['countryNews', code, hours],
    queryFn: () => fetchCountryNews(code!, hours),
    enabled: !!code,
    staleTime: 60 * 1000,
  })
}
