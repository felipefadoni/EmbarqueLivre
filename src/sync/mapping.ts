/**
 * MAPEAMENTO ÚNICO entre o app e as tabelas sincronizadas pelo PowerSync.
 *
 * Ajuste AQUI quando o backend confirmar os nomes finais (tabelas, colunas e tipos).
 * Nenhum outro arquivo do app escreve nome de tabela/coluna à mão: SQL, schema local,
 * prefill de pendências e upload usam este módulo.
 *
 * Contrato final do backend (API_INTEGRATION.md §19, 10/11/2026): tabelas farms, vaccines,
 * animal_types, animals, animal_vaccinations (NÃO há tabela de usuários); colunas snake_case sem
 * prefixo, com `id`; o opData do upload usa os mesmos nomes. IDs são ULID em MAIÚSCULAS.
 * Streams (auto_subscribe): catalogs (todos), account (master/basic), admin_all (admin).
 * - `id` é sempre a coluna `id` (texto, ULID) criada pelo PowerSync.
 * - Datas civis (YYYY-MM-DD) e timestamps (ISO 8601) são `text`.
 * - Inteiros (dias de carência) são `integer`.
 *
 * Este arquivo é puro (sem React Native) para poder ser testado no Node.
 * Rebanho: nomes do contrato final em `HERDS_CONTRACT` (`src/api/herdsContract.ts`, §17.10 e §19).
 * Embarque: nomes do contrato final em `SHIPMENTS_CONTRACT` (`src/api/shipmentsContract.ts`, §17.11 e §19).
 */

import { AUTHOR_CONTRACT } from '../api/authorContract'
import { HERDS_CONTRACT } from '../api/herdsContract'
import { SHIPMENT_FLOW_CONTRACT, SHIPMENTS_CONTRACT } from '../api/shipmentsContract'

export type ColumnType = 'text' | 'integer' | 'real'

type ColumnDef = { name: string; type: ColumnType }

function col(name: string, type: ColumnType = 'text'): ColumnDef {
  return { name, type }
}

