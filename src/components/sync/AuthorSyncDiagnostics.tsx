import { useCallback, useEffect, useState } from 'react'
import { Text, XStack, YStack } from 'tamagui'

import { db } from '@/sync'
import {
  AUTHOR_VERDICT_TEXT,
  authorDiagnosticLine,
  authorDiagnosticsQuery,
  authorVerdict,
  formatDiagnosticDate,
  newestOf,
  toDiagnosticRow,
  type AuthorDiagnosticRow,
} from '@/sync/authorDiagnostics'
import { TOQUE_MINIMO } from '../../../tamagui.config'

/** Só admin (quem chama decide): quantos registros têm autor no aparelho e se o servidor está enviando o campo. */
export function AuthorSyncDiagnostics() {
  const [rows, setRows] = useState<AuthorDiagnosticRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    try {
      const query = authorDiagnosticsQuery()
      const result = await db.getAll<Record<string, unknown>>(query.sql, query.params)
      setRows(result.map(toDiagnosticRow))
      setError(null)
    } catch {
      setError('Não foi possível ler o diagnóstico neste aparelho.')
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(check)
  }, [check])

  return (
    <YStack gap={6}>
      <Text fontSize={14} fontWeight="700" color="brandMuted">
        Diagnóstico do autor (admin)
      </Text>
      {error ? (
        <Text fontSize={14} fontWeight="600" color="brandError">
          {error}
        </Text>
      ) : rows ? (
        <>
          <Text fontSize={15} fontWeight="700" color="brandFg">
            {AUTHOR_VERDICT_TEXT[authorVerdict(rows)]}
          </Text>
          {rows.map((row) => (
            <Text key={row.label} fontSize={14} fontWeight="500" color="brandMuted">
              {authorDiagnosticLine(row)}
            </Text>
          ))}
          <Text fontSize={14} fontWeight="500" color="brandMuted">
            Registro mais novo recebido do servidor: {formatDiagnosticDate(newestOf(rows))}
          </Text>
        </>
      ) : (
        <Text fontSize={14} fontWeight="500" color="brandMuted">
          Verificando…
        </Text>
      )}
      <XStack
        minH={TOQUE_MINIMO}
        items="center"
        opacity={{ press: 0.85 }}
        onPress={() => void check()}
        accessibilityRole="button"
        accessibilityLabel="Verificar autor de novo">
        <Text fontSize={16} fontWeight="800" color="brandFg" textDecorationLine="underline">
          Verificar de novo
        </Text>
      </XStack>
    </YStack>
  )
}
