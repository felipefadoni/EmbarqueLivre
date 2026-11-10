/** Normaliza um parâmetro de rota do expo-router (string | string[]) para string. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return first || undefined
}
