import { useQuery } from '@tanstack/react-query'
import { fetchMarkets, fetchCountryMarket, fetchCountryMovers, fetchStockDetail } from '@/lib/api'

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

export function useCountryMovers(code: string | null) {
  return useQuery({
    queryKey: ['movers', code],
    queryFn: () => fetchCountryMovers(code!),
    enabled: !!code,
    staleTime: 15 * 60 * 1000,
  })
}

export function useStockDetail(ticker: string | null) {
  return useQuery({
    queryKey: ['stock', ticker],
    queryFn: () => fetchStockDetail(ticker!),
    enabled: !!ticker,
    staleTime: 10 * 60 * 1000,
  })
}
