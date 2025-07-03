import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, type FC } from 'react'
import StatsImpl from 'stats-gl'

import { useControls } from '../helpers/useControls'

export const Stats: FC = () => {
  const { show } = useControls('stats', { show: false }, { collapsed: true })

  const statsRef = useRef<StatsImpl>(undefined)
  const renderer = useThree(({ gl }) => gl)
  useEffect(() => {
    if (!show) {
      statsRef.current = undefined
      return
    }
    const stats = new StatsImpl({
      trackGPU: true,
      precision: 0
    })
    stats.init(renderer).catch((error: unknown) => {
      console.error(error)
    })
    statsRef.current = stats
    document.body.appendChild(stats.dom)
    return () => {
      document.body.removeChild(stats.dom)
    }
  }, [show, renderer])

  useFrame(() => {
    statsRef.current?.update()
  })

  return null
}
