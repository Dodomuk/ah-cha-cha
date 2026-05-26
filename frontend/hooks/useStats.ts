import { useQuery } from '@tanstack/react-query'
import { fetchStats } from '@/lib/api'

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: fetchStats,
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
  })
}
