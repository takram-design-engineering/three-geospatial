import { useEffect, useMemo } from 'react'

interface Resource {
  dispose?: () => void
}

export function useResource<T extends Resource[]>(
  callback: () => T,
  deps: readonly unknown[]
): T

export function useResource<T extends Resource>(
  callback: () => T,
  deps: readonly unknown[]
): T

export function useResource<T extends Resource>(
  callback: () => T | T[],
  deps: readonly unknown[]
): T | T[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resource = useMemo(() => callback(), deps)

  useEffect(() => {
    return () => {
      const resources = Array.isArray(resource) ? resource : [resource]
      for (const resource of resources) {
        resource.dispose?.()
      }
    }
  }, [resource])

  return resource
}
