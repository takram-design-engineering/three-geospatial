import {
  applyProps,
  useFrame,
  useThree,
  type DirectionalLightProps
} from '@react-three/fiber'
import {
  createContext,
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode
} from 'react'
import { type Vector3Like, type Vector3Tuple } from 'three'

import { type CascadedDirectionalLight } from '../CascadedDirectionalLight'
import {
  CascadedShadowMaps,
  cascadedShadowMapsOptionsDefaults,
  type CascadedShadowMapsOptions
} from '../CascadedShadowMaps'
import { useCSM } from './useCSM'

export interface CSMContextValue {
  csm: CascadedShadowMaps
}

export const CSMContext = createContext<CSMContextValue | null>(null)

export interface CSMDirectionalLightProps
  extends Partial<{
    [K in keyof DirectionalLightProps as Exclude<
      DirectionalLightProps[K],
      null | undefined
    > extends Function
      ? never
      : K]: DirectionalLightProps[K]
  }> {
  direction?: Vector3Like | Vector3Tuple
}

const CSMDirectionalLight = memo(
  forwardRef<CascadedDirectionalLight, CSMDirectionalLightProps>(
    function CSMDirectionalLight({ direction, ...props }, forwardedRef) {
      const { directionalLight } = useCSM()
      if (direction != null) {
        directionalLight.direction.set(
          ...(Array.isArray(direction)
            ? direction
            : ([direction.x, direction.y, direction.z] as const))
        )
      }
      applyProps(directionalLight.mainLight, props)
      useImperativeHandle(forwardedRef, () => directionalLight, [
        directionalLight
      ])
      return null
    }
  )
)

export interface CSMProps extends CascadedShadowMapsOptions {
  children?: ReactNode
}

export const CSM = Object.assign(
  forwardRef<CascadedShadowMaps, CSMProps>(function CSM(
    { children, ...props },
    forwardedRef
  ) {
    const options = {
      ...cascadedShadowMapsOptionsDefaults,
      ...props
    }

    const camera = useThree(({ camera }) => camera)
    const optionsRef = useRef(options)
    const csm = useMemo(
      () => new CascadedShadowMaps(camera, optionsRef.current),
      [camera]
    )
    useEffect(() => {
      return () => {
        csm.dispose()
      }
    }, [csm])

    // TODO: Apply options

    const viewport = useThree(({ viewport }) => viewport)
    useEffect(() => {
      csm.needsUpdateFrusta = true
    }, [viewport, csm])

    useFrame(() => {
      camera.updateMatrixWorld()
      csm.update()
    })

    const context = useMemo(() => ({ csm }), [csm])
    return (
      <>
        <primitive ref={forwardedRef} object={csm} {...options} />
        <primitive object={csm.directionalLight} />
        <CSMContext.Provider value={context}>{children}</CSMContext.Provider>
      </>
    )
  }),
  { DirectionalLight: CSMDirectionalLight }
)
