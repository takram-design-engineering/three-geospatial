import {
  extend,
  type BufferGeometryNode,
  type MeshProps
} from '@react-three/fiber'
import { forwardRef, useRef } from 'react'
import { mergeRefs } from 'react-merge-refs'
import { type Mesh } from 'three'

import { EllipsoidGeometry } from '../EllipsoidGeometry'

declare module '@react-three/fiber' {
  interface ThreeElements {
    ellipsoidGeometry: BufferGeometryNode<
      EllipsoidGeometry,
      typeof EllipsoidGeometry
    >
  }
}

export interface EllipsoidMeshProps extends Omit<MeshProps, 'args'> {
  args?: ConstructorParameters<typeof EllipsoidGeometry>
}

export const EllipsoidMesh = /*#__PURE__*/ forwardRef<Mesh, EllipsoidMeshProps>(
  function Ellipsoid({ args, children, ...props }, forwardedRef) {
    const ref = useRef<Mesh | null>(null)
    extend({ EllipsoidGeometry })
    return (
      <mesh ref={mergeRefs([ref, forwardedRef])} {...props}>
        <ellipsoidGeometry args={args} />
        {children}
      </mesh>
    )
  }
)
