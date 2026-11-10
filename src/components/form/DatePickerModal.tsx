import Ionicons from '@expo/vector-icons/Ionicons'
import { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, useColorScheme } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'

import { TOQUE_MINIMO } from '../../../tamagui.config'
import {
  MONTH_NAMES_PT_BR,
  MONTH_SHORT_PT_BR,
  WEEKDAY_INITIALS_PT_BR,
  addMonths,
  buildMonthGrid,
  clampParts,
  compareParts,
  dateToParts,
  formatPartsPtBr,
  isMonthDisabled,
  isPartsDisabled,
  isYearDisabled,
  parseIsoDateParts,
  toIsoDateLocal,
  todayParts,
  yearList,
  type DateParts,
} from './date'

const YEAR_ROW_HEIGHT = 56
const YEAR_COLUMNS = 3

type PickerView = 'day' | 'month' | 'year'

type DatePickerModalProps = {
  open: boolean
  value: string | null
  minimumDate?: Date
  maximumDate?: Date
  onCancel: () => void
  onConfirm: (iso: string) => void
  title?: string
}

export function DatePickerModal({
  open,
  value,
  minimumDate,
  maximumDate,
  onCancel,
  onConfirm,
  title = 'Selecionar data',
}: DatePickerModalProps) {
  const isDark = useColorScheme() === 'dark'
  const insets = useSafeAreaInsets()
  const min = minimumDate ? dateToParts(minimumDate) : { year: 1900, month: 1, day: 1 }
  const max = maximumDate ? dateToParts(maximumDate) : todayParts()

  if (!open) return null

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(15, 28, 24, 0.55)', justifyContent: 'flex-end' }}
        onPress={onCancel}>
        <Pressable onPress={(event) => event.stopPropagation()}>
          <YStack
            bg="cardBg"
            p={20}
            gap={12}
            style={{
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingBottom: Math.max(insets.bottom, 16),
            }}>
            <DatePickerBody
              title={title}
              value={value}
              min={min}
              max={max}
              isDark={isDark}
              onCancel={onCancel}
              onConfirm={onConfirm}
            />
          </YStack>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function initialDraft(value: string | null, min: DateParts, max: DateParts): DateParts {
  return clampParts(parseIsoDateParts(value) ?? todayParts(), min, max)
}

function DatePickerBody({
  title,
  value,
  min,
  max,
  isDark,
  onCancel,
  onConfirm,
}: {
  title: string
  value: string | null
  min: DateParts
  max: DateParts
  isDark: boolean
  onCancel: () => void
  onConfirm: (iso: string) => void
}) {
  const [draft, setDraft] = useState(() => initialDraft(value, min, max))
  const [cursor, setCursor] = useState(() => ({ year: draft.year, month: draft.month }))
  const [view, setView] = useState<PickerView>('day')
  const selectedColor = isDark ? '#99C2AB' : '#2B3D34'
  const selectedFg = isDark ? '#2B3D34' : '#FFFFFF'
  const todayOutline = isDark ? '#99C2AB' : '#99C2AB'
  const mutedIcon = isDark ? '#A8B8AF' : '#3A5247'
  const today = todayParts()
  const prevMonth = addMonths({ year: cursor.year, month: cursor.month, day: 1 }, -1)
  const nextMonth = addMonths({ year: cursor.year, month: cursor.month, day: 1 }, 1)
  const canGoPrev = !isMonthDisabled(prevMonth.year, prevMonth.month, min, max)
  const canGoNext = !isMonthDisabled(nextMonth.year, nextMonth.month, min, max)

  function goMonth(delta: number) {
    const next = addMonths({ year: cursor.year, month: cursor.month, day: 1 }, delta)
    if (isMonthDisabled(next.year, next.month, min, max)) return
    setCursor({ year: next.year, month: next.month })
    setView('day')
  }

  function pickMonth(month: number) {
    if (isMonthDisabled(cursor.year, month, min, max)) return
    setCursor((current) => ({ ...current, month }))
    setDraft((current) => clampParts({ year: cursor.year, month, day: current.day }, min, max))
    setView('day')
  }

  function pickYear(year: number) {
    if (isYearDisabled(year, min, max)) return
    const month = isMonthDisabled(year, cursor.month, min, max)
      ? (min && year === min.year ? min.month : max && year === max.year ? max.month : cursor.month)
      : cursor.month
    setCursor({ year, month })
    setDraft((current) => clampParts({ year, month, day: current.day }, min, max))
    setView('day')
  }

  function pickDay(parts: DateParts) {
    if (isPartsDisabled(parts, min, max)) return
    setDraft(parts)
  }

  return (
    <>
      <Text fontSize={22} fontWeight="800" color="brandFg">
        {title}
      </Text>
      <Text fontSize={16} fontWeight="600" color="brandMuted">
        {formatPartsPtBr(draft)}
      </Text>

      <XStack items="center" justify="space-between" minH={TOQUE_MINIMO} gap={4}>
        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          opacity={canGoPrev ? 1 : 0.35}
          style={{ width: 56, height: 56 }}
          onPress={canGoPrev ? () => goMonth(-1) : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoPrev }}
          accessibilityLabel="Mês anterior">
          <Ionicons name="chevron-back" size={24} color={mutedIcon} />
        </XStack>

        <XStack flex={1} items="center" justify="center" gap={8}>
          <XStack
            minH={TOQUE_MINIMO}
            px={10}
            items="center"
            justify="center"
            rounded={16}
            bg={view === 'month' ? (isDark ? '#1C3C31' : '#EEF6EF') : 'transparent'}
            onPress={() => setView((current) => (current === 'month' ? 'day' : 'month'))}
            accessibilityRole="button"
            accessibilityLabel="Escolher mês">
            <Text fontSize={18} fontWeight="800" color="brandFg">
              {MONTH_NAMES_PT_BR[cursor.month - 1]}
            </Text>
          </XStack>
          <XStack
            minH={TOQUE_MINIMO}
            px={10}
            items="center"
            justify="center"
            rounded={16}
            bg={view === 'year' ? (isDark ? '#1C3C31' : '#EEF6EF') : 'transparent'}
            onPress={() => setView((current) => (current === 'year' ? 'day' : 'year'))}
            accessibilityRole="button"
            accessibilityLabel="Escolher ano">
            <Text fontSize={18} fontWeight="800" color="brandFg">
              {cursor.year}
            </Text>
          </XStack>
        </XStack>

        <XStack
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          opacity={canGoNext ? 1 : 0.35}
          style={{ width: 56, height: 56 }}
          onPress={canGoNext ? () => goMonth(1) : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoNext }}
          accessibilityLabel="Próximo mês">
          <Ionicons name="chevron-forward" size={24} color={mutedIcon} />
        </XStack>
      </XStack>

      {view === 'month' ? (
        <MonthPicker year={cursor.year} selectedMonth={cursor.month} min={min} max={max} isDark={isDark} onPick={pickMonth} />
      ) : view === 'year' ? (
        <YearPicker selectedYear={cursor.year} min={min} max={max} isDark={isDark} onPick={pickYear} />
      ) : (
        <DayGrid cursor={cursor} draft={draft} today={today} min={min} max={max} selectedColor={selectedColor} selectedFg={selectedFg} todayOutline={todayOutline} onPick={pickDay} />
      )}

      <XStack gap={12} mt={4}>
        <XStack
          flex={1}
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          borderWidth={2}
          borderColor="brandBorder"
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancelar">
          <Text fontSize={18} fontWeight="800" color="brandFg">
            Cancelar
          </Text>
        </XStack>
        <XStack
          flex={1}
          minH={TOQUE_MINIMO}
          items="center"
          justify="center"
          rounded={16}
          bg="brandPrimary"
          opacity={{ press: 0.85 }}
          onPress={() => onConfirm(toIsoDateLocal(draft))}
          accessibilityRole="button"
          accessibilityLabel="Confirmar data">
          <Text fontSize={18} fontWeight="800" color="brandPrimaryFg">
            Confirmar
          </Text>
        </XStack>
      </XStack>
    </>
  )
}

