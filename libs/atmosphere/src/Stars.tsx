import { useFrame, useThree, type PointsProps } from '@react-three/fiber'
import axios from 'axios'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import { mergeRefs } from 'react-merge-refs'
import { suspend } from 'suspend-react'
import { type Points } from 'three'

import { StarsGeometry } from './StarsGeometry'
import { StarsMaterial } from './StarsMaterial'

export interface StarsProps extends PointsProps {
  pointSize?: number
  radianceScale?: number
  disableTransform?: boolean
}

export const Stars = forwardRef<
  Points<StarsGeometry, StarsMaterial>,
  StarsProps
>(function Stars(
  { pointSize = 1, radianceScale = 1, disableTransform = false, ...props },
  forwardedRef
) {
  // TODO: Replace with a more advanced cache.
  const data = suspend(async () => {
    const response = await axios<ArrayBuffer>('/stars.bin', {
      responseType: 'arraybuffer'
    })
    return response.data
  }, [Stars])

  const geometry = useMemo(() => new StarsGeometry(data), [data])
  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  const material = useMemo(() => new StarsMaterial(), [])

  const { camera } = useThree()
  const ref = useRef<Points>(null)
  useFrame(() => {
    if (disableTransform) {
      return
    }
    const points = ref.current
    if (points != null) {
      camera.getWorldPosition(points.position)
      points.scale.setScalar(camera.far)

      // WORKAROUND: GlobeControls tests intersection with scene objects and
      // adjust the camera position accordingly.
      const { boundingSphere } = geometry
      if (boundingSphere != null) {
        boundingSphere.center.x = -points.position.x
        boundingSphere.center.y = -points.position.y
        boundingSphere.center.z = -points.position.z
        boundingSphere.radius = 1 / camera.far
      }
    }
  })

  return (
    <points
      ref={mergeRefs([ref, forwardedRef])}
      {...props}
      frustumCulled={false}
    >
      <primitive object={geometry} />
      <primitive
        object={material}
        vertexColors
        size={pointSize}
        sizeAttenuation={false}
        color={[radianceScale, radianceScale, radianceScale]}
        depthTest={false}
        depthWrite={false}
      />
    </points>
  )
})
