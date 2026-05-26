import { useQuery } from '@tanstack/react-query'
import { fetchSearch } from '@/lib/api'
import { SearchResponse } from '@/types'

export function useSearch(q: string) {
  return useQuery<SearchResponse>({
    queryKey: ['search', q],
    queryFn: () => fetchSearch(q),
    enabled: q.trim().length >= 2,
    staleTime: 2 * 60 * 1000,
  })
}