export const SYNC_TABLES = {
  farms: {
    table: 'farms',
    columns: {
      /** Só o admin envia no PUT. Master/basic: o servidor atribui à conta de quem cria. Nunca vai em PATCH. */
      accountId: col('account_id'),
      /** @deprecated alias de account_id; lido se account_id estiver vazio (dados antigos, antes do re-download). */
      ownerUserId: col('owner_user_id'),
      name: col('name'),
      city: col('city'),
      state: col('state'),
      /** Só download, só admin (stream admin_all): nome/e-mail de quem cadastrou. Nunca sobem (NEVER_UPLOAD_COLUMNS). */
      createdByName: col(AUTHOR_CONTRACT.farms.name ?? 'created_by_name'),
      createdByEmail: col(AUTHOR_CONTRACT.farms.email ?? 'created_by_email'),
      createdAt: col('created_at'),
      updatedAt: col('updated_at'),
    },
  },
  vaccines: {
    table: 'vaccines',
    columns: {
      name: col('name'),
      withdrawalDays: col('withdrawal_days', 'integer'),
      createdAt: col('created_at'),
      updatedAt: col('updated_at'),
    },
  },
  animalTypes: {
    table: 'animal_types',
    columns: {
      name: col('name'),
      createdAt: col('created_at'),
      updatedAt: col('updated_at'),
    },
  },
  animals: {
    table: 'animals',
    columns: {
      farmId: col('farm_id'),
      animalTypeId: col('animal_type_id'),
      code: col('code'),
      sex: col('sex'),
      breed: col('breed'),
      birthDate: col('birth_date'),
      /** Nullable; ausente num PUT de animal = null (desvincula). Sempre enviar quando o animal tem rebanho. */
      herdId: col(HERDS_CONTRACT.animalHerdColumn),
      /** Flag oficial (do servidor): saiu num embarque finalizado → some da lista de cadastrados. O app grava ao finalizar. */
      shippedAt: col(SHIPMENT_FLOW_CONTRACT.animalShippedAtColumn),
      /** Só download, só admin (stream admin_all): nome/e-mail de quem cadastrou. Nunca sobem (NEVER_UPLOAD_COLUMNS). */
      createdByName: col(AUTHOR_CONTRACT.animals.name ?? 'created_by_name'),
      createdByEmail: col(AUTHOR_CONTRACT.animals.email ?? 'created_by_email'),
      createdAt: col('created_at'),
      updatedAt: col('updated_at'),
    },
  },
  herds: {
    table: HERDS_CONTRACT.table,
    columns: {
      farmId: col(HERDS_CONTRACT.columns.farmId),
      name: col(HERDS_CONTRACT.columns.name),
      description: col(HERDS_CONTRACT.columns.description),
      formedAt: col(HERDS_CONTRACT.columns.formedAt),
      /** Só download, só admin (stream admin_all): nome/e-mail de quem cadastrou. Nunca sobem (NEVER_UPLOAD_COLUMNS). */
      createdByName: col(AUTHOR_CONTRACT.herds.name ?? 'created_by_name'),
      createdByEmail: col(AUTHOR_CONTRACT.herds.email ?? 'created_by_email'),
      createdAt: col(HERDS_CONTRACT.columns.createdAt),
      updatedAt: col(HERDS_CONTRACT.columns.updatedAt),
    },
  },
  shipments: {
    table: SHIPMENTS_CONTRACT.table,
    columns: {
      farmId: col(SHIPMENTS_CONTRACT.columns.farmId),
      name: col(SHIPMENTS_CONTRACT.columns.name),
      shippedOn: col(SHIPMENTS_CONTRACT.columns.shippedOn),
      /** Calculado pelo servidor (quem criou); o app grava localmente e o upload o ignora. */
      createdByUserId: col(SHIPMENTS_CONTRACT.columns.createdByUserId),
      /** in_progress | finished (null = in_progress). `finished` no PATCH finaliza (sync). */
      status: col(SHIPMENT_FLOW_CONTRACT.columns.status),
      /** Do servidor: quando foi finalizado (o app grava localmente ao finalizar; nunca sobe). */
      finishedAt: col(SHIPMENT_FLOW_CONTRACT.columns.finishedAt),
      createdAt: col(SHIPMENTS_CONTRACT.columns.createdAt),
      updatedAt: col(SHIPMENTS_CONTRACT.columns.updatedAt),
    },
  },
  /** Vínculo embarque ↔ animal: uma linha por animal (um animal em no máximo um embarque). */
  shipmentAnimals: {
    table: SHIPMENTS_CONTRACT.linkTable,
    columns: {
      shipmentId: col(SHIPMENTS_CONTRACT.linkColumns.shipmentId),
      animalId: col(SHIPMENTS_CONTRACT.linkColumns.animalId),
      /** Peso em kg (1–2000, 1 casa). Obrigatório em vínculo novo; null só em vínculo antigo. */
      weightKg: col(SHIPMENT_FLOW_CONTRACT.linkColumns.weightKg, 'real'),
      /** Foto já enviada por POST /shipments/:id/photos (id gerado no app). Obrigatória em vínculo novo. */
      photoId: col(SHIPMENT_FLOW_CONTRACT.linkColumns.photoId),
      /** Do servidor (copiados do registro da foto); nunca sobem. */
      photoContentType: col(SHIPMENT_FLOW_CONTRACT.linkColumns.photoContentType),
      photoSizeBytes: col(SHIPMENT_FLOW_CONTRACT.linkColumns.photoSizeBytes, 'integer'),
      createdAt: col(SHIPMENTS_CONTRACT.linkColumns.createdAt),
      updatedAt: col(SHIPMENTS_CONTRACT.linkColumns.updatedAt),
    },
  },
  vaccinations: {
    table: 'animal_vaccinations',
    columns: {
      animalId: col('animal_id'),
      /** Denormalizado (fazenda atual do animal). O servidor mantém; o app grava a fazenda do animal. */
      farmId: col('farm_id'),
      vaccineId: col('vaccine_id'),
      appliedAt: col('applied_at'),
      /** Cópia dos dias da vacina no momento do registro. */
      withdrawalDays: col('withdrawal_days', 'integer'),
      /** Gerada no servidor (applied_at + days). Localmente o app calcula e grava. */
      withdrawalUntil: col('withdrawal_until'),
      createdByUserId: col('created_by_user_id'),
      createdAt: col('created_at'),
      updatedAt: col('updated_at'),
    },
  },
} as const

