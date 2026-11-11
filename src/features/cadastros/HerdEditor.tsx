import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Input, Spinner, Text, XStack, YStack } from 'tamagui'

import { useQuery } from '@powersync/react'
import Ionicons from '@expo/vector-icons/Ionicons'

import type { Herd, HerdPayload } from '@/api/catalog'
import { HERDS_CONTRACT, isValidHerdFormedAt, normalizeHerdDescription, todayIsoInHerdZone } from '@/api/herdsContract'
import { fieldMessagesFromError, isApiError, publicApiMessage } from '@/api/errors'
import { AuthField } from '@/components/auth/AuthField'
import { CadastroFormScreen } from '@/components/cadastros/CadastroFormScreen'
import { ConfirmDialog } from '@/components/cadastros/ConfirmDialog'
import { HerdAnimalsPicker } from '@/components/cadastros/HerdAnimalsPicker'
import { SelectField } from '@/components/cadastros/SelectField'
import { DateField } from '@/components/form/DateField'
import { parseIsoDateLocal, todayIso } from '@/components/form/date'
import { BIRTH_DATE_MIN } from '@/features/cadastros/limits'
import { db, repo } from '@/sync'
import { clearPendencia, clearRowRejections, draftString, editorErrorMessage, loadEditorSource, pendingHerdAnimalIds, showRejection } from '@/sync/editor'
import {
  ALL_ROWS,
  animalsListQuery,
  farmsListQuery,
  herdByIdQuery,
  rowToAnimal,
  rowToFarm,
  rowToHerd,
  type AnimalRow,
  type FarmRow,
  type HerdRow,
} from '@/sync/queries'
import { TOQUE_MINIMO } from '../../../tamagui.config'

type HerdEditorProps = {
  herdId?: string
  pendenciaId?: string
}

