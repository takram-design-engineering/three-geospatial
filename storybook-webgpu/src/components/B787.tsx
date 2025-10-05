import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, type ComponentProps, type FC } from 'react'

export interface B787Props extends ComponentProps<'group'> {}

export const B787: FC<B787Props> = props => {
  const gltf = useGLTF('public/b787.glb')
  useLayoutEffect(() => {
    Object.values(gltf.meshes).forEach(mesh => {
      mesh.receiveShadow = true
      mesh.castShadow = true
    })
  }, [gltf])

  return (
    <group {...props}>
      <primitive
        object={gltf.scene}
        position={[-4, -9, 0]}
        rotation-y={Math.PI}
      />
    </group>
  )
}
