/**
 * Schema local do PowerSync, gerado a partir de `mapping.ts` (não edite nomes aqui).
 * O PowerSync cria a coluna `id` (text) automaticamente.
 */
// @powersync/common é JS puro (não importa o op-sqlite): pode ser avaliado no Expo Go.
import { column, Schema, Table } from '@powersync/common'

import { columnList, LOCAL_INDEXES, OUTBOX_TABLE, PHOTO_QUEUE_TABLE, REJECTIONS_TABLE, SYNC_TABLES, type ColumnType, type SyncEntity } from './mapping'

const COLUMN = { text: column.text, integer: column.integer, real: column.real } as const

function columnsOf(entity: SyncEntity | 'rejections' | 'photoQueue' | 'outbox') {
  return Object.fromEntries(columnList(entity).map(([name, type]) => [name, COLUMN[type as ColumnType]]))
}

const tables: Record<string, Table> = {}
for (const entity of Object.keys(SYNC_TABLES) as SyncEntity[]) {
  const indexes = LOCAL_INDEXES[entity]
  tables[SYNC_TABLES[entity].table] = new Table(columnsOf(entity), indexes ? { indexes } : undefined)
}

/** Pendências recusadas pelo servidor: só local, nunca sobe na fila. */
tables[REJECTIONS_TABLE.table] = new Table(columnsOf('rejections'), { localOnly: true })

/** Fila de upload das fotos do embarque (o binário fica no filesystem; aqui só o caminho e o estado). */
tables[PHOTO_QUEUE_TABLE.table] = new Table(columnsOf('photoQueue'), { localOnly: true, indexes: { shipment: ['shipment_id'], link: ['link_id'], status: ['status'] } })

/** Operações a reenviar que já saíram do ps_crud (ver mapping.OUTBOX_TABLE). */
tables[OUTBOX_TABLE.table] = new Table(columnsOf('outbox'), { localOnly: true })

export const AppSchema = new Schema(tables)
