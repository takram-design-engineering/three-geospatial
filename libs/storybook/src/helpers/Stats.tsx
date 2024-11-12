import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo, type FC } from 'react'
import StatsImpl from 'stats-gl'

export const Stats: FC = () => {
  const { show } = useControls('stats', { show: false })

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
