import { useEffect, useState } from 'react'

export function useRetryAfter() {
  const [retryAfter, setRetryAfter] = useState(0)

  useEffect(() => {
    if (retryAfter <= 0) return
    const id = setInterval(() => {
      setRetryAfter((seconds) => Math.max(0, seconds - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [retryAfter])

  return { retryAfter, setRetryAfter, isCoolingDown: retryAfter > 0 }
}
