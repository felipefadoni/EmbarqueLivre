import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { todayIso } from '@/features/cadastros/dates'
import { msUntilNextLocalMidnight } from './period'

/**
 * "Hoje" (YYYY-MM-DD no fuso do aparelho), atualizado ao voltar para o primeiro plano e na virada do dia.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => todayIso())

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(todayIso())
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    // Reagenda a cada mudança de dia (inclusive a disparada pelo AppState).
    const timer = setTimeout(() => setToday(todayIso()), msUntilNextLocalMidnight())
    return () => clearTimeout(timer)
  }, [today])

  return today
}
