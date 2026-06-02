import { useQuery } from '@tanstack/react-query'
import { fetchMarkets, fetchCountryMarket } from '@/lib/api'

export function useMarkets() {
  return useQuery({
    queryKey: ['markets'],
    queryFn: fetchMarkets,
    refetchInterval: 60 * 1000, // 1분마다 갱신
    staleTime: 30 * 1000,
  })
}

export function useCountryMarket(code: string | null) {
  return useQuery({
    queryKey: ['market', code],
    queryFn: () => fetchCountryMarket(code!),
    enabled: !!code,
    staleTime: 30 * 1000,
  })
}
