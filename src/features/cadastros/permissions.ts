import type { UserRole } from '@/api/types'

function isStaff(role: UserRole | null | undefined): boolean {
  return role === 'master' || role === 'admin'
}

/** @deprecated Prefira canManageVaccines / canManageFarms. Equivale a master ou admin. */
export function canManageCatalog(role: UserRole | null | undefined): boolean {
  return isStaff(role)
}

/** Menu → Usuários: master (a própria conta) e admin (todas). Basic não vê o item nem abre as rotas. */
export function canManageUsers(role: UserRole | null | undefined): boolean {
  return isStaff(role)
}

/** Fazendas: master e admin criam, editam e excluem. Basic não vê o item nem abre as rotas. */
export function canManageFarms(role: UserRole | null | undefined): boolean {
  return isStaff(role)
}

/** Catálogo de vacinas (`/configuracoes/vacinas`): master e admin. A aba Vacinas (lançamentos) é de todos. */
export function canManageVaccines(role: UserRole | null | undefined): boolean {
  return isStaff(role)
}

/** Rebanho: master e admin gerenciam. Basic não vê o item nem abre as rotas (só escolhe um rebanho existente no animal). */
export function canManageHerds(role: UserRole | null | undefined): boolean {
  return isStaff(role)
}

/** Tipos de animais (catálogo global): master e admin vêem o item; basic não. */
export function canViewAnimalTypes(role: UserRole | null | undefined): boolean {
  return isStaff(role)
}

/** Tipos de animais: só o admin cria, edita e exclui. Master vê a lista em modo leitura. */
export function canManageAnimalTypes(role: UserRole | null | undefined): boolean {
  return role === 'admin'
}

/**
 * Embarques (operacional, aba própria na barra inferior): basic, master e admin vêem a aba, cadastram e editam
 * (nome, data, animais com foto e peso) enquanto Em andamento. A aba NÃO é escondida do basic.
 */
export function canManageShipments(role: UserRole | null | undefined): boolean {
  return role === 'basic' || isStaff(role)
}

/** Excluir embarque: só master e admin. Basic não vê o botão; o repositório recusa com INSUFFICIENT_ROLE. */
export function canDeleteShipments(role: UserRole | null | undefined): boolean {
  return isStaff(role)
}

/** Finalizar embarque (Em andamento → Finalizado): basic, master e admin. Excluir continua só master/admin. */
export function canFinishShipments(role: UserRole | null | undefined): boolean {
  return canManageShipments(role)
}
