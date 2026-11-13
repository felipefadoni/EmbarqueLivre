import { useCallback, useEffect, useState } from 'react'
import { Text, XStack, YStack } from 'tamagui'

import { db } from '@/sync'
import {
  AUTHOR_VERDICT_TEXT,
  authorDiagnosticLine,
  authorDiagnosticsQuery,
  authorVerdict,
  canSeeAuthorDiagnostics,
  formatDiagnosticDate,
  newestOf,
  pendingVaccineCatalogRow,
  toDiagnosticRow,
  vaccineCatalogDiagnosticsQuery,
  type AuthorDiagnosticRow,
} from '@/sync/authorDiagnostics'
import { TOQUE_MINIMO } from '../../../tamagui.config'

/**
 * Só ADMIN: quantos registros têm autor no aparelho e se o servidor está enviando o campo. Portão duplo: quem renderiza
 * já confere o papel e este componente confere de novo; para os demais (ou papel ainda carregando) não monta o
 * conteúdo, então nenhuma consulta roda.
 */
export function AuthorSyncDiagnostics({ role }: { role: string | null | undefined }) {
  if (!canSeeAuthorDiagnostics(role)) return null
  return <AuthorSyncDiagnosticsContent />
}

function AuthorSyncDiagnosticsContent() {
  const [rows, setRows] = useState<AuthorDiagnosticRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    try {
      const query = authorDiagnosticsQuery()
      const result = await db.getAll<Record<string, unknown>>(query.sql, query.params)
      // Catálogo de vacinas (contrato pendente) em consulta separada: se falhar, vira "aguardando a API".
      let catalog: AuthorDiagnosticRow
      try {
        const vaccineQuery = vaccineCatalogDiagnosticsQuery()
        const [raw] = await db.getAll<Record<string, unknown>>(vaccineQuery.sql, vaccineQuery.params)
        catalog = raw ? toDiagnosticRow(raw) : pendingVaccineCatalogRow()
      } catch {
        catalog = pendingVaccineCatalogRow()
      }
      setRows([...result.map(toDiagnosticRow), catalog])
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
