import { type MeshProps } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import { mergeRefs } from 'react-merge-refs'
import { type Mesh } from 'three'

import { EllipsoidGeometry } from '../EllipsoidGeometry'

export interface EllipsoidProps extends Omit<MeshProps, 'args'> {
  args?: ConstructorParameters<typeof EllipsoidGeometry>
}

export const Ellipsoid = forwardRef<Mesh, EllipsoidProps>(function Ellipsoid(
  { args, children, ...props },
  forwardedRef
) {
  const ref = useRef<Mesh | null>(null)
  const geometry = useMemo(() => new EllipsoidGeometry(...(args ?? [])), [args])
  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  })
  return (
    <mesh ref={mergeRefs([ref, forwardedRef])} {...props}>
      <primitive object={geometry} attach='geometry' />
      {children}
    </mesh>
  )
})
