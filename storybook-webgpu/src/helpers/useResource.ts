import { useCallback, useEffect, useMemo, useRef } from 'react'

interface Resource {
  dispose: () => void
}

type ManageFunction = <T extends Resource, Rest extends readonly Resource[]>(
  resource: T,
  ...resources: Rest
) => Rest['length'] extends 0 ? T : [T, ...Rest]

export function useResource<T extends Resource | Resource[]>(
  callback: (manage: ManageFunction) => T,
  deps: readonly unknown[]
): T {
  const managedResourcesRef = useRef<Resource[]>([])
  const manage = useCallback(
    (resource: Resource, ...resources: readonly Resource[]) => {
      managedResourcesRef.current.push(resource, ...resources)
      return resources.length === 0 ? resource : [resource, ...resources]
    },
    []
  ) as ManageFunction

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
