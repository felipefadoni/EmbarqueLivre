/**
 * Exclusão da própria conta (exigência da Play Store). Lógica pura, sem React Native, testável no Node.
 * Contrato: embarquelivre-api docs/API_INTEGRATION.md §6.10
 *   GET  /auth/me/deletion-preview -> DeletionPreview (Cache-Control: no-store)
 *   POST /auth/me/deletion { password, scope } -> 200 { status: 'deleted' | 'already_deleted', ... }
 */
import type { ApiError } from '@/api/types'

export type DeletionScope = 'user' | 'account'

export type DeletionCounts = {
  farms: number
  herds: number
  animals: number
  vaccinations: number
  /** Pesagens dos animais da conta. A API antiga pode não mandar: conta como 0. */
  weighings: number
  shipments: number
  photos: number
  /** Usuários vivos da conta, o próprio incluído. */
  users: number
}

export type DeletionPreview = {
  scope: DeletionScope
  role: string
  isAccountOwner: boolean
  account: { id: string; name: string } | null
  /** Só vem quando scope = 'account'. */
  counts: DeletionCounts | null
}

export type DeletionResult =
  | {
      status: 'deleted'
      scope: DeletionScope
      deletedAt: string
      counts: DeletionCounts | null
      photos: { removed: number; pending: number }
    }
  | { status: 'already_deleted' }

export const DELETION_PASSWORD_MAX = 128

/** Admin não exclui a própria conta pelo app (a API responde 403 ADMIN_SELF_DELETION_FORBIDDEN): a opção nem aparece. */
export function canDeleteOwnAccount(role: string | null | undefined): boolean {
  return role === 'master' || role === 'basic'
}

