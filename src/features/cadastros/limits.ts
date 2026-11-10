/** Limites do contrato §17. */
export const LIMITS = {
  farmName: { min: 2, max: 150 },
  city: { min: 2, max: 100 },
  vaccineName: { min: 2, max: 150 },
  typeName: { min: 2, max: 60 },
  animalCode: { min: 1, max: 50 },
  breed: { max: 100 },
  withdrawalDays: { min: 0, max: 3650 },
} as const

export const BIRTH_DATE_MIN = new Date(1900, 0, 1)

/** ULID (26 caracteres, Crockford base32). */
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i

export function isUlid(value: string): boolean {
  return ULID_PATTERN.test(value.trim())
}