/** Entidades que o app escreve localmente. */
export const WRITABLE_ENTITIES = ['farms', 'vaccines', 'animalTypes', 'animals', 'herds', 'shipments', 'shipmentAnimals', 'vaccinations'] as const

/** Limite de operações por POST /powersync/upload. */
export const UPLOAD_BATCH_LIMIT = 500

/**
 * timestamptz chega do PowerSync como ISO UTC com microssegundos ("2026-11-10T15:17:43.051812Z").
 * Para o `new Date` do Hermes ser previsível: espaço → T e fração truncada em 3 casas (milissegundos).
 * Datas civis (YYYY-MM-DD) passam inalteradas.
 */
export function normalizeTimestamp(raw: string | null | undefined): string | null {
  if (!raw) return null
  let value = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2} \d/.test(value)) value = value.replace(' ', 'T')
  return value.replace(/(T\d{2}:\d{2}:\d{2})\.(\d{1,3})\d*/, '$1.$2')
}

export function parseTimestamp(raw: string | null | undefined): Date | null {
  const normalized = normalizeTimestamp(raw)
  if (!normalized) return null
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export type SyncEntity = keyof typeof SYNC_TABLES
export type EntityField<E extends SyncEntity> = keyof (typeof SYNC_TABLES)[E]['columns']

/**
 * Colunas derivadas pelo servidor: o app grava localmente (para as consultas offline
 * funcionarem), envia no upload, e o backend deve IGNORAR/recalcular.
 */
export const SERVER_DERIVED_COLUMNS: Partial<Record<SyncEntity, string[]>> = {
  vaccinations: [
    SYNC_TABLES.vaccinations.columns.farmId.name,
    SYNC_TABLES.vaccinations.columns.withdrawalDays.name,
    SYNC_TABLES.vaccinations.columns.withdrawalUntil.name,
    SYNC_TABLES.vaccinations.columns.createdByUserId.name,
  ],
  shipments: [SYNC_TABLES.shipments.columns.createdByUserId.name, SYNC_TABLES.shipments.columns.finishedAt.name],
  animals: [SYNC_TABLES.animals.columns.shippedAt.name],
  shipmentAnimals: [SYNC_TABLES.shipmentAnimals.columns.photoContentType.name, SYNC_TABLES.shipmentAnimals.columns.photoSizeBytes.name],
}

/**
 * Colunas só do servidor (readOnly no /powersync/upload) que o app grava localmente para as telas offline e que
 * NUNCA sobem: finished_at, shipped_at (gravados ao finalizar) e os metadados da foto. Um PATCH que fique vazio
 * depois de removê-las (ex.: o shipped_at dos animais ao finalizar) não é enviado.
 */
export const NEVER_UPLOAD_COLUMNS: Partial<Record<SyncEntity, string[]>> = {
  // created_by_name/created_by_email: autor (só download, admin). A API já ignora, mas o app também tira de PUT/PATCH,
  // da saída de reenvio e do envio forçado (todos passam por toUploadOp); o snapshot local guarda para a restauração.
  farms: [SYNC_TABLES.farms.columns.createdByName.name, SYNC_TABLES.farms.columns.createdByEmail.name],
  herds: [SYNC_TABLES.herds.columns.createdByName.name, SYNC_TABLES.herds.columns.createdByEmail.name],
  shipments: [SYNC_TABLES.shipments.columns.finishedAt.name],
  animals: [
    SYNC_TABLES.animals.columns.shippedAt.name,
    SYNC_TABLES.animals.columns.createdByName.name,
    SYNC_TABLES.animals.columns.createdByEmail.name,
  ],
  shipmentAnimals: [SYNC_TABLES.shipmentAnimals.columns.photoContentType.name, SYNC_TABLES.shipmentAnimals.columns.photoSizeBytes.name],
}

/**
 * Fila local (não sincronizada) das fotos de animais do embarque. Uma linha por foto: id = photo_id (ULID gerado no
 * app e enviado como `id` no POST /shipments/:id/photos; repetir devolve a mesma foto). link_id = shipment_animals.id.
 * status: pending (aguardando envio) | uploaded | failed (recusa definitiva do servidor) | downloaded (veio do servidor
 * para uso offline; nunca sobe).
 */
export const PHOTO_QUEUE_TABLE = {
  table: SHIPMENT_FLOW_CONTRACT.photoQueueTable,
  columns: {
    shipmentId: col('shipment_id'),
    animalId: col('animal_id'),
    linkId: col('link_id'),
    localUri: col('local_uri'),
    status: col('status'),
    attempts: col('attempts', 'integer'),
    lastError: col('last_error'),
    createdAt: col('created_at'),
    updatedAt: col('updated_at'),
  },
} as const

/**
 * Saída de reenvio (local, nunca sobe como tabela): operações que já saíram da fila do PowerSync (`ps_crud`) mas ainda
 * precisam chegar à API — hoje, as que versões anteriores do app tinham marcado como Pendência por engano (falha de
 * rede/servidor, 404 de rota/proxy, 401…). O connector as envia ANTES da fila, na ordem em que foram criadas.
 */
export const OUTBOX_TABLE = {
  table: 'sync_outbox',
  columns: {
    tableName: col('table_name'),
    rowId: col('row_id'),
    op: col('op'),
    opData: col('op_data'),
    attempts: col('attempts', 'integer'),
    lastError: col('last_error'),
    createdAt: col('created_at'),
    /**
     * null/'retry' = reenvio automático na ordem (antes da fila); 'conflict' = o servidor não aceitou por referência
     * ausente/acesso (fica guardado, não trava a fila, só é forçado com confirmação); 'sent' = aceito pela API,
     * guardado até o download confirmar (se o servidor não devolver, o cadastro local é restaurado).
     */
    state: col('state'),
    statusCode: col('status_code', 'integer'),
    errorCode: col('error_code'),
    message: col('message'),
    field: col('field'),
    /** Linha local completa (JSON das colunas) no momento do envio/recusa: o que é restaurado se o download apagar. */
    snapshot: col('snapshot'),
    nextAt: col('next_at'),
    sentAt: col('sent_at'),
  },
} as const

/** Tabela local: id local de tipo/vacina → id do mesmo nome no servidor (confirmado pelo usuário no envio forçado). */
export const ID_MAP_TABLE = {
  table: 'sync_id_map',
  columns: {
    tableName: col('table_name'),
    localId: col('local_id'),
    serverId: col('server_id'),
    name: col('name'),
    createdAt: col('created_at'),
  },
} as const

/** Tabela local (não sincronizada) com as operações recusadas pelo servidor. */
export const REJECTIONS_TABLE = {
  table: 'sync_rejections',
  columns: {
    entity: col('entity'),
    tableName: col('table_name'),
    rowId: col('row_id'),
    op: col('op'),
    opData: col('op_data'),
    statusCode: col('status_code', 'integer'),
    errorCode: col('error_code'),
    message: col('message'),
    /** Coluna apontada pelo servidor (`error.details.field`, snake_case), para destacar o campo no "Corrigir". */
    field: col('field'),
    createdAt: col('created_at'),
  },
} as const

/** Nome da tabela (como aparece no SQL local e no `table` do CrudEntry). */
export function tableOf(entity: SyncEntity): string {
  return SYNC_TABLES[entity].table
}

/** Nome da coluna de um campo do app. */
export function colOf<E extends SyncEntity>(entity: E, field: EntityField<E>): string {
  const columns = SYNC_TABLES[entity].columns as Record<string, ColumnDef>
  return columns[field as string].name
}

/** Campo do app a partir do nome da coluna (ex.: details.field "withdrawal_days" → "withdrawalDays"). */
export function fieldOfColumn(entity: SyncEntity, column: string | null | undefined): string | null {
  if (!column) return null
  const columns = SYNC_TABLES[entity].columns as Record<string, ColumnDef>
  for (const [field, def] of Object.entries(columns)) if (def.name === column) return field
  return null
}

/** Entidade a partir do nome da tabela (CrudEntry.table). */
export function entityOfTable(table: string): SyncEntity | null {
  for (const [entity, def] of Object.entries(SYNC_TABLES)) {
    if (def.table === table) return entity as SyncEntity
  }
  return null
}

/** Converte { campo: valor } do app para { coluna: valor } (ignora campos desconhecidos/undefined). */
export function toColumns<E extends SyncEntity>(
  entity: E,
  values: Partial<Record<EntityField<E>, unknown>>,
): Record<string, unknown> {
  const columns = SYNC_TABLES[entity].columns as Record<string, ColumnDef>
  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined) continue
    const def = columns[field]
    if (def) out[def.name] = value
  }
  return out
}

