import { useLoader } from '@react-three/fiber'
import { type FolderSettings } from 'leva/dist/declarations/src/types'
import { useMemo } from 'react'
import { FileLoader } from 'three'

import { useControls } from './useControls'

interface Entry {
  category: string
  manufacturer: string
  file: string
}

export function useColorGradingControls(
  folderSettings?: FolderSettings
): string | null {
  const data = useLoader(FileLoader, 'public/clut/index.json', loader => {
    loader.setResponseType('json')
  }) as Entry[]

  const films = useMemo(
    () =>
      data
        .map(({ category, manufacturer, file }) => [
          file.slice(0, -4),
          `public/clut/${category}/${manufacturer}/${file}`
        ])
        .sort(([a], [b]) => a.localeCompare(b))
        .reduce<Record<string, string>>(
          (films, [key, value]) => ({
            ...films,
            [key]: value
          }),
          {}
        ),
    [data]
  )

  const { enabled, film } = useControls(
    'color grading',
    {
      enabled: false,
      film: {
        options: films
      }
    },
    { collapsed: true, ...folderSettings },
    [films]
  )

  return enabled ? film : null
}
