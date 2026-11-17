/**
 * Quem vê e quem altera o catálogo de vacinas. Lógica pura (testável no Node).
 *
 * HOJE (API main, write-policy.ts `vaccines: ['admin','master']`; stream `catalogs` = todas as vacinas para todos):
 * catálogo GLOBAL, master e admin cadastram/editam/excluem; básico não abre a tela (só escolhe no lançamento).
 *
 * DECISÃO NOVA (Felipe, 17/11/2026): vacinas POR CONTA. Master e básico cadastram/editam as vacinas da própria conta;
 * admin só visualiza (todas as contas). A API implementa primeiro (modelo, sync rules, upload offline).
 *
 * LIGADO (contrato API_INTEGRATION.md §25.2, 17/11/2026; PO: "básico cria e edita, só o master exclui, admin só lê").
 * Usado nas telas e no repository.assertCanWrite('vaccines'). Desligar volta ao catálogo global de antes (só faz
 * sentido junto com o rollback da API, §25.9).
 */
import type { UserRole } from '@/api/types'

export const VACCINES_PER_ACCOUNT = true

export type VaccineScope = 'none' | 'global' | 'own-account' | 'all-accounts'

export type VaccineAccess = {
  /** Item "Vacinas" no Menu e a lista. */
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  /** Abre o cadastro só para leitura (banner "Somente leitura", sem salvar/excluir). */
  readOnly: boolean
  scope: VaccineScope
}

const NONE: VaccineAccess = { canView: false, canCreate: false, canEdit: false, canDelete: false, readOnly: true, scope: 'none' }

export function vaccineAccess(role: UserRole | null | undefined, perAccount: boolean = VACCINES_PER_ACCOUNT): VaccineAccess {
  if (!perAccount) {
    if (role === 'master' || role === 'admin') {
      return { canView: true, canCreate: true, canEdit: true, canDelete: true, readOnly: false, scope: 'global' }
    }
    return NONE
  }
  if (role === 'admin') return { canView: true, canCreate: false, canEdit: false, canDelete: false, readOnly: true, scope: 'all-accounts' }
  if (role === 'master') return { canView: true, canCreate: true, canEdit: true, canDelete: true, readOnly: false, scope: 'own-account' }
  // Básico: cadastra e edita; excluir é só do master (PO, 17/11; API: upload DELETE → rejected 403).
  if (role === 'basic') return { canView: true, canCreate: true, canEdit: true, canDelete: false, readOnly: false, scope: 'own-account' }
  return NONE
}

/** Texto do banner quando a vacina abre só para leitura. */
export function vaccineReadOnlyMessage(access: VaccineAccess): string {
  return access.scope === 'all-accounts'
    ? 'Somente leitura. Cada conta cadastra as próprias vacinas; o administrador apenas consulta.'
    : 'Somente leitura. Você não pode alterar esta vacina.'
}
