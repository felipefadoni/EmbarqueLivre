// Tipos da API — conferidos no guia de integração (§12).

export type UserRole = 'admin' | 'master' | 'basic'
export type UserStatus = 'pending_verification' | 'active' | 'suspended'
export type EmailVerificationStatus = 'pending' | 'verified'
export type WhatsAppVerificationStatus = 'pending' | 'verified' | 'not_applicable'
export type ClientType = 'web' | 'mobile'
export type Ulid = string
export type IsoDate = string

export interface RegisterUserRequest {
  name: string
  email: string
  mobilePhone: string
  whatsAppPhone: string
  password: string
}

export interface UserResponse {
  userId: Ulid
  role: UserRole
  masterUserId: Ulid | null
  name: string
  email: string
  mobilePhone: string | null
  whatsAppPhone: string | null
  emailVerificationStatus: EmailVerificationStatus
  emailVerifiedAt: IsoDate | null
  whatsAppVerificationStatus: WhatsAppVerificationStatus
  whatsAppVerifiedAt: IsoDate | null
  status: UserStatus
  canAccess: boolean
  createdAt: IsoDate
}

export interface LoginRequest {
  email: string
  password: string
  client?: ClientType
}

export interface RefreshTokenRequest {
  refreshToken?: string
}

export type LogoutRequest = RefreshTokenRequest

export interface AuthUser {
  id: Ulid
  name: string
  email: string
  role: UserRole
  masterUserId: Ulid | null
}

interface SessionInfo {
  sessionId: Ulid
  clientType: ClientType
  accessTokenExpiresAt: IsoDate
  refreshTokenExpiresAt: IsoDate
  user: AuthUser
}

export interface WebSessionResponse extends SessionInfo {
  clientType: 'web'
  csrfToken: string
}

export interface MobileSessionResponse extends SessionInfo {
  clientType: 'mobile'
  tokenType: 'Bearer'
  accessToken: string
  refreshToken: string
}

export type SessionResponse = WebSessionResponse | MobileSessionResponse

export interface MeResponse extends AuthUser {
  sessionId: Ulid
}

export interface HealthResponse {
  status: 'ok' | 'error' | 'shutting_down'
  info?: Record<string, { status: 'up' | 'down'; [k: string]: unknown }>
  error?: Record<string, { status: 'up' | 'down'; [k: string]: unknown }>
  details: Record<string, { status: 'up' | 'down'; [k: string]: unknown }>
}

export type DomainErrorCode =
  | 'INVALID_USER_NAME'
  | 'INVALID_EMAIL'
  | 'INVALID_PHONE_NUMBER'
  | 'WEAK_PASSWORD'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'WHATSAPP_ALREADY_VERIFIED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_NOT_VERIFIED'
  | 'ACCOUNT_SUSPENDED'
  | 'INVALID_REFRESH_TOKEN'
  | 'REFRESH_TOKEN_REUSED'
  | 'UNAUTHENTICATED'
  | 'INSUFFICIENT_ROLE'
  | 'CSRF_TOKEN_INVALID'
  | 'ORIGIN_NOT_ALLOWED'
  | 'USER_NOT_FOUND'
  | 'ONLY_MASTER_CAN_OWN_BASIC_USERS'
  | 'INVALID_USER_STATUS_TRANSITION'
  | 'EMAIL_BELONGS_TO_NON_ADMIN_USER'

export interface DomainErrorBody {
  statusCode: number
  error: DomainErrorCode
  message: string
  details?: { field?: string; violations?: string[]; [k: string]: unknown }
}

export interface ValidationErrorBody {
  statusCode: 400
  error: 'Bad Request'
  message: string[] | string
}

export interface FrameworkErrorBody {
  statusCode: number
  message: string
  error?: string
}

export interface ApiError {
  status: number
  code: string
  fieldErrors?: Record<string, string[]>
  details?: Record<string, unknown>
  retryAfterSeconds?: number
}
