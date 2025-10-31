import { useFrame } from '@react-three/fiber'
import { useMemo, type ComponentProps, type FC } from 'react'

import { euclideanModulo } from '@takram/three-geospatial'

import { useGLTF } from '../hooks/useGLTF'

export interface B787Props extends ComponentProps<'group'> {}

export const B787: FC<B787Props> = props => {
  const gltf = useGLTF('public/b787.glb')

  const userData: {
    initialized?: boolean
  } = gltf.userData

  if (userData.initialized !== true) {
    userData.initialized = true
    Object.values(gltf.meshes).forEach(mesh => {
      mesh.receiveShadow = true
      mesh.castShadow = true
    })
  }

  const { engines } = useMemo(() => {
    const scene = gltf.scene
    return {
      engines: [
        scene.getObjectByName('Engine_Left_63'),
        scene.getObjectByName('Engine_Right_66')
      ].filter(value => value != null)
    }
  }, [gltf.scene])

  useFrame((state, delta) => {
    const rpm = 8400
    const tau = Math.PI * 2
    let r = engines[0].rotation.z
    r = euclideanModulo(r + (rpm / 60) * delta * tau, tau)
    engines[0].rotation.z = r
    engines[1].rotation.z = r
  })

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
