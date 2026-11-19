import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'

import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { formatWeightKg, parseWeightKg, WEIGHT_HINT } from '@/api/shipmentsContract'
import { AuthField } from '@/components/auth/AuthField'
import { AuthorLines } from '@/components/cadastros/AuthorLines'
import { AnimalPicker, type PickedAnimal } from '@/components/cadastros/AnimalPicker'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { todayIso } from '@/components/form/date'
import { useAuth } from '@/features/auth/AuthProvider'
import { canSeeAuthor } from '@/features/cadastros/farmFilters'
import { db, repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, showRejection } from '@/sync/editor'
import {
  animalByIdQuery,
  formatWeighedAt,
  querySpread,
  rowToAnimal,
  rowToWeighing,
  weighingByIdQuery,
  type AnimalRow,
  type WeighingRow,
} from '@/sync/queries'

type WeighingEditorProps = {
  weighingId?: string
  /** Pendência (operação recusada pelo servidor) a corrigir. */
  pendenciaId?: string
}

export function WeighingEditor({ weighingId, pendenciaId }: WeighingEditorProps) {
  const isEdit = Boolean(weighingId)
  const [animal, setAnimal] = useState<PickedAnimal | null>(null)
  const [weight, setWeight] = useState('')
  const [originalWeight, setOriginalWeight] = useState<number | null>(null)
  const [weighedAt, setWeighedAt] = useState('')
  const [author, setAuthor] = useState<{ name?: string | null; email?: string | null } | null>(null)
  const { user } = useAuth()
  const showAuthor = canSeeAuthor(user?.role, 'weighings')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const source = await loadEditorSource<WeighingRow, ReturnType<typeof rowToWeighing>>(
          'weighings',
          weighingId ? weighingByIdQuery(weighingId, showAuthor) : null,
          rowToWeighing,
          pendenciaId,
        )
        if (cancelled) return
        const entry = source.record
        if (weighingId && !entry) {
          setLoadError('Pesagem não encontrada neste aparelho. Ela pode ter sido excluída ou ainda não sincronizou.')
          return
        }
        const draft = source.draft
        if (entry) {
          setAnimal({ id: entry.animalId, code: entry.animalCode, farmName: entry.farmName || undefined })
          setWeight(entry.weightKg ? String(entry.weightKg).replace('.', ',') : '')
          setOriginalWeight(entry.weightKg)
          setWeighedAt(entry.weighedAt)
          if (showAuthor) setAuthor({ name: entry.createdByName, email: entry.createdByEmail })
        }
        // "Corrigir": valores recusados pelo servidor por cima do registro local.
        const draftAnimalId = draftString(draft, 'animalId')
        if (draftAnimalId && draftAnimalId !== entry?.animalId) {
          const row = await db.getOptional<AnimalRow>(...querySpread(animalByIdQuery(draftAnimalId, todayIso())))
          if (cancelled) return
          if (row) {
            const picked = rowToAnimal(row)
            setAnimal({ id: picked.id, code: picked.code, farmName: picked.farmName })
          }
        }
        const draftWeight = draftString(draft, 'weightKg')
        if (draftWeight !== undefined) setWeight(draftWeight.replace('.', ','))
        showRejection(source.rejection, setFieldErrors, setFormError, ['animalId', 'weightKg'])
        setLoadError(null)
      } catch (error) {
        if (cancelled) return
        setLoadError(editorErrorMessage(error, 'Não foi possível carregar a pesagem.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [weighingId, pendenciaId, reloadKey, showAuthor])

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (!isEdit && !animal?.id) next.animalId = 'Selecione o animal.'
    if (parseWeightKg(weight) == null) next.weightKg = WEIGHT_HINT
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (saving) return
    setFormError(null)
    if (!validate()) return
    const weightKg = parseWeightKg(weight)
    if (weightKg == null) return
    setSaving(true)
    try {
      // Grava no banco local; o PowerSync envia quando houver rede. O momento é o relógio do aparelho.
      const savedId =
        isEdit && weighingId
          ? (await repo.updateWeighing(weighingId, { weightKg }), weighingId)
          : await repo.createWeighing({ animalId: animal?.id ?? '', weightKg })
      await clearRowRejections('weighings', savedId)
      await clearPendencia(pendenciaId)
      router.back()
    } catch (error) {
      const apiError = isApiError(error) ? error : null
      if (!apiError) {
        setFormError('Ocorreu um erro inesperado. Tente novamente.')
        return
      }
      const fields = fieldMessagesFromError(apiError)
      setFieldErrors(fields)
      const shownInField = Object.keys(fields).length > 0 && (apiError.code === 'VALIDATION_ERROR' || Boolean(apiError.details?.field))
      setFormError(shownInField ? null : publicApiMessage(apiError))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!weighingId || deleting) return
    setDeleting(true)
    setFormError(null)
    try {
      await repo.deleteWeighing(weighingId)
      await clearRowRejections('weighings', weighingId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir a pesagem.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <YStack flex={1} bg="appBg" items="center" justify="center" gap={12}>
        <Spinner color="brandPrimary" size="large" />
        <Text fontSize={16} fontWeight="600" color="brandMuted">
          Carregando…
        </Text>
      </YStack>
    )
  }

  if (loadError) {
    return (
      <YStack flex={1} bg="appBg" items="center" justify="center" gap={16} px={24}>
        <Text fontSize={16} fontWeight="800" color="brandFg" text="center">
          {loadError}
        </Text>
        <Text
          fontSize={16}
          fontWeight="800"
          color="brandFg"
          textDecorationLine="underline"
          onPress={() => {
            setLoading(true)
            setLoadError(null)
            setReloadKey((key) => key + 1)
          }}
          accessibilityRole="button">
          Tentar novamente
        </Text>
      </YStack>
    )
  }

  const preview = parseWeightKg(weight)
  const unchanged = isEdit && preview != null && preview === originalWeight

  return (
    <>
      <CadastroFormScreen
        error={formError}
        submitLabel={isEdit ? 'Salvar peso' : 'Lançar peso'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir pesagem">
        {isEdit ? (
          <YStack gap={4}>
            <Text fontSize={16} fontWeight="800" color="brandFg">
              Brinco {animal?.code || 'não informado'}
            </Text>
            {animal?.farmName ? (
              <Text fontSize={15} fontWeight="600" color="brandMuted">
                {animal.farmName}
              </Text>
            ) : null}
            <Text fontSize={15} fontWeight="600" color="brandMuted">
              Lançado em {formatWeighedAt(weighedAt) || '—'}. Corrigir muda só o número; a data, a hora e quem lançou ficam.
            </Text>
            {showAuthor && author ? <AuthorLines author={author} /> : null}
          </YStack>
        ) : (
          <AnimalPicker
            label="Animal"
            selected={animal}
            error={fieldErrors.animalId}
            onChange={(value) => {
              setAnimal(value)
              setFieldErrors((current) => ({ ...current, animalId: '' }))
            }}
          />
        )}
        <AuthField
          label="Peso (kg)"
          value={weight}
          onChangeText={(value) => {
            setWeight(value)
            setFieldErrors((current) => ({ ...current, weightKg: '' }))
          }}
          error={fieldErrors.weightKg}
          placeholder="Ex.: 412,5"
          keyboardType="decimal-pad"
          autoCorrect={false}
          maxLength={6}
          accessibilityHint={WEIGHT_HINT}
        />
        <Text fontSize={14} lineHeight="20px" fontWeight="500" color="brandMuted">
          {preview != null ? `Peso: ${formatWeightKg(preview)}${unchanged ? ' (sem alteração)' : ''}` : WEIGHT_HINT}
        </Text>
      </CadastroFormScreen>
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir pesagem?"
        message="O registro sai do histórico de peso do animal. Use só para corrigir um lançamento feito por engano. Esta ação não pode ser desfeita."
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
    </>
  )
}
