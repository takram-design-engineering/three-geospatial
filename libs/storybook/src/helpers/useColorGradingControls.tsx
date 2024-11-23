import { useMemo } from 'react'
import { suspend } from 'suspend-react'

import { axios } from '@geovanni/core'

import { useControls } from './useControls'

interface Entry {
  category: string
  manufacturer: string
  file: string
}

export function useColorGradingControls(): string | null {
  const data = suspend(
    async () => (await axios<Entry[]>('/clut/index.json')).data,
    [useColorGradingControls]
  )

  const films = useMemo(
    () =>
      data
        .map(({ category, manufacturer, file }) => [
          file.slice(0, -4),
          `/clut/${category}/${manufacturer}/${file}`
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
    { collapsed: true },
    [films]
  )

  return enabled ? film : null
}
