import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useColorScheme } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'

import { useQuery } from '@powersync/react'

import type { Shipment } from '@/api/catalog'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { isValidShippedOn, maxShippedOn, SHIPMENTS_CONTRACT, todayIsoInShipmentZone } from '@/api/shipmentsContract'
import { AuthField } from '@/components/auth/AuthField'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { SelectField } from '@/components/cadastros/SelectField'
import { DateField } from '@/components/form/DateField'
import { parseIsoDateLocal } from '@/components/form/date'
import { BIRTH_DATE_MIN } from '@/features/cadastros/limits'
import { repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, pendingShipmentAnimalIds, showRejection } from '@/sync/editor'
import { ALL_ROWS, farmsListQuery, rowToFarm, rowToShipment, type FarmRow, type ShipmentRow } from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../tamagui.config'

const FORM_FIELDS = ['name', 'shippedOn', 'farmId'] as const

/** Validação do formulário de embarque (nome, dia e, no cadastro, fazenda). Mensagens pt-BR. */
export function validateShipmentForm(
  values: { name: string; shippedOn: string | null; farmId: string },
  opts: { requireFarm: boolean; today?: string },
): Record<string, string> {
  const errors: Record<string, string> = {}
  const nome = values.name.trim()
  const { min, max } = SHIPMENTS_CONTRACT.limits.name
  if (!nome) errors.name = 'Informe o nome do embarque.'
  else if (nome.length < min || nome.length > max) errors.name = `O nome deve ter entre ${min} e ${max} caracteres.`
  if (!values.shippedOn) errors.shippedOn = 'Informe o dia do embarque.'
  else if (!isValidShippedOn(values.shippedOn, opts.today ?? todayIsoInShipmentZone())) {
    errors.shippedOn = 'Dia do embarque inválido: escolha uma data entre 01/01/1900 e daqui a 2 anos.'
  }
  if (opts.requireFarm && !values.farmId) errors.farmId = 'Selecione a fazenda.'
  return errors
}

/**
 * Novo embarque: Nome, Dia e Fazenda (obrigatórios; a fazenda não muda depois). Status inicial Em andamento.
 * O botão "Adicionar animal" só aparece depois de escolher a fazenda: cadastra o embarque (offline) e abre o
 * detalhe já com o modal de animais aberto (foto + peso por animal).
 */
