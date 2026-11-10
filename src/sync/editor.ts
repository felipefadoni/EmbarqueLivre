import { isApiError, publicApiMessage } from '@/api/errors'

import { db } from './database'
import { fromColumns, tableOf, type SyncEntity } from './mapping'
import type { SqlQuery } from './queries'
import { discardRejection, getRejection, parseOpData, rejectionFormField, resolveRejectionsForRow, type Rejection } from './rejections'

export type EditorSource<T> = {
  /** Registro local atual (null em criação ou se ainda não existe neste aparelho). */
  record: T | null
  /** Valores (campos do app) da operação recusada, para "Corrigir". */
  draft: Record<string, unknown> | null
  rejection: Rejection | null
}

/**
 * Carrega o registro do banco local (leitura única, para não sobrescrever o formulário durante a edição)
 * e, se vier `pendenciaId`, os valores que o servidor recusou.
 */
export async function loadEditorSource<Row, T>(
  entity: SyncEntity,
  query: SqlQuery | null,
  map: (row: Row) => T,
  pendenciaId?: string,
): Promise<EditorSource<T>> {
  const row = query ? await db.getOptional<Row>(query.sql, query.params as unknown[]) : null
  const rejection = pendenciaId ? await getRejection(db, pendenciaId) : null
  const draft = rejection && rejection.op !== 'DELETE' ? fromColumns(entity, parseOpData(rejection)) : null
  return { record: row ? map(row) : null, draft, rejection }
}

/** Depois de salvar/excluir localmente, a pendência da linha deixa de valer (a nova op substitui). */
export async function clearRowRejections(entity: SyncEntity, rowId: string | undefined) {
  if (!rowId) return
  await resolveRejectionsForRow(db, tableOf(entity), rowId).catch(() => undefined)
}

/**
 * Mostra a recusa do servidor no formulário: no campo apontado (details.field / código) ou, sem campo, no banner.
 */
export function showRejection(
  rejection: Rejection | null,
  setFieldErrors: (errors: Record<string, string>) => void,
  setFormError: (message: string | null) => void,
  formFields: readonly string[],
) {
  if (!rejection) return
  const field = rejectionFormField(rejection)
  if (field && formFields.includes(field)) setFieldErrors({ [field]: rejection.message })
  else setFormError(`O servidor recusou esta alteração: ${rejection.message}`)
}

export function draftString(draft: Record<string, unknown> | null, key: string): string | undefined {
  const value = draft?.[key]
  if (value === null) return ''
  return value === undefined ? undefined : String(value)
}

export function editorErrorMessage(error: unknown, fallback: string): string {
  return isApiError(error) ? publicApiMessage(error) : fallback
}

/** Remove a pendência que originou o "Corrigir" (a correção gera uma nova operação). */
export async function clearPendencia(pendenciaId: string | undefined) {
  if (!pendenciaId) return
  await discardRejection(db, pendenciaId).catch(() => undefined)
}
