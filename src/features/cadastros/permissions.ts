import type { UserRole } from '@/api/types'

/** Fazendas, vacinas e tipos de animais: só master e admin alteram. Animais não usam esta regra. */
export function canManageCatalog(role: UserRole | null | undefined): boolean {
  return role === 'master' || role === 'admin'
}
