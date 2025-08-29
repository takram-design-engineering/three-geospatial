import { useCallback, useEffect, useMemo, useRef } from 'react'

interface Resource {
  dispose: () => void
}

export function useResource<T extends Resource | Resource[]>(
  callback: (
    manage: <R extends readonly Resource[]>(...resources: R) => R
  ) => T,
  deps: readonly unknown[]
): T {
  const managedResourcesRef = useRef<Resource[]>([])
  const manage = useCallback((...resources: readonly Resource[]) => {
    managedResourcesRef.current.push(...resources)
    return resources
  }, []) as <R extends readonly Resource[]>(...resources: R) => R

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resource = useMemo(() => callback(manage), deps)

  useEffect(() => {
    return () => {
      if (Array.isArray(resource)) {
        resource.forEach(resource => {
          resource.dispose()
        })
      } else {
        resource.dispose()
      }
    }
  }, [resource])

  return resource
}
