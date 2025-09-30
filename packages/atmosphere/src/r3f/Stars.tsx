import { useFrame, useThree, type ElementProps } from '@react-three/fiber'
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC
} from 'react'
import { mergeRefs } from 'react-merge-refs'
import type { Points } from 'three'

import { ArrayBufferLoader } from '@takram/three-geospatial'

import type { AtmosphereMaterialProps } from '../AtmosphereMaterialBase'
import { DEFAULT_STARS_DATA_URL, SKY_RENDER_ORDER } from '../constants'
import { StarsGeometry } from '../StarsGeometry'
import {
  StarsMaterial,
  starsMaterialParametersDefaults
} from '../StarsMaterial'
import { AtmosphereContext } from './Atmosphere'
import { separateProps } from './separateProps'

export type StarsImpl = Points<StarsGeometry, StarsMaterial>

export interface StarsProps
  extends ElementProps<typeof Points>,
    AtmosphereMaterialProps {
  data?: ArrayBuffer | string
  pointSize?: number
  /** @deprecated Use intensity instead. */
  radianceScale?: number
  intensity?: number
  background?: boolean
}

export const Stars: FC<StarsProps> = ({
  ref: forwardedRef,
  data: dataProp = DEFAULT_STARS_DATA_URL,
  ...props
}) => {
  const { textures, transientStates, ...contextProps } =
    useContext(AtmosphereContext)

  const [
    atmosphereParameters,
    { pointSize, radianceScale, intensity, background, ...others }
  ] = separateProps({
    ...starsMaterialParametersDefaults,
    ...contextProps,
    ...textures,
    ...props
  })

  const [data, setData] = useState(
    typeof dataProp !== 'string' ? dataProp : undefined
  )
  useEffect(() => {
    if (typeof dataProp === 'string') {
      const loader = new ArrayBufferLoader()
      ;(async () => {
        setData(await loader.loadAsync(dataProp))
      })().catch((error: unknown) => {
        console.error(error)
      })
    } else {
      setData(dataProp)
    }
  }, [dataProp])

  const geometry = useMemo(
    () => (data != null ? new StarsGeometry(data) : undefined),
    [data]
  )
  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  const material = useMemo(() => new StarsMaterial(), [])
  useEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  const ref = useRef<Points>(null)
  useFrame(({ camera }) => {
    if (transientStates != null && camera.isPerspectiveCamera === true) {
      material.sunDirection.copy(transientStates.sunDirection)
      ref.current?.setRotationFromMatrix(transientStates.inertialToECEFMatrix)
      material.worldToECEFMatrix.copy(transientStates.worldToECEFMatrix)
    }
  })

  const camera = useThree(({ camera }) => camera)
  if (geometry == null || camera.isPerspectiveCamera !== true) {
    return null
  }
  return (
    <points
      ref={mergeRefs([ref, forwardedRef])}
      frustumCulled={false}
      renderOrder={SKY_RENDER_ORDER + 1}
      {...others}
    >
      <primitive object={geometry} />
      <primitive
        object={material}
        {...atmosphereParameters}
        pointSize={pointSize}
        radianceScale={radianceScale}
        intensity={intensity}
        background={background}
        depthTest={true}
        depthWrite={false}
      />
    </points>
  )
}