/** Converte { coluna: valor } (ex.: opData de uma pendência) de volta para { campo: valor }. */
export function fromColumns(entity: SyncEntity, data: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!data) return out
  const columns = SYNC_TABLES[entity].columns as Record<string, ColumnDef>
  for (const [field, def] of Object.entries(columns)) {
    if (def.name in data) out[field] = data[def.name]
  }
  return out
}

/** Lista [nome, tipo] de colunas de uma tabela (para o schema PowerSync e para os testes). */
export function columnList(entity: SyncEntity | 'rejections' | 'photoQueue' | 'outbox' | 'idMap'): [string, ColumnType][] {
  const columns = (
    entity === 'idMap'
      ? ID_MAP_TABLE.columns
      : entity === 'rejections'
      ? REJECTIONS_TABLE.columns
      : entity === 'photoQueue'
        ? PHOTO_QUEUE_TABLE.columns
        : entity === 'outbox'
          ? OUTBOX_TABLE.columns
          : SYNC_TABLES[entity].columns
  ) as Record<
    string,
    ColumnDef
  >
  return Object.values(columns).map((def) => [def.name, def.type])
}

/** Índices locais (nomes de colunas) para as consultas mais usadas. */
export const LOCAL_INDEXES: Partial<Record<SyncEntity, Record<string, string[]>>> = {
  animals: {
    farm: [SYNC_TABLES.animals.columns.farmId.name],
    type: [SYNC_TABLES.animals.columns.animalTypeId.name],
    code: [SYNC_TABLES.animals.columns.code.name],
    herd: [SYNC_TABLES.animals.columns.herdId.name],
  },
  herds: {
    farm: [SYNC_TABLES.herds.columns.farmId.name],
    name: [SYNC_TABLES.herds.columns.name.name],
  },
  shipments: {
    farm: [SYNC_TABLES.shipments.columns.farmId.name],
    name: [SYNC_TABLES.shipments.columns.name.name],
  },
  shipmentAnimals: {
    shipment: [SYNC_TABLES.shipmentAnimals.columns.shipmentId.name],
    animal: [SYNC_TABLES.shipmentAnimals.columns.animalId.name],
  },
  vaccinations: {
    animal: [SYNC_TABLES.vaccinations.columns.animalId.name],
    applied: [SYNC_TABLES.vaccinations.columns.appliedAt.name],
    farm_applied: [SYNC_TABLES.vaccinations.columns.farmId.name, SYNC_TABLES.vaccinations.columns.appliedAt.name],
    vaccine: [SYNC_TABLES.vaccinations.columns.vaccineId.name],
  },
}
