import { useQuery } from '@tanstack/react-query'
import { fetchCountries } from '@/lib/api'

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: fetchCountries,
    refetchInterval: 2 * 60 * 1000, // 2분마다 폴링
    staleTime: 60 * 1000,
  })
}
