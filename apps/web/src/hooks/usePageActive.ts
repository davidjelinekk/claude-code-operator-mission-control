import { useEffect, useState } from 'react'

export function usePageActive(): boolean {
  const [isActive, setIsActive] = useState(() => !document.hidden)

  useEffect(() => {
    const handler = () => setIsActive(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  return isActive
}
