import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type FC } from 'react'
import StatsImpl from 'stats-gl'

import { useControls } from '../helpers/useControls'

export const Stats: FC = () => {
  const { show } = useControls('stats', { show: false }, { collapsed: true })

  const statsRef = useRef<StatsImpl>()
  const gl = useThree(({ gl }) => gl)
  useEffect(() => {
    if (!show) {
      statsRef.current = undefined
      return
    }
    const stats = new StatsImpl({
      trackGPU: true
    })
    stats.init(gl).catch(error => {
      console.error(error)
    })
    statsRef.current = stats
    document.body.appendChild(stats.dom)
    return () => {
      document.body.removeChild(stats.dom)
    }
  }, [show, gl])

  useFrame(() => {
    statsRef.current?.update()
  })

  return null
}