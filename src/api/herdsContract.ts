/**
 * Contrato final de Rebanho (API_INTEGRATION.md §17.10 e §19).
 *
 * Única fonte dos nomes de tabela, colunas, rotas, filtros, códigos de erro e flags.
 * O mapping/schema do PowerSync (`src/sync/mapping.ts`) e as telas só leem estas chaves.
 *
 * - Tabela `herds` nos streams `account` (master/basic, pelo recorte das fazendas) e `admin_all` (admin).
 * - Coluna `animals.herd_id` (nullable): um animal em no máximo um rebanho, ou em nenhum.
 * - Nome único por fazenda, sem diferenciar maiúsculas (2–120 após trim).
 * - `formed_at` (YYYY-MM-DD, REST `formedAt`) é independente de `created_at` (timestamptz).
 *   "Hoje" é o dia em America/Sao_Paulo, não o fuso do aparelho.
 * - Excluir o rebanho desvincula os animais (`herd_id = null`); o servidor faz isso e o sync traz a mudança.
 * - A fazenda do rebanho é imutável (`HERD_FARM_IMMUTABLE`).
 * - Telas são offline-first (PowerSync). `path` documenta o REST, que a UI não chama.
 */
export const HERDS_CONTRACT = {
  provisional: false,
  table: 'herds',
  columns: {
    farmId: 'farm_id',
    name: 'name',
    description: 'description',
    formedAt: 'formed_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  /** Campo REST / app para a data de formação (coluna `formed_at`). */
  formedAtField: 'formedAt' as const,
  /** Coluna em `animals` (nullable). */
  animalHerdColumn: 'herd_id',
  animalHerdField: 'herdId' as const,
  streams: ['account', 'admin_all'] as const,
  stream: 'account' as const,
  path: '/herds',
  routes: {
    list: '/configuracoes/rebanhos',
    create: '/configuracoes/rebanhos/nova',
    edit: '/configuracoes/rebanhos/[id]',
  },
  filters: {
    farmId: 'farmId',
    search: 'search',
    herdId: 'herdId',
  },
  searchDebounceMs: 400,
  nameUniquePerFarm: true,
  nameUniqueCaseInsensitive: true,
  /** `created_at` não é a data de formação. */
  formedAtIsCreatedAt: false,
  formedAtRequired: true,
  formedAtMin: '1900-01-01',
  /** "Hoje" da data de formação: fuso do contrato, não o do aparelho. */
  todayTimeZone: 'America/Sao_Paulo',
  farmImmutable: true,
  /** Excluir rebanho: o servidor desvincula os animais; o app faz o mesmo offline. */
  unlinkAnimalsOnDelete: true,
  errors: {
    nameTaken: 'HERD_NAME_ALREADY_EXISTS',
    farmMismatch: 'HERD_FARM_MISMATCH',
    farmImmutable: 'HERD_FARM_IMMUTABLE',
    notFound: 'HERD_NOT_FOUND',
    invalidName: 'INVALID_HERD_NAME',
    invalidDescription: 'INVALID_HERD_DESCRIPTION',
    invalidFormedAt: 'INVALID_HERD_FORMED_AT',
    farmHasHerds: 'FARM_HAS_HERDS',
  },
  limits: {
    name: { min: 2, max: 120 },
    description: { max: 500 },
  },
} as const

export type HerdsContract = typeof HERDS_CONTRACT

/** YYYY-MM-DD de hoje no fuso do contrato (America/Sao_Paulo). */
export function todayIsoInHerdZone(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HERDS_CONTRACT.todayTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

/** Data civil real entre 1900-01-01 e hoje (America/Sao_Paulo, salvo `today` informado). */
export function isValidHerdFormedAt(iso: string, today = todayIsoInHerdZone()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day) return false
  return iso >= HERDS_CONTRACT.formedAtMin && iso <= today
}

/** Descrição: quebras de linha internas preservadas; vazia (ou só espaços) → null. */
export function normalizeHerdDescription(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
