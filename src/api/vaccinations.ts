import { animalsApi } from './catalog'
import {
  compactParams,
  createResourceClient,
  paginationParams,
  parseVaccinationEntry,
  VACCINATION_CONTRACT,
  type ListPagingRequest,
  type VaccinationFilters,
} from './contract'

export const vaccinationsApi = createResourceClient(VACCINATION_CONTRACT.path, parseVaccinationEntry)

/** GET /vaccinations com filtros (data ou intervalo, fazenda, código) e paginação; omite params vazios. */
export function listVaccinations(filters: VaccinationFilters, paging: ListPagingRequest) {
  const { filters: names } = VACCINATION_CONTRACT
  return vaccinationsApi.list(
    compactParams({
      [names.date]: filters.date || undefined,
      [names.dateFrom]: filters.dateFrom || undefined,
      [names.dateTo]: filters.dateTo || undefined,
      [names.farmId]: filters.farmId || undefined,
      [names.code]: filters.code?.trim() || undefined,
      ...paginationParams(paging),
    }),
  )
}

/** Busca paginada de animais por código (GET /animals?code=, parcial e sem diferenciar maiúsculas). */
export function searchAnimals(code: string, paging: ListPagingRequest) {
  return animalsApi.list({
    [VACCINATION_CONTRACT.animalSearchParam]: code.trim() || undefined,
    ...paginationParams(paging),
  })
}
