import { useNetInfo } from '@react-native-community/netinfo'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { POWERSYNC_CONFIG } from './config'
import {
  ALL_ROWS,
  animalTypesListQuery,
  farmsListQuery,
  herdsListQuery,
  LOCAL_PAGE_SIZE,
  rowToAnimalType,
  rowToFarm,
  rowToHerd,
  sliceLimit,
  type FarmRow,
  type HerdRow,
  type SqlQuery,
} from './queries'
import { hasMoreQuery, keysetQuery, nextUntil, sliceWindow, windowQuery, type Cursor, type KeysetSpec } from './keyset'
import { CONFLICT_COUNT_SQL } from './localGuard'
import { OUTBOX_COUNT_SQL } from './outbox'
import { PHOTO_QUEUE_COUNTS_SQL } from './photoQueue'
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

/** Consulta que nunca devolve linhas (o probe de "há mais" fica parado enquanto não há cursor). */
const NO_ROWS_SQL = 'SELECT 1 AS x WHERE 0'

/**
 * Lista local reativa com paginação KEYSET e scroll infinito (ver keyset.ts para a estratégia).
 * - Primeira página: LIMIT página+1 (observada).
 * - "Carregar mais": busca única `(chaves) > cursor do último item LIMIT página`; o fim dela vira `until`, e a tela
 *   passa a observar `(chaves) <= until` — uma consulta só, então o watch do PowerSync (inserção/edição local,
 *   download) nunca duplica nem pula linhas.
 * - `hasMore`: probe observado `(chaves) > until LIMIT 1`.
 * - Um "carregar mais" por vez (ref), e nada depois do fim.
 * Mesmo formato de retorno de useLocalList.
 */
export function useKeysetList<Row, Item>(
  buildSpec: () => KeysetSpec,
  map: (row: Row) => Item,
  deps: unknown[],
  pageSize = LOCAL_PAGE_SIZE,
) {
  const db = usePowerSync()
  const [until, setUntil] = useState<Cursor | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchingMore, setFetchingMore] = useState(false)
  const busyRef = useRef(false)
  const waitForSync = useWaitForSync()
  // Filtros mudaram: volta para a primeira página.
  const depsKey = JSON.stringify(deps)
  const [lastKey, setLastKey] = useState(depsKey)
  if (lastKey !== depsKey) {
    setLastKey(depsKey)
    setUntil(null)
  }
  const spec = buildSpec()
  const query = windowQuery(spec, until, pageSize)
  const result = useQuery<Row>(query.sql, query.params as unknown[])
  const probe = until ? hasMoreQuery(spec, until) : { sql: NO_ROWS_SQL, params: [] }
  const probeResult = useQuery<Row>(probe.sql, probe.params as unknown[])
  const { rows, hasMore } = sliceWindow(result.data, until, pageSize, probeResult.data.length > 0)
  const items = useMemo(() => rows.map(map), [rows, map])
  const last = rows[rows.length - 1]
  // Continua do último item visível; se a faixa ficou vazia (tudo apagado), continua do próprio `until`.
  const after: Cursor | null = last ? spec.keys.map((key) => (last as Record<string, unknown>)[key.field] ?? '') : until

  const loadMore = async () => {
    if (!hasMore || !after || busyRef.current) return
    busyRef.current = true
    setFetchingMore(true)
    try {
      const current = spec
      const next = keysetQuery(current, { after, limit: pageSize })
      const page = await db.getAll<Row>(next.sql, next.params as unknown[])
      const cursor = nextUntil(current.keys, page as Record<string, unknown>[])
      if (cursor) setUntil(cursor)
    } catch (error) {
      console.warn('[lista] não deu para carregar mais', error)
    } finally {
      busyRef.current = false
      setFetchingMore(false)
    }
  }

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
    loadingMore: fetchingMore || (result.isFetching && !result.isLoading && until != null),
    error: result.error ? 'Não foi possível ler os dados deste aparelho.' : null,
    hasMore,
    reload: () => void result.refresh?.(),
    refresh,
    loadMore: () => void loadMore(),
  }
}

export type SyncIndicatorState = 'offline' | 'unreachable' | 'disconnected' | 'connecting' | 'syncing' | 'online'

/** Estado para o indicador: rede (NetInfo) + status do PowerSync + fila e pendências. */
export function useSyncInfo() {
  const db = usePowerSync()
  const status = useStatus()
  const net = useNetInfo()
  const [pendingUploads, setPendingUploads] = useState(0)
  const rejections = useQuery<{ n: number }>(REJECTIONS_COUNT_SQL)
  // Saída de reenvio (já fora do ps_crud, ainda não enviada): conta como "aguardando envio", nunca como Pendência.
  const outbox = useQuery<{ n: number }>(OUTBOX_COUNT_SQL)
  // Cadastros guardados no aparelho que o servidor ainda não aceitou (referência ausente/acesso): pedem confirmação.
  const conflicts = useQuery<{ n: number }>(CONFLICT_COUNT_SQL)
  // Fotos do embarque ainda no aparelho (aguardando envio) e recusadas (precisam de outra foto / Reenviar).
  const photos = useQuery<{ pending: number; failed: number }>(PHOTO_QUEUE_COUNTS_SQL)

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
  // Antes caía em 'offline' ("Offline") com o aparelho online: enganava quem via a fila parada.
  else if (!status.connected) state = status.dataFlowStatus.downloadError ? 'unreachable' : 'disconnected'
  else if (status.dataFlowStatus.uploading || status.dataFlowStatus.downloading) state = 'syncing'

  return {
    state,
    networkOnline: !offline,
    connected: status.connected,
    hasSynced: status.hasSynced ?? false,
    lastSyncedAt: status.lastSyncedAt ?? null,
    pendingUploads: pendingUploads + Number(outbox.data[0]?.n ?? 0),
    rejectionCount: Number(rejections.data[0]?.n ?? 0),
    conflictCount: Number(conflicts.data[0]?.n ?? 0),
    pendingPhotos: Number(photos.data[0]?.pending ?? 0),
    failedPhotos: Number(photos.data[0]?.failed ?? 0),
    uploadError: status.dataFlowStatus.uploadError ?? null,
    downloadError: status.dataFlowStatus.downloadError ?? null,
  }
}

/** Só rede (para avisos de telas que dependem da API online, como login e AccountPicker). */
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

/** Rebanhos para selects/filtros, opcionalmente só os de uma fazenda. */
export function useLocalHerds(farmId?: string) {
  const query = herdsListQuery({ farmId: farmId || undefined }, ALL_ROWS)
  const result = useQuery<HerdRow>(query.sql, query.params as unknown[])
  return useMemo(() => result.data.map(rowToHerd), [result.data])
}

