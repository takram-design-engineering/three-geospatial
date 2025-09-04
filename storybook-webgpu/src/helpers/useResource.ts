import { useCallback, useEffect, useMemo, useRef } from 'react'

interface Resource {
  dispose: () => void
}

type ManageFunction = <R extends readonly Resource[]>(
  ...resources: R
) => R['length'] extends 1 ? R[0] : R

export function useResource<T extends Resource | Resource[]>(
  callback: (manage: ManageFunction) => T,
  deps: readonly unknown[]
): T {
  const managedResourcesRef = useRef<Resource[]>([])
  const manage = useCallback((...resources: readonly Resource[]) => {
    managedResourcesRef.current.push(...resources)
    return resources.length === 1 ? resources[0] : resources
  }, []) as ManageFunction

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resource = useMemo(() => callback(manage), deps)

  useEffect(() => {
    return () => {
      const resources = [
        ...(Array.isArray(resource) ? resource : [resource]),
        ...managedResourcesRef.current
      ].filter((value, index, array) => array.indexOf(value) === index)
      managedResourcesRef.current = []

      for (const resource of resources) {
        resource.dispose()
      }
    }
  }, [resource])

  return resource
}
