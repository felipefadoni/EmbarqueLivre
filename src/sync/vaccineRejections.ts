/**
 * Pendências de vacinas por conta (API_INTEGRATION.md §25.2–§25.6): o que dizer e o que o usuário pode fazer.
 * Puro (testável no Node). A mensagem principal do cartão continua sendo a do servidor (pt-BR); aqui vai a
 * orientação e se "Corrigir" faz sentido. Nada é apagado: o dado recusado fica na Pendência até Descartar.
 */
import { entityOfTable } from './mapping'

export type RejectionGuidance = {
  /** Mostrar "Corrigir" (abre o formulário com o dado recusado). Sempre há "Descartar". */
  fixable: boolean
  /** Orientação curta abaixo da mensagem do servidor. */
  hint: string
}

type RejectionLike = { tableName: string; entity?: string; op: string; errorCode: string | null; statusCode?: number | null }

export const VACCINE_REJECTION_HINTS = {
  nameTaken:
    'Já existe um medicamento com esse nome nesta conta (maiúsculas e acentos não contam). Toque em Corrigir e use outro nome, ou descarte se for o mesmo medicamento.',
  hasApplications:
    'O medicamento não foi excluído porque há lançamentos com ele. Descarte este aviso: o medicamento volta para a lista com os lançamentos intactos.',
  idTaken:
    'Este cadastro de medicamento já existe em outra conta e não pode ser reaproveitado. Toque em Corrigir para cadastrar de novo (um novo registro é criado) ou descarte.',
  roleDelete: 'Só o master da conta pode excluir medicamentos. Descarte este aviso: o medicamento volta para a lista.',
  roleWrite:
    'O administrador apenas consulta os medicamentos; quem cadastra e edita é a própria conta (master ou usuário). Descarte este aviso: vale o que está no servidor.',
  accountMismatch:
    'O medicamento escolhido é de outra conta. Toque em Corrigir e escolha um medicamento da conta do animal; o lançamento continua guardado até lá.',
  remappedUnavailable:
    'Este medicamento era do catálogo antigo e não existe na conta do animal. Toque em Corrigir e escolha um medicamento da conta; o lançamento continua guardado até lá.',
} as const

export function vaccineRejectionGuidance(rejection: RejectionLike): RejectionGuidance | null {
  const entity = entityOfTable(rejection.tableName) ?? rejection.entity
  const code = rejection.errorCode ?? ''
  if (entity === 'vaccines') {
    if (code === 'VACCINE_NAME_ALREADY_EXISTS' || (code === 'CONFLICT' && rejection.op !== 'DELETE')) return { fixable: true, hint: VACCINE_REJECTION_HINTS.nameTaken }
    if (code === 'VACCINE_HAS_APPLICATIONS') return { fixable: false, hint: VACCINE_REJECTION_HINTS.hasApplications }
    if (code === 'ID_ALREADY_EXISTS') return { fixable: true, hint: VACCINE_REJECTION_HINTS.idTaken }
    if (code === 'INSUFFICIENT_ROLE') return { fixable: false, hint: rejection.op === 'DELETE' ? VACCINE_REJECTION_HINTS.roleDelete : VACCINE_REJECTION_HINTS.roleWrite }
    return null
  }
  if (entity === 'vaccinations') {
    if (code === 'ANIMAL_ACCOUNT_MISMATCH') return { fixable: true, hint: VACCINE_REJECTION_HINTS.accountMismatch }
    if (code === 'VACCINE_REMAPPED_UNAVAILABLE') return { fixable: true, hint: VACCINE_REJECTION_HINTS.remappedUnavailable }
  }
  return null
}
