import { useEffect, useMemo } from 'react'

interface Resource {
  dispose?: () => void
}

export function useResource<T extends Resource>(
  callback: () => T,
  deps: readonly unknown[] = []
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resource = useMemo(() => callback(), deps)
  useEffect(() => {
    return () => {
      resource.dispose?.()
    }
  }, [resource])
  return resource
}
