import { useNetInfo } from '@react-native-community/netinfo'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { POWERSYNC_CONFIG } from './config'
import {
  ALL_ROWS,
  animalTypesListQuery,
  farmsListQuery,
  LOCAL_PAGE_SIZE,
  rowToAnimalType,
  rowToFarm,
  sliceLimit,
  type FarmRow,
  type SqlQuery,
} from './queries'
import { REJECTIONS_COUNT_SQL } from './rejections'

/** Espera a sincronização (pull-to-refresh). Offline retorna logo; nunca trava mais que `timeoutMs`. */
export function useWaitForSync() {
  const db = usePowerSync()
  return useCallback(
    async (timeoutMs = 15_000) => {
      if (!db.currentStatus.connected) return false
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        if (POWERSYNC_CONFIG.checkpointMode === 'requests') {
          const checkpoint = await db.requestCheckpoint()
          await checkpoint.waitForSync({ signal: controller.signal })
        } else {
          const started = Date.now()
          await db.waitForStatus(
            (status) =>
              !status.dataFlowStatus.uploading &&
              !status.dataFlowStatus.downloading &&
              (status.lastSyncedAt?.getTime() ?? 0) >= started - 1000,
            controller.signal,
          )
        }
        return true
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    },
    [db],
  )
}

/**
 * Lista local reativa (useQuery) com "scroll infinito" por LIMIT crescente.
 * Mesmo formato de retorno do antigo useInfiniteList (REST) para as telas mudarem pouco.
 */
export function useLocalList<Row, Item>(build: (limit: number) => SqlQuery, map: (row: Row) => Item, deps: unknown[]) {
  const [limit, setLimit] = useState(LOCAL_PAGE_SIZE)
  const [refreshing, setRefreshing] = useState(false)
  const waitForSync = useWaitForSync()
  // Filtros mudaram: volta para a primeira "página".
  const depsKey = JSON.stringify(deps)
  const [lastKey, setLastKey] = useState(depsKey)
  if (lastKey !== depsKey) {
    setLastKey(depsKey)
    setLimit(LOCAL_PAGE_SIZE)
  }
  const query = build(limit)
  const result = useQuery<Row>(query.sql, query.params as unknown[])
  const { items: rows, hasMore } = sliceLimit(result.data, limit)
  const items = useMemo(() => rows.map(map), [rows, map])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await waitForSync()
      await result.refresh?.()
    } finally {
      setRefreshing(false)
    }
  }, [waitForSync, result])

  return {
    items,
    loading: result.isLoading,
    refreshing,
    loadingMore: result.isFetching && !result.isLoading && limit > LOCAL_PAGE_SIZE,
    error: result.error ? 'Não foi possível ler os dados deste aparelho.' : null,
    hasMore,
    reload: () => void result.refresh?.(),
    refresh,
    loadMore: () => {
      if (hasMore) setLimit((value) => value + LOCAL_PAGE_SIZE)
    },
  }
}

export type SyncIndicatorState = 'offline' | 'unreachable' | 'connecting' | 'syncing' | 'online'

/** Estado para o indicador: rede (NetInfo) + status do PowerSync + fila e pendências. */
export function useSyncInfo() {
  const db = usePowerSync()
  const status = useStatus()
  const net = useNetInfo()
  const [pendingUploads, setPendingUploads] = useState(0)
  const rejections = useQuery<{ n: number }>(REJECTIONS_COUNT_SQL)

  useEffect(() => {
    let alive = true
    const read = () =>
      db
        .getUploadQueueStats()
        .then((stats) => alive && setPendingUploads(stats.count))
        .catch(() => undefined)
    void read()
    const timer = setInterval(read, 4000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [db, status.dataFlowStatus.uploading, status.lastSyncedAt])

  const offline = net.isConnected === false || net.isInternetReachable === false
  let state: SyncIndicatorState = 'online'
  if (offline) state = 'offline'
  else if (status.connecting && !status.connected) state = 'connecting'
  // Aparelho com rede, mas o serviço PowerSync não responde (fora do ar, reiniciando, URL/IP errado).
  else if (!status.connected) state = status.dataFlowStatus.downloadError ? 'unreachable' : 'offline'
  else if (status.dataFlowStatus.uploading || status.dataFlowStatus.downloading) state = 'syncing'

  return {
    state,
    networkOnline: !offline,
    connected: status.connected,
    hasSynced: status.hasSynced ?? false,
    lastSyncedAt: status.lastSyncedAt ?? null,
    pendingUploads,
    rejectionCount: Number(rejections.data[0]?.n ?? 0),
    uploadError: status.dataFlowStatus.uploadError ?? null,
    downloadError: status.dataFlowStatus.downloadError ?? null,
  }
}

/** Só rede (para avisos de telas que dependem da API online, como login e MasterPicker). */
export function useIsOnline(): boolean {
  const net = useNetInfo()
  return !(net.isConnected === false || net.isInternetReachable === false)
}

/** Fazendas para selects/filtros (consulta local reativa, sem paginação). */
export function useLocalFarms() {
  const query = farmsListQuery(ALL_ROWS)
  const result = useQuery<FarmRow>(query.sql, query.params as unknown[])
  return useMemo(() => result.data.map(rowToFarm), [result.data])
}

/** Tipos de animais para selects/filtros. */
export function useLocalAnimalTypes() {
  const query = animalTypesListQuery(ALL_ROWS)
  const result = useQuery<{ id: string; name: string }>(query.sql, query.params as unknown[])
  return useMemo(() => result.data.map(rowToAnimalType), [result.data])
}
