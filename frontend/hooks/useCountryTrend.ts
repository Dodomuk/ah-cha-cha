import { useQuery } from '@tanstack/react-query'
import { fetchCountryTrend } from '@/lib/api'
import { TrendResponse } from '@/types'

export function useCountryTrend(code: string | null) {
  return useQuery<TrendResponse>({
    queryKey: ['countryTrend', code],
    queryFn: () => fetchCountryTrend(code!),
    enabled: !!code,
    staleTime: 5 * 60 * 1000,
  })
}