const COUNT_KEYS = ['farms', 'herds', 'animals', 'vaccinations', 'weighings', 'shipments', 'photos', 'users'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toCount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function parseCounts(value: unknown): DeletionCounts | null {
  if (!isRecord(value)) return null
  const out = {} as DeletionCounts
  for (const key of COUNT_KEYS) out[key] = toCount(value[key])
  return out
}

const INVALID_RESPONSE: ApiError = { status: 0, code: 'INTERNAL_ERROR' }

/** Valida a resposta do preview. Resposta fora do contrato vira erro (nunca mostra aviso incompleto). */
export function parseDeletionPreview(data: unknown): DeletionPreview {
  if (!isRecord(data) || (data.scope !== 'user' && data.scope !== 'account')) throw INVALID_RESPONSE
  const account =
    isRecord(data.account) && typeof data.account.id === 'string'
      ? { id: data.account.id, name: typeof data.account.name === 'string' ? data.account.name : '' }
      : null
  const counts = parseCounts(data.counts)
  // Conta inteira sem contagem = não sabemos o que será apagado: não deixa confirmar.
  if (data.scope === 'account' && !counts) throw INVALID_RESPONSE
  return {
    scope: data.scope,
    role: typeof data.role === 'string' ? data.role : '',
    isAccountOwner: data.isAccountOwner === true,
    account,
    counts: data.scope === 'account' ? counts : null,
  }
}

export function parseDeletionResult(data: unknown): DeletionResult {
  if (!isRecord(data)) throw INVALID_RESPONSE
  if (data.status === 'already_deleted') return { status: 'already_deleted' }
  if (data.status !== 'deleted') throw INVALID_RESPONSE
  const photos = isRecord(data.photos) ? data.photos : {}
  return {
    status: 'deleted',
    scope: data.scope === 'account' ? 'account' : 'user',
    deletedAt: typeof data.deletedAt === 'string' ? data.deletedAt : '',
    counts: parseCounts(data.counts),
    photos: { removed: toCount(photos.removed), pending: toCount(photos.pending) },
  }
}

// ---------------------------------------------------------------------------------------------
// Formatação pt-BR (sem Intl: o Hermes nem sempre traz locale pt-BR; separador de milhar manual)
// ---------------------------------------------------------------------------------------------

export function formatInteger(n: number): string {
  const value = Math.max(0, Math.floor(Number(n) || 0))
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function pluralize(n: number, singular: string, plural: string): string {
  return `${formatInteger(n)} ${n === 1 ? singular : plural}`
}

/** "a", "a e b", "a, b e c" */
export function joinPtBr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

const COUNT_LABELS: Record<Exclude<(typeof COUNT_KEYS)[number], 'users'>, [string, string]> = {
  farms: ['fazenda', 'fazendas'],
  herds: ['rebanho', 'rebanhos'],
  animals: ['animal', 'animais'],
  vaccinations: ['registro de aplicação', 'registros de aplicação'],
  weighings: ['pesagem registrada', 'pesagens registradas'],
  shipments: ['embarque', 'embarques'],
  photos: ['foto', 'fotos'],
}

/** Itens com quantidade > 0, na ordem do contrato. "users" inclui o próprio usuário. */
export function deletionCountItems(counts: DeletionCounts): string[] {
  const items: string[] = []
  for (const key of COUNT_KEYS) {
    const n = counts[key]
    if (n <= 0) continue
    if (key === 'users') {
      items.push(n === 1 ? '1 usuário (você)' : `${pluralize(n, 'usuário', 'usuários')} da equipe (incluindo você)`)
    } else {
      const [singular, plural] = COUNT_LABELS[key]
      items.push(pluralize(n, singular, plural))
    }
  }
  return items
}

/** Ex.: "Serão apagados para sempre: 2 fazendas, 1.284 animais e 3 usuários da equipe (incluindo você)." */
export function formatDeletionCounts(counts: DeletionCounts): string {
  const items = deletionCountItems(counts)
  if (items.length === 0) return 'Não há fazendas, animais ou embarques cadastrados nesta conta.'
  return `Serão apagados para sempre: ${joinPtBr(items)}.`
}

export type DeletionWarning = { title: string; paragraphs: string[] }

export function deletionWarning(preview: DeletionPreview): DeletionWarning {
  const name = preview.account?.name?.trim()
  if (preview.scope === 'account') {
    const counts = preview.counts
    const others = Math.max(0, (counts?.users ?? 1) - 1)
    const paragraphs = [
      name
        ? `Você é o dono da conta “${name}”. Excluir apaga a conta inteira, não só o seu acesso.`
        : 'Você é o dono desta conta. Excluir apaga a conta inteira, não só o seu acesso.',
      counts ? formatDeletionCounts(counts) : '',
    ]
    if (others > 0) {
      paragraphs.push(
        `${others === 1 ? 'A outra pessoa da equipe perde' : `As outras ${formatInteger(others)} pessoas da equipe perdem`} o acesso na hora.`,
      )
    }
    paragraphs.push('Não é possível recuperar nada depois.')
    return { title: 'Isso apaga a conta inteira', paragraphs: paragraphs.filter(Boolean) }
  }
  return {
    title: 'Isso apaga seus dados pessoais',
    paragraphs: [
      'Seu nome, e-mail, telefone e senha serão apagados e você não poderá mais entrar.',
      name
        ? `A conta “${name}” e os registros das fazendas continuam com a equipe. O que você cadastrou fica sem o nome do autor.`
        : 'Os registros das fazendas continuam com a equipe. O que você cadastrou fica sem o nome do autor.',
      'Não é possível desfazer.',
    ],
  }
}

export type UnsentSummary = { uploads: number; rejections: number }

/** Aviso das alterações deste aparelho que ainda não chegaram ao servidor (serão perdidas). null = nada pendente. */
export function unsentChangesWarning(unsent: UnsentSummary): string | null {
  const parts: string[] = []
  if (unsent.uploads > 0) {
    parts.push(
      unsent.uploads === 1 ? '1 alteração ainda não enviada' : `${formatInteger(unsent.uploads)} alterações ainda não enviadas`,
    )
  }
  if (unsent.rejections > 0) {
    parts.push(
      unsent.rejections === 1
        ? '1 pendência recusada pelo servidor'
        : `${formatInteger(unsent.rejections)} pendências recusadas pelo servidor`,
    )
  }
  if (parts.length === 0) return null
  return `Este aparelho tem ${joinPtBr(parts)}. Elas serão perdidas. Se quiser guardar, conecte-se à internet e aguarde a sincronização, ou resolva as pendências antes.`
}

/** "45 segundos", "1 minuto", "15 minutos" (arredonda minutos para cima). */
export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(Number(seconds) || 0))
  if (s < 60) return s === 1 ? '1 segundo' : `${s} segundos`
  const minutes = Math.ceil(s / 60)
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`
}

/** "14:59" para o botão durante o bloqueio. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------------------------
// Erros -> ação da tela
// ---------------------------------------------------------------------------------------------

export const DELETION_MESSAGES = {
  wrongPassword: 'Senha atual incorreta.',
  scopeChanged: 'Sua permissão na conta mudou. Revise o aviso abaixo e confirme de novo.',
  adminForbidden:
    'Administradores não podem excluir a própria conta pelo aplicativo. Fale com o suporte do Embarque Livre.',
  sessionEnded: 'Sua sessão terminou. Entre de novo para continuar.',
  offlineSubmit:
    'Sem conexão com o servidor. Sua conta não foi excluída. Verifique a internet e toque em “Excluir minha conta” de novo.',
  offlinePreview: 'Para excluir a conta é preciso estar conectado à internet. Conecte-se e toque em “Tentar novamente”.',
  previewFailed: 'Não foi possível carregar as informações da conta. Tente novamente.',
  invalid: 'Confira a senha e tente de novo.',
  unknown: 'Não foi possível excluir a conta agora. Nada foi apagado. Tente de novo em instantes.',
  deleted: 'Conta excluída. Os dados deste aparelho foram apagados.',
} as const

export type DeletionErrorAction =
  | { kind: 'wrong-password'; message: string }
  | { kind: 'scope-changed'; message: string }
  | { kind: 'rate-limited'; message: string; retryAfterSeconds: number }
  | { kind: 'admin-forbidden'; message: string }
  | { kind: 'session-ended'; message: string }
  | { kind: 'offline'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'unknown'; message: string }

export function mapDeletionError(error: ApiError): DeletionErrorAction {
  if (error.code === 'INVALID_CURRENT_PASSWORD') return { kind: 'wrong-password', message: DELETION_MESSAGES.wrongPassword }
  if (error.code === 'ADMIN_SELF_DELETION_FORBIDDEN') return { kind: 'admin-forbidden', message: DELETION_MESSAGES.adminForbidden }
  if (error.code === 'ACCOUNT_DELETION_SCOPE_MISMATCH' || error.status === 409) {
    return { kind: 'scope-changed', message: DELETION_MESSAGES.scopeChanged }
  }
  if (error.status === 429) {
    const seconds = error.retryAfterSeconds && error.retryAfterSeconds > 0 ? error.retryAfterSeconds : 60
    const message =
      error.reason === 'TOO_MANY_PASSWORD_ATTEMPTS'
        ? `Muitas tentativas com a senha errada. Tente de novo em ${formatWait(seconds)}.`
        : `Muitas tentativas. Tente de novo em ${formatWait(seconds)}.`
    return { kind: 'rate-limited', message, retryAfterSeconds: seconds }
  }
  if (error.status === 401) return { kind: 'session-ended', message: DELETION_MESSAGES.sessionEnded }
  if (error.code === 'NETWORK_ERROR' || error.status === 0) {
    return error.code === 'NETWORK_ERROR'
      ? { kind: 'offline', message: DELETION_MESSAGES.offlineSubmit }
      : { kind: 'unknown', message: DELETION_MESSAGES.unknown }
  }
  if (error.status === 400) return { kind: 'invalid', message: DELETION_MESSAGES.invalid }
  return { kind: 'unknown', message: DELETION_MESSAGES.unknown }
}

// ---------------------------------------------------------------------------------------------
// Máquina de estados da tela
// ---------------------------------------------------------------------------------------------

export type DeletionPhase = 'loading' | 'preview-error' | 'forbidden' | 'ready' | 'submitting' | 'deleted' | 'session-ended'

export type DeletionNotice = { tone: 'error' | 'info'; message: string }

export type DeletionState = {
  phase: DeletionPhase
  preview: DeletionPreview | null
  password: string
  confirmed: boolean
  passwordError: string | null
  notice: DeletionNotice | null
  /** Mensagem das fases preview-error / forbidden / session-ended. */
  message: string | null
  /** Último 429: a tela inicia a contagem regressiva com este valor. */
  retryAfterSeconds: number | null
  result: DeletionResult | null
}

export type DeletionEvent =
  | { type: 'PREVIEW_REQUESTED' }
  | { type: 'PREVIEW_LOADED'; preview: DeletionPreview }
  | { type: 'PREVIEW_FAILED'; error: ApiError }
  | { type: 'PASSWORD_CHANGED'; password: string }
  | { type: 'CONFIRMED_CHANGED'; confirmed: boolean }
  | { type: 'SUBMIT' }
  | { type: 'SUBMIT_FAILED'; error: ApiError }
  | { type: 'SUBMIT_SUCCEEDED'; result: DeletionResult }

export const initialDeletionState: DeletionState = {
  phase: 'loading',
  preview: null,
  password: '',
  confirmed: false,
  passwordError: null,
  notice: null,
  message: null,
  retryAfterSeconds: null,
  result: null,
}

const FINAL: DeletionPhase[] = ['deleted', 'session-ended']

export function deletionReducer(state: DeletionState, event: DeletionEvent): DeletionState {
  // Depois de excluída (ou sessão encerrada) nada mais muda a tela.
  if (FINAL.includes(state.phase)) return state

  switch (event.type) {
    case 'PREVIEW_REQUESTED':
      if (state.phase === 'submitting') return state
      return { ...state, phase: 'loading', message: null }

    case 'PREVIEW_LOADED': {
      if (state.phase !== 'loading') return state
      // O aviso mudou (409 ou escopo diferente do anterior): exige marcar a confirmação de novo.
      const scopeChanged = state.preview != null && state.preview.scope !== event.preview.scope
      return {
        ...state,
        phase: 'ready',
        preview: event.preview,
        confirmed: scopeChanged ? false : state.confirmed,
        message: null,
      }
    }

    case 'PREVIEW_FAILED': {
      if (state.phase !== 'loading') return state
      const action = mapDeletionError(event.error)
      if (action.kind === 'admin-forbidden') return { ...state, phase: 'forbidden', message: action.message }
      if (action.kind === 'session-ended') return { ...state, phase: 'session-ended', message: action.message }
      const message =
        action.kind === 'offline'
          ? DELETION_MESSAGES.offlinePreview
          : action.kind === 'rate-limited'
            ? action.message
            : DELETION_MESSAGES.previewFailed
      return { ...state, phase: 'preview-error', message }
    }

    case 'PASSWORD_CHANGED':
      if (state.phase === 'submitting') return state
      return { ...state, password: event.password.slice(0, DELETION_PASSWORD_MAX), passwordError: null }

    case 'CONFIRMED_CHANGED':
      if (state.phase === 'submitting') return state
      return { ...state, confirmed: event.confirmed }

    case 'SUBMIT':
      // Trava de duplo envio: só sai de 'ready' com senha e confirmação.
      if (state.phase !== 'ready' || !state.preview || !state.password || !state.confirmed) return state
      return { ...state, phase: 'submitting', notice: null, passwordError: null, retryAfterSeconds: null }

    case 'SUBMIT_FAILED': {
      if (state.phase !== 'submitting') return state
      const action = mapDeletionError(event.error)
      switch (action.kind) {
        case 'wrong-password':
          return { ...state, phase: 'ready', password: '', passwordError: action.message }
        case 'scope-changed':
          // Recarrega o preview (a tela observa phase=loading) SEM reenviar; confirmação precisa ser marcada de novo.
          return { ...state, phase: 'loading', confirmed: false, notice: { tone: 'error', message: action.message } }
        case 'rate-limited':
          return {
            ...state,
            phase: 'ready',
            notice: { tone: 'error', message: action.message },
            retryAfterSeconds: action.retryAfterSeconds,
          }
        case 'admin-forbidden':
          return { ...state, phase: 'forbidden', password: '', message: action.message }
        case 'session-ended':
          return { ...state, phase: 'session-ended', password: '', message: action.message }
        default:
          return { ...state, phase: 'ready', notice: { tone: 'error', message: action.message } }
      }
    }

    case 'SUBMIT_SUCCEEDED':
      if (state.phase !== 'submitting') return state
      return { ...state, phase: 'deleted', password: '', result: event.result, notice: null }
  }
}

export function canSubmitDeletion(state: DeletionState, opts: { coolingDown: boolean; online: boolean }): boolean {
  return (
    state.phase === 'ready' &&
    state.preview != null &&
    state.password.length > 0 &&
    state.confirmed &&
    !opts.coolingDown &&
    opts.online
  )
}

// ---------------------------------------------------------------------------------------------
// Limpeza depois do 200 (deleted ou already_deleted)
// ---------------------------------------------------------------------------------------------

export type PostDeletionCleanupDeps = {
  /** Apaga access/refresh/usuário do SecureStore e da memória (sem chamar a API). */
  forgetSession: () => Promise<void>
  clearSyncUser: () => void
  /** PowerSync disconnectAndClear({ clearLocal: true }) + chave do usuário do sync. */
  disconnectAndClear: () => Promise<void>
  unregisterBackgroundSync: () => Promise<void>
  /** Fotos e relatórios gerados no aparelho. */
  deleteLocalFiles: () => Promise<void>
  /** Caches em memória (credenciais do PowerSync etc.). */
  resetMemory: () => void
  /** Último passo, sempre executado: mostra "Conta excluída" e volta ao login. */
  signOut: () => void
}

export type CleanupStep = 'forgetSession' | 'clearSyncUser' | 'disconnectAndClear' | 'unregisterBackgroundSync' | 'deleteLocalFiles' | 'resetMemory'

/**
 * Ordem importa: os tokens saem PRIMEIRO (nenhuma chamada nova à API nem refresh com sessão revogada),
 * depois o banco local, depois o resto. Cada passo é isolado: falha num passo não impede os outros, e o
 * signOut roda sempre. O disconnectAndClear tenta 2x (é o que apaga os dados do aparelho).
 */
export async function runPostDeletionCleanup(deps: PostDeletionCleanupDeps): Promise<{ failed: CleanupStep[] }> {
  const failed: CleanupStep[] = []
  const step = async (name: CleanupStep, fn: () => unknown, attempts = 1) => {
    for (let i = 1; i <= attempts; i++) {
      try {
        await fn()
        return
      } catch {
        if (i === attempts) failed.push(name)
      }
    }
  }
  await step('forgetSession', deps.forgetSession)
  await step('clearSyncUser', deps.clearSyncUser)
  await step('disconnectAndClear', deps.disconnectAndClear, 2)
  await step('unregisterBackgroundSync', deps.unregisterBackgroundSync)
  await step('deleteLocalFiles', deps.deleteLocalFiles)
  await step('resetMemory', deps.resetMemory)
  deps.signOut()
  return { failed }
}