function DayGrid({
  cursor,
  draft,
  today,
  min,
  max,
  selectedColor,
  selectedFg,
  todayOutline,
  onPick,
}: {
  cursor: { year: number; month: number }
  draft: DateParts
  today: DateParts
  min: DateParts
  max: DateParts
  selectedColor: string
  selectedFg: string
  todayOutline: string
  onPick: (parts: DateParts) => void
}) {
  const rows = buildMonthGrid(cursor.year, cursor.month)

  return (
    <YStack gap={4}>
      <XStack>
        {WEEKDAY_INITIALS_PT_BR.map((label, index) => (
          <Text
            key={`${label}-${index}`}
            flex={1}
            text="center"
            fontSize={14}
            fontWeight="800"
            color="brandMuted"
            py={6}>
            {label}
          </Text>
        ))}
      </XStack>
      {rows.map((row, rowIndex) => (
        <XStack key={rowIndex}>
          {row.map((parts, cellIndex) => {
            if (!parts) {
              return <YStack key={`empty-${rowIndex}-${cellIndex}`} flex={1} minH={48} />
            }
            const disabled = isPartsDisabled(parts, min, max)
            const selected = compareParts(parts, draft) === 0
            const isToday = compareParts(parts, today) === 0
            return (
              <XStack
                key={toIsoDateLocal(parts)}
                flex={1}
                minH={48}
                items="center"
                justify="center"
                onPress={disabled ? undefined : () => onPick(parts)}
                accessibilityRole="button"
                accessibilityState={{ disabled, selected }}
                accessibilityLabel={formatPartsPtBr(parts)}>
                <XStack
                  items="center"
                  justify="center"
                  opacity={disabled ? 0.35 : 1}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: selected ? selectedColor : 'transparent',
                    borderWidth: isToday && !selected ? 2 : 0,
                    borderColor: isToday && !selected ? todayOutline : 'transparent',
                  }}>
                  <Text
                    fontSize={16}
                    fontWeight={selected || isToday ? '800' : '600'}
                    color={selected ? undefined : 'brandFg'}
                    style={selected ? { color: selectedFg } : undefined}>
                    {parts.day}
                  </Text>
                </XStack>
              </XStack>
            )
          })}
        </XStack>
      ))}
    </YStack>
  )
}

