/**
 * Adaptador ISOLADO da gravação de vacinas. A tela (VaccineEditor) só conhece esta interface.
 *
 * Hoje delega ao repositório local (SQLite do PowerSync → fila CRUD → POST /powersync/upload), o fluxo offline-first
 * que já funciona para o catálogo global. Nada aqui assume o contrato novo.
 *
 * TODO(contrato vacinas por conta), trocar SÓ aqui (e no repository/mapping), sem mexer na tela:
 *  - coluna de conta: NÃO gravar do app se a API a preencher pelo token (igual a farms.owner/created_by); se a API
 *    exigir no upload, incluir em toColumns('vaccines', …) com o accountId do usuário (setSyncUser já o tem);
 *  - unicidade do nome por conta (hoje: lower(name) global na API e nameTakenQuery global no aparelho);
 *  - papéis aceitos no repository.assertCanWrite('vaccines') (hoje master/admin);
 *  - códigos de erro novos (ex.: recusa de escrita do admin) em rejections.ts/errors.ts.
 */
import type { VaccinePayload } from '@/api/catalog'

export interface VaccineStore {
  /** Cria no banco local; devolve o id (ULID). Lança ApiError local (409 nome, 403 papel). */
  create(input: VaccinePayload): Promise<string>
  update(id: string, input: VaccinePayload): Promise<void>
  /** Lança ApiError 409 VACCINE_HAS_APPLICATIONS quando há lançamentos. */
  remove(id: string): Promise<void>
}

type VaccineRepo = {
  createVaccine(input: VaccinePayload): Promise<string>
  updateVaccine(id: string, input: VaccinePayload): Promise<unknown>
  deleteVaccine(id: string): Promise<unknown>
}

/** Implementação atual (catálogo global), sobre o repositório do PowerSync. */
export function createRepoVaccineStore(repo: VaccineRepo): VaccineStore {
  return {
    create: (input) => repo.createVaccine(input),
    update: async (id, input) => {
      await repo.updateVaccine(id, input)
    },
    remove: async (id) => {
      await repo.deleteVaccine(id)
    },
  }
}
