import { useFocusEffect } from 'expo-router'
import { useCallback, useRef, useState } from 'react'

import { RESOURCE_CONTRACT, type ListPage, type ListPagingRequest } from '@/api/contract'
import { FIRST_PAGE_REQUEST } from '@/api/cursorPaging'
import { isApiError, listErrorMessage } from '@/api/errors'

type PagingState = {
  hasMore: boolean
  nextPage: number
  nextCursor: string | null
}

const firstPage = RESOURCE_CONTRACT.pagination.firstPage

function nextPaging(result: ListPage<unknown>, requestedPage: number): PagingState {
  return {
    hasMore: result.hasMore,
    nextPage: (result.page ?? requestedPage) + 1,
    nextCursor: result.nextCursor ?? null,
  }
}

export function useInfiniteList<T>(loader: (paging: ListPagingRequest) => Promise<ListPage<T>>) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const pagingRef = useRef<PagingState>({ hasMore: false, nextPage: firstPage + 1, nextCursor: null })
  const loadingMoreRef = useRef(false)
  /** Muda a cada 1ª página (troca de filtro, refresh): página "mais" de um filtro antigo é descartada. */
  const generationRef = useRef(0)

  const applyPage = useCallback((result: ListPage<T>, requestedPage: number, mode: 'replace' | 'append') => {
    const paging = nextPaging(result, requestedPage)
    pagingRef.current = paging
    setHasMore(paging.hasMore)
    setError(null)
    setItems((current) => (mode === 'append' ? [...current, ...result.items] : result.items))
  }, [])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      generationRef.current += 1
      ;(async () => {
        try {
          const result = await loader({ ...FIRST_PAGE_REQUEST })
          if (cancelled) return
          applyPage(result, firstPage, 'replace')
        } catch (err) {
          if (cancelled) return
          setError(listErrorMessage(isApiError(err) ? err : { status: 0, code: 'INTERNAL_ERROR' }))
        } finally {
          if (!cancelled) {
            setLoading(false)
            setRefreshing(false)
            setLoadingMore(false)
            loadingMoreRef.current = false
          }
        }
      })()
      return () => {
        cancelled = true
      }
    }, [loader, applyPage]),
  )

  const refresh = useCallback(async () => {
    generationRef.current += 1
    setRefreshing(true)
    try {
      const result = await loader({ ...FIRST_PAGE_REQUEST })
      applyPage(result, firstPage, 'replace')
    } catch (err) {
      setError(listErrorMessage(isApiError(err) ? err : { status: 0, code: 'INTERNAL_ERROR' }))
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [loader, applyPage])

  const reload = useCallback(async () => {
    generationRef.current += 1
    setLoading(true)
    try {
      const result = await loader({ ...FIRST_PAGE_REQUEST })
      applyPage(result, firstPage, 'replace')
    } catch (err) {
      setError(listErrorMessage(isApiError(err) ? err : { status: 0, code: 'INTERNAL_ERROR' }))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loader, applyPage])

  const loadMore = useCallback(async () => {
    const paging = pagingRef.current
    if (!paging.hasMore || loadingMoreRef.current || loading || refreshing) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const requestedPage = paging.nextPage
    const generation = generationRef.current
    try {
      const result = await loader({
        page: requestedPage,
        cursor: paging.nextCursor ?? undefined,
      })
      if (generation !== generationRef.current) return
      // Cursor inválido (400 INVALID_CURSOR): o loader recomeçou da 1ª página → substitui em vez de anexar.
      if (result.restarted) applyPage(result, firstPage, 'replace')
      else applyPage(result, requestedPage, 'append')
    } catch (err) {
      if (generation !== generationRef.current) return
      setError(listErrorMessage(isApiError(err) ? err : { status: 0, code: 'INTERNAL_ERROR' }))
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [loader, applyPage, loading, refreshing])

  return {
    items,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    reload,
    refresh,
    loadMore,
  }
}
