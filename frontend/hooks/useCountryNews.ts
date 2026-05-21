import { useQuery } from '@tanstack/react-query'
import { fetchCountryNews } from '@/lib/api'

export function useCountryNews(code: string | null) {
  return useQuery({
    queryKey: ['countryNews', code],
    queryFn: () => fetchCountryNews(code!),
    enabled: !!code,
    staleTime: 60 * 1000,
  })
}
