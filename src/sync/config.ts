/** Endpoints do PowerSync (sobrescreva via .env). */
export const POWERSYNC_CONFIG = {
  /**
   * URL do serviço PowerSync. Precedência: EXPO_PUBLIC_POWERSYNC_URL (se definida) > `powersyncUrl` do token.
   * Assim o app usa o IP da rede mesmo antes de a API ter POWERSYNC_URL configurado (o token traria localhost).
   */
  url: process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '',
  /**
   * Mesma API do client http. Se EXPO_PUBLIC_POWERSYNC_URL for de outro ambiente (ex.: IP da rede local com a API na
   * VPS), a env é ignorada em favor do `powersyncUrl` do token — ou a sync pausa — para não apagar dados locais.
   */
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  /** Relativo a `${EXPO_PUBLIC_API_URL}/api/v1`. */
  tokenPath: process.env.EXPO_PUBLIC_POWERSYNC_TOKEN_PATH ?? '/powersync/token',
  uploadPath: process.env.EXPO_PUBLIC_POWERSYNC_UPLOAD_PATH ?? '/powersync/upload',
  /** 'requests' exige PowerSync Service >= 1.24 (alpha). 'legacy' é o padrão estável. */
  checkpointMode: (process.env.EXPO_PUBLIC_POWERSYNC_CHECKPOINT_MODE === 'requests' ? 'requests' : 'legacy') as
    | 'requests'
    | 'legacy',
  dbFilename: 'embarquelivre.db',
  /** Renova o token quando faltar menos que isso para expirar (TTL do servidor = 5 min / 300 s). */
  tokenRenewMarginMs: 60_000,
  /**
   * Espera do SDK entre tentativas depois de erro (rede, servidor). Maior que o padrão para poupar bateria: a volta
   * da rede e o app em primeiro plano já reconectam na hora (syncTriggers).
   */
  retryDelayMs: 15_000,
} as const
