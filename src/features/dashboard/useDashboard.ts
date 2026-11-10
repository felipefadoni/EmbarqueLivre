import { useQuery } from '@powersync/react'
import { useMemo } from 'react'

import { addDaysIso } from '@/features/cadastros/dates'
import {
  animalsByFarmQuery,
  animalsByTypeQuery,
  farmsCountQuery,
  releasingSoonQuery,
  situationSummaryQuery,
  topVaccinesQuery,
  vaccinationCountsQuery,
  vaccinationsPerDayQuery,
  type CountsRow,
  type DayCountRow,
  type GroupCountRow,
  type ReleasingRow,
  type SituationSummaryRow,
  type TopVaccineRow,
  type VaccinationCountsRow,
} from '@/sync/dashboardQueries'
import type { SqlQuery } from '@/sync/queries'
import { buildSeries, chartBuckets, startOfMonthIso, startOfWeekIso, type ChartPeriod } from './period'

function useSql<T>(query: SqlQuery) {
  return useQuery<T>(query.sql, query.params as unknown[])
}

const num = (value: unknown) => Number(value ?? 0) || 0

/** Todos os números do Dashboard, reativos (useQuery do PowerSync) e locais. */
export function useDashboard({ today, farmId, period }: { today: string; farmId?: string; period: ChartPeriod }) {
  const weekStart = startOfWeekIso(today)
  const monthStart = startOfMonthIso(today)
  const buckets = useMemo(() => chartBuckets(period, today), [period, today])

  const situation = useSql<SituationSummaryRow>(situationSummaryQuery(today, farmId))
  const farmsCount = useSql<CountsRow>(farmsCountQuery())
  const counts = useSql<VaccinationCountsRow>(vaccinationCountsQuery(today, weekStart, monthStart, farmId))
  const perDay = useSql<DayCountRow>(vaccinationsPerDayQuery(buckets[0].start, today, farmId))
  const releasing = useSql<ReleasingRow>(releasingSoonQuery(today, farmId, 5))
  const byType = useSql<GroupCountRow>(animalsByTypeQuery(today, farmId))
  const byFarm = useSql<GroupCountRow>(animalsByFarmQuery(today))
  const topVaccines = useSql<TopVaccineRow>(topVaccinesQuery(addDaysIso(today, -29), today, farmId, 1))

  const s = situation.data[0]
  const series = useMemo(() => buildSeries(buckets, perDay.data), [buckets, perDay.data])

  return {
    loading: situation.isLoading || farmsCount.isLoading,
    situation: {
      total: num(s?.total),
      liberados: num(s?.liberados),
      emCarencia: num(s?.emCarencia),
      semHistorico: num(s?.semHistorico),
      libera7: num(s?.libera7),
      allFreeAt: s?.allFreeAt ?? null,
    },
    farms: num(farmsCount.data[0]?.farms),
    counts: { hoje: num(counts.data[0]?.hoje), semana: num(counts.data[0]?.semana), mes: num(counts.data[0]?.mes), loading: counts.isLoading },
    series: { ...series, loading: perDay.isLoading },
    releasing: { items: releasing.data, loading: releasing.isLoading },
    byType: { items: byType.data, loading: byType.isLoading },
    byFarm: { items: byFarm.data, loading: byFarm.isLoading },
    topVaccine: { item: topVaccines.data[0] ?? null, loading: topVaccines.isLoading },
  }
}
