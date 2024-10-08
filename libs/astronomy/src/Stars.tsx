import { type PointsProps } from '@react-three/fiber'
import axios from 'axios'
import { forwardRef, useEffect, useMemo } from 'react'
import { suspend } from 'suspend-react'
import { type Points } from 'three'

import { StarsGeometry } from './StarsGeometry'
import { StarsMaterial } from './StarsMaterial'

export interface StarsProps extends PointsProps {
  pointSize?: number
  radianceScale?: number
}

export const Stars = forwardRef<
  Points<StarsGeometry, StarsMaterial>,
  StarsProps
>(function Stars(
  { pointSize = 1, radianceScale = 10, ...props },
  forwardedRef
) {
  // TODO: Replace with a more advanced cache.
  const data = suspend(async () => {
    const response = await axios<ArrayBuffer>('/stars.bin', {
      responseType: 'arraybuffer'
    })
    return response.data
  }, [])

  const geometry = useMemo(() => new StarsGeometry(data), [data])
  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  const material = useMemo(() => new StarsMaterial(), [])
  return (
    <points ref={forwardedRef} {...props}>
      <primitive object={geometry} />
      <primitive
        object={material}
        vertexColors
        size={pointSize}
        sizeAttenuation={false}
        color={[radianceScale, radianceScale, radianceScale]}
      />
    </points>
  )
})