export function HerdEditor({ herdId, pendenciaId }: HerdEditorProps) {
  const isEdit = Boolean(herdId)
  const [name, setName] = useState('')
  const [farmId, setFarmId] = useState('')
  const [description, setDescription] = useState('')
  const [formedAt, setFormedAt] = useState<string | null>(todayIsoInHerdZone())
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  const [selectedAnimals, setSelectedAnimals] = useState<ReturnType<typeof rowToAnimal>[]>([])
  const [pendingFarmId, setPendingFarmId] = useState<string | null>(null)

  const farmsQuery = farmsListQuery(ALL_ROWS)
  const farmRows = useQuery<FarmRow>(farmsQuery.sql, farmsQuery.params)
  const farms = useMemo(() => farmRows.data.map(rowToFarm), [farmRows.data])

  const today = todayIso()
  const membersQuery = animalsListQuery({ herdId: herdId || undefined }, today, ALL_ROWS)
  const memberRows = useQuery<AnimalRow>(membersQuery.sql, membersQuery.params)
  const members = useMemo(() => memberRows.data.map((row) => rowToAnimal(row)), [memberRows.data])
  const removingAnimal = members.find((item) => item.id === removeId)
  const farmAnimalsQuery = animalsListQuery({ farmId: farmId || undefined }, today, ALL_ROWS)
  const farmAnimalRows = useQuery<AnimalRow>(farmAnimalsQuery.sql, farmAnimalsQuery.params)
  const farmAnimals = useMemo(() => farmAnimalRows.data.map((row) => rowToAnimal(row)), [farmAnimalRows.data])

  function retry() {
    setLoading(true)
    setLoadError(null)
    void load()
  }

  async function load() {
    try {
      const source = await loadEditorSource<HerdRow, Herd>(
        'herds',
        herdId ? herdByIdQuery(herdId) : null,
        rowToHerd,
        pendenciaId,
      )
      const herd = source.record
      if (herdId && !herd) {
        setLoadError('Rebanho não encontrado neste aparelho. Ele pode ter sido excluído ou ainda não sincronizou.')
        return
      }
      const draft = source.draft
      setName(draftString(draft, 'name') ?? herd?.name ?? '')
      setFarmId(draftString(draft, 'farmId') ?? herd?.farmId ?? '')
      setDescription(draftString(draft, 'description') ?? herd?.description ?? '')
      setFormedAt((draftString(draft, 'formedAt') ?? herd?.formedAt ?? todayIsoInHerdZone()) || null)
      showRejection(source.rejection, setFieldErrors, setFormError, ['name', 'farmId', 'description', 'formedAt'])
      const pendingIds = await pendingHerdAnimalIds(pendenciaId)
      if (pendingIds.length) {
        const today = todayIso()
        const query = animalsListQuery({}, today, ALL_ROWS)
        const rows = await db.getAll<AnimalRow>(query.sql, query.params as unknown[])
        const wanted = new Set(pendingIds.map((id) => id.toUpperCase()))
        setSelectedAnimals(rows.filter((row) => wanted.has(String(row.id).toUpperCase())).map((row) => rowToAnimal(row)))
      } else {
        setSelectedAnimals([])
      }
    } catch (error) {
      setLoadError(editorErrorMessage(error, 'Não foi possível carregar o rebanho.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [herdId, pendenciaId])

  function validate(): boolean {
    const next: Record<string, string> = {}
    const nome = name.trim()
    const { min, max } = HERDS_CONTRACT.limits.name
    if (!nome) next.name = 'Informe o nome do rebanho.'
    else if (nome.length < min || nome.length > max) next.name = `O nome deve ter entre ${min} e ${max} caracteres.`
    if (!isEdit && !farmId) next.farmId = 'Selecione a fazenda.'
    if ((normalizeHerdDescription(description) ?? '').length > HERDS_CONTRACT.limits.description.max) {
      next.description = `A descrição deve ter no máximo ${HERDS_CONTRACT.limits.description.max} caracteres.`
    }
    if (HERDS_CONTRACT.formedAtRequired && !formedAt) {
      next.formedAt = 'Informe a data de formação.'
    } else if (formedAt && !isValidHerdFormedAt(formedAt, todayIsoInHerdZone())) {
      next.formedAt = 'Data de formação inválida: use o formato AAAA-MM-DD, entre 1900-01-01 e hoje (não pode ser futura)'
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit() {
    if (saving) return
    setFormError(null)
    if (!validate()) return
    const payload: HerdPayload = {
      farmId,
      name: name.trim(),
      description: normalizeHerdDescription(description),
      formedAt: formedAt ?? todayIsoInHerdZone(),
    }
    setSaving(true)
    try {
      const savedId = isEdit && herdId ? (await repo.updateHerd(herdId, payload), herdId) : await repo.createHerd(payload, selectedAnimals.map((animal) => animal.id))
      await clearRowRejections('herds', savedId)
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
    if (!herdId || deleting) return
    setDeleting(true)
    setFormError(null)
    try {
      await repo.deleteHerd(herdId)
      await clearRowRejections('herds', herdId)
      setConfirmOpen(false)
      router.back()
    } catch (error) {
      setConfirmOpen(false)
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível excluir o rebanho.')
    } finally {
      setDeleting(false)
    }
  }

  function applyFarmChange(value: string) {
    setFarmId(value)
    if (!isEdit) setSelectedAnimals([])
    setFieldErrors((current) => ({ ...current, farmId: '', herdId: '' }))
    setPendingFarmId(null)
  }

  function requestFarmChange(value: string) {
    if (value === farmId) return
    if (!isEdit && selectedAnimals.length > 0) {
      setPendingFarmId(value)
      return
    }
    applyFarmChange(value)
  }

  function onPickAnimals(animalIds: string[]) {
    if (!isEdit) {
      const byId = new Map(selectedAnimals.map((animal) => [animal.id, animal]))
      // Animais da fazenda atual entram pelo seletor; os já escolhidos permanecem se ainda estiverem na lista.
      setSelectedAnimals(
        animalIds.map((id) => byId.get(id) ?? farmAnimals.find((animal) => animal.id === id)).filter((item): item is ReturnType<typeof rowToAnimal> => Boolean(item)),
      )
      setPickerOpen(false)
      return
    }
    void onAddAnimals(animalIds)
  }

  async function onAddAnimals(animalIds: string[]) {
    if (!herdId || animalIds.length === 0) return
    try {
      await repo.assignAnimalsToHerd(herdId, animalIds)
      setPickerOpen(false)
    } catch (error) {
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível adicionar os animais.')
    }
  }

  async function onRemoveAnimal() {
    if (!removeId || removing) return
    setRemoving(true)
    setFormError(null)
    try {
      await repo.removeAnimalFromHerd(removeId)
      setRemoveId(null)
    } catch (error) {
      setRemoveId(null)
      setFormError(isApiError(error) ? publicApiMessage(error) : 'Não foi possível remover o animal do rebanho.')
    } finally {
      setRemoving(false)
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
        <Text fontSize={18} fontWeight="800" color="brandFg" text="center">
          {loadError}
        </Text>
        <Text
          fontSize={18}
          fontWeight="800"
          color="brandFg"
          textDecorationLine="underline"
          onPress={retry}
          accessibilityRole="button">
          Tentar novamente
        </Text>
      </YStack>
    )
  }

  const farmLocked = isEdit && HERDS_CONTRACT.farmImmutable
  const deleteMessage = HERDS_CONTRACT.unlinkAnimalsOnDelete
    ? 'Os animais deste rebanho ficarão sem rebanho. Esta ação não pode ser desfeita.'
    : 'Esta ação não pode ser desfeita.'

  return (
    <>
      <CadastroFormScreen
        error={formError}
        submitLabel={isEdit ? 'Salvar alterações' : 'Cadastrar rebanho'}
        submitting={saving}
        onSubmit={() => void onSubmit()}
        onDelete={isEdit ? () => setConfirmOpen(true) : undefined}
        deleteLabel="Excluir rebanho">
        <AuthField
          label="Nome"
          value={name}
          onChangeText={(value) => {
            setName(value)
            setFieldErrors((current) => ({ ...current, name: '' }))
          }}
          error={fieldErrors.name}
          placeholder="Nome do rebanho"
          maxLength={HERDS_CONTRACT.limits.name.max}
          autoCapitalize="sentences"
          returnKeyType="next"
        />
        <SelectField
          label="Fazenda"
          value={farmId}
          options={farms.map((farm) => ({ value: farm.id, label: farm.name }))}
          placeholder={farms.length ? 'Selecione a fazenda' : 'Nenhuma fazenda cadastrada'}
          error={fieldErrors.farmId}
          onChange={requestFarmChange}
          disabled={farmLocked || farms.length === 0}
        />
        <YStack gap="2" w="100%">
          <Text fontSize={16} fontWeight="700" color="brandFg" lineHeight="22px">
            Descrição
          </Text>
          <YStack
            bg="brandSurface"
            borderColor={fieldErrors.description ? 'brandError' : 'brandBorder'}
            borderWidth={2}
            rounded={16}
            px="3"
            py={10}
            w="100%">
            <Input
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              minH={112}
              fontSize={18}
              fontWeight="600"
              color="brandFg"
              bg="transparent"
              borderWidth={0}
              placeholder="Opcional"
              placeholderTextColor="brandMuted"
              value={description}
              onChangeText={(value) => {
                setDescription(value)
                setFieldErrors((current) => ({ ...current, description: '' }))
              }}
              maxLength={HERDS_CONTRACT.limits.description.max}
              autoCapitalize="sentences"
              accessibilityLabel="Descrição"
            />
          </YStack>
          {fieldErrors.description ? (
            <Text fontSize={15} lineHeight="20px" color="brandError" fontWeight="700">
              {fieldErrors.description}
            </Text>
          ) : null}
        </YStack>
        <DateField
          label="Data de formação"
          value={formedAt}
          onChange={setFormedAt}
          minimumDate={BIRTH_DATE_MIN}
          maximumDate={parseIsoDateLocal(todayIsoInHerdZone()) ?? new Date()}
          optional={!HERDS_CONTRACT.formedAtRequired}
          error={fieldErrors.formedAt}
        />
        <HerdMembers
          members={isEdit ? members : selectedAnimals}
          currentHerdId={herdId}
          addDisabled={!farmId}
          addHint={!farmId ? 'Selecione a fazenda para adicionar animais.' : undefined}
          onAdd={() => setPickerOpen(true)}
          onRemove={(id) => (isEdit ? setRemoveId(id) : setSelectedAnimals((current) => current.filter((animal) => animal.id !== id)))}
        />
      </CadastroFormScreen>
      <HerdAnimalsPicker
        open={pickerOpen}
        farmId={farmId}
        herdId={herdId}
        herdName={name.trim() || 'este rebanho'}
        initialSelectedIds={isEdit ? undefined : selectedAnimals.map((animal) => animal.id)}
        onClose={() => setPickerOpen(false)}
        onAdd={onPickAnimals}
      />
      <ConfirmDialog
        open={confirmOpen}
        title="Excluir rebanho?"
        message={deleteMessage}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void onDelete()}
        busy={deleting}
      />
      <ConfirmDialog
        open={pendingFarmId != null}
        title="Trocar a fazenda?"
        message="Os animais já escolhidos para este rebanho serão removidos da seleção, porque um rebanho só aceita animais da mesma fazenda."
        confirmLabel="Trocar fazenda"
        onCancel={() => setPendingFarmId(null)}
        onConfirm={() => pendingFarmId && applyFarmChange(pendingFarmId)}
      />
      <ConfirmDialog
        open={Boolean(removeId)}
        title="Remover animal do rebanho?"
        message={
          removingAnimal
            ? `O animal ${removingAnimal.code} sairá deste rebanho, mas permanece cadastrado na fazenda.`
            : 'O animal sairá deste rebanho, mas permanece cadastrado na fazenda.'
        }
        confirmLabel="Remover"
        onCancel={() => setRemoveId(null)}
        onConfirm={() => void onRemoveAnimal()}
        busy={removing}
      />
    </>
  )
}

function HerdMembers({
  members,
  onAdd,
  onRemove,
  addDisabled,
  addHint,
  currentHerdId,
}: {
  members: ReturnType<typeof rowToAnimal>[]
  onAdd: () => void
  onRemove: (id: string) => void
  addDisabled?: boolean
  addHint?: string
  currentHerdId?: string
}) {
  return (
    <YStack gap={12} mt={8}>
      <XStack items="center" justify="space-between" gap={12}>
        <Text fontSize={18} fontWeight="800" color="brandFg">
          Animais ({members.length})
        </Text>
      </XStack>
      <XStack
        minH={TOQUE_MINIMO}
        items="center"
        justify="center"
        rounded={16}
        bg="brandPrimary"
        opacity={addDisabled ? 0.45 : { press: 0.85 }}
        onPress={addDisabled ? undefined : onAdd}
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(addDisabled) }}
        accessibilityLabel="Adicionar animais">
        <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
          Adicionar animais
        </Text>
      </XStack>
      {addHint ? (
        <Text fontSize={15} fontWeight="500" color="brandMuted">
          {addHint}
        </Text>
      ) : members.length === 0 ? (
        <Text fontSize={15} fontWeight="500" color="brandMuted">
          Nenhum animal neste rebanho. Toque em “Adicionar animais”.
        </Text>
      ) : (
        members.map((animal) => (
          <XStack key={animal.id} items="center" gap={12} minH={TOQUE_MINIMO}>
            <YStack
              flex={1}
              gap={2}
              opacity={{ press: 0.85 }}
              onPress={() => router.push(`/configuracoes/animais/${animal.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Abrir animal ${animal.code}`}>
              <Text fontSize={17} fontWeight="800" color="brandFg">
                {animal.code}
              </Text>
              <Text fontSize={14} fontWeight="500" color="brandMuted">
                {animal.animalTypeName || 'Tipo não informado'}
              </Text>
              {animal.herdId && animal.herdId !== currentHerdId ? (
                <Text fontSize={13} fontWeight="600" color="brandError">
                  Já está em {animal.herdName || 'outro rebanho'} e será movido.
                </Text>
              ) : null}
            </YStack>
            <XStack
              minH={TOQUE_MINIMO}
              items="center"
              px={8}
              onPress={() => onRemove(animal.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remover ${animal.code} do rebanho`}>
              <Ionicons name="close-circle-outline" size={24} color="#8B1515" />
            </XStack>
          </XStack>
        ))
      )}
    </YStack>
  )
}
