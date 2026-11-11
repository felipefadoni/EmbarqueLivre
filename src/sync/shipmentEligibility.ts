/**
 * Análise de embarque: quais animais da fazenda podem embarcar no dia `shippedOn`.
 *
 * NÃO há fórmula nova: reaproveita a carência de `withdrawal.ts` (a mesma do resto do app e da API §18):
 * - freeAt = maior withdrawal_until das aplicações do animal FEITAS ATÉ o dia do embarque (applied_at <= shippedOn).
 *   Uma aplicação posterior ao embarque não conta. No SQL: `shipmentAnimalsQuery` (tela e repositório);
 *   em JS: `freeAtOnShipment` (mesmo resultado, via `summarizeWithdrawal`);
 * - em carência no dia D ⇔ `isActiveOn(freeAt, D)` ⇔ D < freeAt. Logo, no PRÓPRIO dia freeAt o animal já embarca;
 * - sem vacinação (freeAt null) = livre.
 * Animal vinculado a OUTRO embarque não entra nos livres (um animal em no máximo um embarque).
 *
 * Puro (sem React Native): usado pela tela e pelo repositório (mesma regra local que o backend valida no upload).
 */
import { isActiveOn, summarizeWithdrawal, type ApplicationLike } from './withdrawal'

export type EligibilityAnimal = { id: string; freeAt?: string | null }
export type ShipmentLinkLike = { animalId: string; shipmentId: string; shipmentName?: string | null; shipmentShippedOn?: string | null }

export type OtherShipment = { otherShipmentId: string; otherShipmentName: string | null; otherShipmentShippedOn: string | null }

export type ShipmentClassification<T extends EligibilityAnimal> = {
  /** Selecionáveis: livres no dia e sem outro embarque (inclui os já deste embarque). */
  free: T[]
  /** Só consulta: ficam livres em `freeAt` (depois do dia do embarque). */
  inWithdrawal: (T & { freeAt: string })[]
  /** Só consulta: já estão em outro embarque. */
  inOtherShipment: (T & OtherShipment)[]
}

/** freeAt no dia do embarque: só aplicações com appliedAt <= shippedOn (inclusive); nenhuma = null (livre). */
export function freeAtOnShipment(applications: readonly (ApplicationLike & { appliedAt: string })[], shippedOn: string): string | null {
  const window = applications.filter((item) => String(item.appliedAt).slice(0, 10) <= shippedOn)
  return summarizeWithdrawal(window, shippedOn).freeAt
}

/** Livre para embarcar no dia (mesma regra do app: livre NO dia freeAt; sem vacinação = livre). */
export function isFreeOn(freeAt: string | null | undefined, shippedOn: string): boolean {
  return !isActiveOn(freeAt ? String(freeAt).slice(0, 10) : null, shippedOn)
}

export function classifyShipmentAnimals<T extends EligibilityAnimal>(
  animals: readonly T[],
  links: readonly ShipmentLinkLike[],
  shipmentId: string | null | undefined,
  shippedOn: string,
): ShipmentClassification<T> {
  const current = shipmentId ? String(shipmentId).toUpperCase() : null
  const other = new Map<string, ShipmentLinkLike>()
  for (const link of links) {
    if (current && String(link.shipmentId).toUpperCase() === current) continue
    other.set(String(link.animalId).toUpperCase(), link)
  }
  const result: ShipmentClassification<T> = { free: [], inWithdrawal: [], inOtherShipment: [] }
  for (const animal of animals) {
    const link = other.get(String(animal.id).toUpperCase())
    if (link) {
      result.inOtherShipment.push({
        ...animal,
        otherShipmentId: link.shipmentId,
        otherShipmentName: link.shipmentName ?? null,
        otherShipmentShippedOn: link.shipmentShippedOn ?? null,
      })
    } else if (isFreeOn(animal.freeAt, shippedOn)) {
      result.free.push(animal)
    } else {
      result.inWithdrawal.push({ ...animal, freeAt: String(animal.freeAt).slice(0, 10) })
    }
  }
  return result
}

export type BlockedSelection<T extends EligibilityAnimal> = {
  inWithdrawal: (T & { freeAt: string })[]
  inOtherShipment: (T & OtherShipment)[]
  /** Ids selecionados que nem aparecem na fazenda (ex.: animal excluído ou transferido). */
  unknownIds: string[]
  count: number
}

/** Selecionados que deixaram de poder embarcar (ex.: a data mudou e o animal ainda está em carência nela). */
export function blockedSelection<T extends EligibilityAnimal>(
  selectedIds: Iterable<string>,
  classification: ShipmentClassification<T>,
): BlockedSelection<T> {
  const free = new Set(classification.free.map((animal) => animal.id))
  const withdrawal = new Map(classification.inWithdrawal.map((animal) => [animal.id, animal]))
  const elsewhere = new Map(classification.inOtherShipment.map((animal) => [animal.id, animal]))
  const out: BlockedSelection<T> = { inWithdrawal: [], inOtherShipment: [], unknownIds: [], count: 0 }
  for (const id of selectedIds) {
    if (free.has(id)) continue
    const inWithdrawal = withdrawal.get(id)
    const inOther = elsewhere.get(id)
    if (inWithdrawal) out.inWithdrawal.push(inWithdrawal)
    else if (inOther) out.inOtherShipment.push(inOther)
    else out.unknownIds.push(id)
  }
  out.count = out.inWithdrawal.length + out.inOtherShipment.length + out.unknownIds.length
  return out
}

/** Só os ids selecionados que continuam livres (para "Desmarcar os que não podem embarcar"). */
export function keepOnlyFree<T extends EligibilityAnimal>(selectedIds: Iterable<string>, classification: ShipmentClassification<T>): string[] {
  const free = new Set(classification.free.map((animal) => animal.id))
  return [...selectedIds].filter((id) => free.has(id))
}

function formatIso(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return ''
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Mensagem pt-BR do bloqueio de salvar (null quando nada bloqueia). */
export function blockedSelectionMessage(blocked: Pick<BlockedSelection<EligibilityAnimal>, 'inWithdrawal' | 'inOtherShipment' | 'unknownIds' | 'count'>, shippedOn: string): string | null {
  if (!blocked.count) return null
  const parts: string[] = []
  const w = blocked.inWithdrawal.length
  if (w) {
    parts.push(
      w === 1
        ? `1 animal selecionado estará em carência em ${formatIso(shippedOn)}`
        : `${w} animais selecionados estarão em carência em ${formatIso(shippedOn)}`,
    )
  }
  const o = blocked.inOtherShipment.length
  if (o) parts.push(o === 1 ? '1 animal selecionado já está em outro embarque' : `${o} animais selecionados já estão em outro embarque`)
  const u = blocked.unknownIds.length
  if (u) parts.push(u === 1 ? '1 animal selecionado não está mais nesta fazenda' : `${u} animais selecionados não estão mais nesta fazenda`)
  return `${parts.join('; ')}. Desmarque ${blocked.count === 1 ? 'esse animal' : 'esses animais'} ou escolha outra data para salvar.`
}
