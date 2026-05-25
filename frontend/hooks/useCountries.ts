import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { fetchCountries } from '@/lib/api'

export function useCountries(hours = 168) {
  return useQuery({
    queryKey: ['countries', hours],
    queryFn: () => fetchCountries(hours),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}