function MonthPicker({
  year,
  selectedMonth,
  min,
  max,
  isDark,
  onPick,
}: {
  year: number
  selectedMonth: number
  min: DateParts
  max: DateParts
  isDark: boolean
  onPick: (month: number) => void
}) {
  const selectedBg = isDark ? '#1C3C31' : '#EEF6EF'
  const rows = [0, 1, 2, 3].map((row) => [row * 3 + 1, row * 3 + 2, row * 3 + 3])

  return (
    <YStack gap={8} py={4}>
      {rows.map((months) => (
        <XStack key={months.join('-')} gap={8}>
          {months.map((month) => {
            const disabled = isMonthDisabled(year, month, min, max)
            const selected = month === selectedMonth
            return (
              <XStack
                key={month}
                flex={1}
                minH={TOQUE_MINIMO}
                items="center"
                justify="center"
                rounded={16}
                bg={selected ? selectedBg : 'transparent'}
                opacity={disabled ? 0.35 : 1}
                onPress={disabled ? undefined : () => onPick(month)}
                accessibilityRole="button"
                accessibilityState={{ disabled, selected }}
                accessibilityLabel={MONTH_NAMES_PT_BR[month - 1]}>
                <Text fontSize={17} fontWeight={selected ? '800' : '700'} color="brandFg">
                  {MONTH_SHORT_PT_BR[month - 1]}
                </Text>
              </XStack>
            )
          })}
        </XStack>
      ))}
    </YStack>
  )
}

function YearPicker({
  selectedYear,
  min,
  max,
  isDark,
  onPick,
}: {
  selectedYear: number
  min: DateParts
  max: DateParts
  isDark: boolean
  onPick: (year: number) => void
}) {
  const years = yearList(min, max)
  const selectedIndex = Math.max(0, years.indexOf(selectedYear))
  const selectedRow = Math.floor(selectedIndex / YEAR_COLUMNS)
  const selectedBg = isDark ? '#1C3C31' : '#EEF6EF'
  const scrollRef = useRef<{ scrollTo: (opts: { y: number; animated?: boolean }) => void }>(null)
  const rows: number[][] = []
  for (let i = 0; i < years.length; i += YEAR_COLUMNS) {
    rows.push(years.slice(i, i + YEAR_COLUMNS))
  }

  return (
    <ScrollView
      ref={(node) => {
        scrollRef.current = node
      }}
      style={{ maxHeight: YEAR_ROW_HEIGHT * 6 }}
      onLayout={() => {
        scrollRef.current?.scrollTo({ y: selectedRow * YEAR_ROW_HEIGHT, animated: false })
      }}>
      <YStack>
        {rows.map((rowYears, rowIndex) => (
          <XStack key={rowYears.join('-')} gap={8} style={{ height: YEAR_ROW_HEIGHT }}>
            {rowYears.map((year) => {
              const disabled = isYearDisabled(year, min, max)
              const selected = year === selectedYear
              return (
                <XStack
                  key={year}
                  flex={1}
                  minH={TOQUE_MINIMO}
                  items="center"
                  justify="center"
                  rounded={16}
                  bg={selected ? selectedBg : 'transparent'}
                  opacity={disabled ? 0.35 : 1}
                  onPress={disabled ? undefined : () => onPick(year)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled, selected }}
                  accessibilityLabel={String(year)}>
                  <Text fontSize={17} fontWeight={selected ? '800' : '700'} color="brandFg">
                    {year}
                  </Text>
                </XStack>
              )
            })}
            {rowYears.length < YEAR_COLUMNS
              ? Array.from({ length: YEAR_COLUMNS - rowYears.length }, (_, index) => (
                  <YStack key={`pad-${rowIndex}-${index}`} flex={1} />
                ))
              : null}
          </XStack>
        ))}
      </YStack>
    </ScrollView>
  )
}
