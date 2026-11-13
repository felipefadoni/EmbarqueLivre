/**
 * Quem cadastrou o usuário (REST, só admin vê). Contrato pedido à API: `createdBy: { id, name, email } | null`
 * em GET /account/users. Puro (sem cliente HTTP) para testes no Node.
 */
export type UserCreatedBy = { id: string | null; name: string | null; email: string | null }

const nullableStr = (value: unknown) => (typeof value === 'string' && value ? value : null)

/** Campo ausente → `{}` (a tela esconde); null/inválido → `{ createdBy: null }` (sem autor registrado). */
export function parseCreatedBy(r: Record<string, unknown>): { createdBy?: UserCreatedBy | null } {
  if (!('createdBy' in r)) return {}
  const value = r.createdBy
  if (!value || typeof value !== 'object') return { createdBy: null }
  const v = value as Record<string, unknown>
  return { createdBy: { id: nullableStr(v.id), name: nullableStr(v.name), email: nullableStr(v.email) } }
}
