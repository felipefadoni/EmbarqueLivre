import {
  parseDeletionPreview,
  parseDeletionResult,
  type DeletionPreview,
  type DeletionResult,
  type DeletionScope,
} from '@/features/account/accountDeletion'

import { http } from './client'

/** Exclusão da própria conta (API_INTEGRATION.md §6.10). */
export const accountApi = {
  deletionPreview: (): Promise<DeletionPreview> =>
    // A API responde Cache-Control: no-store; não mandar o cabeçalho no pedido (no web forçaria preflight CORS).
    http.get('/auth/me/deletion-preview').then((res) => parseDeletionPreview(res.data)),

  /** 200 deleted | already_deleted. Erros chegam como ApiError (ver mapDeletionError). Nunca é repetido pelo interceptor. */
  deleteMe: (body: { password: string; scope: DeletionScope }): Promise<DeletionResult> =>
    http.post('/auth/me/deletion', body).then((res) => parseDeletionResult(res.data)),
}