export function ShipmentForm({ pendenciaId }: { pendenciaId?: string }) {
  const [name, setName] = useState('')
  const [farmId, setFarmId] = useState('')
  const [shippedOn, setShippedOn] = useState<string | null>(todayIsoInShipmentZone())
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(pendenciaId))
  const [saving, setSaving] = useState(false)
  const [pendingAnimalIds, setPendingAnimalIds] = useState<string[]>([])
  const isDark = useColorScheme() === 'dark'

  const farmsQuery = farmsListQuery(ALL_ROWS)
  const farmRows = useQuery<FarmRow>(farmsQuery.sql, farmsQuery.params)
  const farms = useMemo(() => farmRows.data.map(rowToFarm), [farmRows.data])

  useEffect(() => {
    if (!pendenciaId) return
    let alive = true
    void (async () => {
      try {
        // "Corrigir" de um cadastro recusado: valores recusados + animais que aguardavam este embarque.
        const source = await loadEditorSource<ShipmentRow, Shipment>('shipments', null, rowToShipment, pendenciaId)
        if (!alive) return
        const draft = source.draft
        setName(draftString(draft, 'name') ?? '')
        setFarmId(draftString(draft, 'farmId') ?? '')
        setShippedOn(draftString(draft, 'shippedOn') || todayIsoInShipmentZone())
        showRejection(source.rejection, setFieldErrors, setFormError, FORM_FIELDS)
        setPendingAnimalIds(await pendingShipmentAnimalIds(pendenciaId))
      } catch (error) {
        if (alive) setFormError(editorErrorMessage(error, 'Não foi possível carregar a pendência.'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [pendenciaId])

  async function onSubmit(then: 'detail' | 'add') {
    if (saving) return
    setFormError(null)
    const errors = validateShipmentForm({ name, shippedOn, farmId }, { requireFarm: true })
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setSaving(true)
    try {
      const newId = await repo.createShipment({ farmId, name: name.trim(), shippedOn: shippedOn as string })
      await clearRowRejections('shipments', newId)
      await clearPendencia(pendenciaId)
      // Abre o detalhe do embarque criado; "Adicionar animal" já abre o modal de animais.
      router.replace({ pathname: '/embarques/[id]', params: then === 'add' ? { id: newId, adicionar: '1' } : { id: newId } })
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

  return (
    <CadastroFormScreen error={formError} submitLabel="Cadastrar embarque" submitting={saving} onSubmit={() => void onSubmit('detail')}>
      <ShipmentFields
        name={name}
        onName={(value) => {
          setName(value)
          setFieldErrors((current) => ({ ...current, name: '' }))
        }}
        shippedOn={shippedOn}
        onShippedOn={(value) => {
          setShippedOn(value)
          setFieldErrors((current) => ({ ...current, shippedOn: '' }))
        }}
        errors={fieldErrors}
      />
      <SelectField
        label="Fazenda"
        value={farmId}
        options={farms.map((farm) => ({ value: farm.id, label: farm.name }))}
        placeholder={farms.length ? 'Selecione a fazenda' : 'Nenhuma fazenda cadastrada'}
        error={fieldErrors.farmId}
        onChange={(value) => {
          setFarmId(value)
          setFieldErrors((current) => ({ ...current, farmId: '' }))
        }}
        disabled={farms.length === 0}
      />
      <Text fontSize={15} fontWeight="500" color="brandMuted">
        A fazenda não pode ser trocada depois. O embarque começa Em andamento.
      </Text>
      {pendingAnimalIds.length ? (
        <Text fontSize={15} fontWeight="700" color="brandMuted">
          {pendingAnimalIds.length === 1
            ? '1 animal aguardava este embarque: adicione-o de novo, com foto e peso.'
            : `${pendingAnimalIds.length} animais aguardavam este embarque: adicione-os de novo, com foto e peso.`}
        </Text>
      ) : null}
      {farmId ? (
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          gap={8}
          rounded={16}
          borderWidth={2}
          borderColor="brandBorder"
          bg="brandSurface"
          opacity={{ default: saving ? 0.55 : 1, press: 0.85 }}
          onPress={saving ? undefined : () => void onSubmit('add')}
          accessibilityRole="button"
          accessibilityLabel="Adicionar animal"
          accessibilityHint="Cadastra o embarque e abre a lista de animais da fazenda">
          <Ionicons name="add-circle-outline" size={22} color={isDark ? '#A8B8AF' : '#3A5247'} />
          <Text fontSize={17} fontWeight="800" color="brandFg">
            Adicionar animal
          </Text>
        </XStack>
      ) : null}
    </CadastroFormScreen>
  )
}

/** Nome do Embarque e Dia do Embarque (compartilhado entre cadastro e detalhe). */
export function ShipmentFields({
  name,
  onName,
  shippedOn,
  onShippedOn,
  errors,
}: {
  name: string
  onName: (value: string) => void
  shippedOn: string | null
  onShippedOn: (value: string | null) => void
  errors: Record<string, string>
}) {
  const today = todayIsoInShipmentZone()
  return (
    <>
      <AuthField
        label="Nome do Embarque"
        value={name}
        onChangeText={onName}
        error={errors.name}
        placeholder="Ex.: Frigorífico dezembro"
        maxLength={SHIPMENTS_CONTRACT.limits.name.max}
        autoCapitalize="sentences"
        returnKeyType="next"
      />
      <DateField
        label="Dia do Embarque"
        value={shippedOn}
        onChange={onShippedOn}
        minimumDate={BIRTH_DATE_MIN}
        maximumDate={parseIsoDateLocal(maxShippedOn(today)) ?? undefined}
        optional={false}
        error={errors.shippedOn}
      />
    </>
  )
}
