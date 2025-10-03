import { addAfterEffect, useThree } from '@react-three/fiber'
import { useEffect, type FC } from 'react'
import StatsImpl from 'stats-gl'

import type { RendererArgs } from '../controls/rendererControls'
import { useControl } from '../hooks/useControl'

export const Stats: FC = () => {
  const show = useControl(({ showStats }: RendererArgs) => showStats)
  const renderer = useThree(({ gl }) => gl)

  useEffect(() => {
    if (!show) {
      return
    }
    const stats = new StatsImpl({
      trackGPU: true,
      trackCPT: true,
      horizontal: false
    })
    stats
      .init(renderer)
      .then(() => {
        addAfterEffect(() => {
          stats.update()
        })
      })
      .catch((error: unknown) => {
        console.error(error)
      })

    document.body.appendChild(stats.dom)
    return () => {
      document.body.removeChild(stats.dom)
    }
  }, [show, renderer])

  return null
}
