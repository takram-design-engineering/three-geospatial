import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, type FC } from 'react'
import StatsImpl from 'stats-gl'

import { useControls } from '../helpers/useControls'

export const Stats: FC = () => {
  const { show } = useControls('stats', { show: false }, { collapsed: true })

  const gl = useThree(({ gl }) => gl)
  const stats = useMemo(() => {
    const stats = new StatsImpl({
      trackGPU: true
    })
    void stats.init(gl)
    return stats
  }, [gl])

  useEffect(() => {
    if (show) {
      document.body.appendChild(stats.dom)
      return () => {
        document.body.removeChild(stats.dom)
      }
    }
  }, [show, stats])

  useFrame(() => {
    if (show) {
      stats.update()
    }
  })

  return null
}
