import { useFrame, useThree } from '@react-three/fiber'
import {
  createContext,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  type ReactNode
} from 'react'

import {
  CascadedShadowMaps,
  cascadedShadowMapsOptionsDefaults,
  type CascadedShadowMapsOptions
} from '../CascadedShadowMaps'

export interface CSMContextValue {
  csm: CascadedShadowMaps
}

export const CSMContext = createContext<CSMContextValue | null>(null)

export interface CSMProps extends CascadedShadowMapsOptions {
  children?: ReactNode
}

export const CSM = forwardRef<CascadedShadowMaps, CSMProps>(function CSM(
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
})
