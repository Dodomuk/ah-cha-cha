import { useQuery } from '@tanstack/react-query'
import { fetchCountries } from '@/lib/api'

export function useCountries(start: string, end: string) {
  return useQuery({
    queryKey: ['countries', start, end],
    queryFn: () => fetchCountries(start, end),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
  })
}
