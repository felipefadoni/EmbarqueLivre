import { getRandomValues } from 'expo-crypto'
import { monotonicFactory } from 'ulid'

/** PRNG criptográfico do expo-crypto (Hermes não expõe crypto.getRandomValues global). */
function prng(): number {
  const buffer = getRandomValues(new Uint32Array(1))
  return buffer[0] / 0x1_0000_0000
}

const factory = monotonicFactory(prng)

/** ULID em MAIÚSCULAS (o servidor responde INVALID_ID para outro formato). */
export function newUlid(): string {
  return factory().toUpperCase()
}
