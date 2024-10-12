import { OrbitControls, Plane } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { Fragment, useEffect, useMemo, type FC } from 'react'
import * as THREE from 'three'

import { CSM } from '../lib/CSM'
import { CSMHelper } from '../lib/CSMHelper'

const Scene: FC = () => {
  const { scene, camera, viewport } = useThree()

  const csm = useMemo(
    () =>
      new CSM({
        maxFar: 5000,
        lightFar: 5000,
        cascades: 4,
        mode: 'practical',
        parent: scene,
        shadowMapSize: 4096,
        lightDirection: new THREE.Vector3(-1, -1, -1).normalize(),
        camera
      }),
    [scene, camera]
  )

  const csmHelper = useMemo(() => new CSMHelper(csm), [csm])

  useEffect(() => {
    csm.updateFrustums()
  }, [viewport, csm])

  useFrame(() => {
    camera.updateMatrixWorld()
    csm.update()
    csmHelper.update()
  })

  const floorMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#252a34' })
    csm.setupMaterial(material)
    return material
  }, [csm])

  const material1 = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#08d9d6' })
    csm.setupMaterial(material)
    return material
  }, [csm])

  const material2 = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#ff2e63' })
    csm.setupMaterial(material)
    return material
  }, [csm])

  const boxes = useMemo(() => {
    const geometry = new THREE.BoxGeometry(10, 10, 10)
    return [...Array(40)].map((_, index) => (
      <Fragment key={index}>
        <mesh
          geometry={geometry}
          material={index % 2 === 0 ? material1 : material2}
          position={[-index * 25, 20, 30]}
          scale={[1, Math.random() * 2 + 6, 1]}
          receiveShadow
          castShadow
        />
        <mesh
          geometry={geometry}
          material={index % 2 === 0 ? material2 : material1}
          position={[-index * 25, 20, -30]}
          scale={[1, Math.random() * 2 + 6, 1]}
          receiveShadow
          castShadow
        />
      </Fragment>
    ))
  }, [material1, material2])

  return (
    <>
      <color args={['#454e61']} attach='background' />
      <OrbitControls target={[-100, 10, 0]} maxPolarAngle={Math.PI / 2} />
      <ambientLight args={[0xffffff, 1.5]} />
      <directionalLight
        args={[0x000020, 1.5]}
        position={new THREE.Vector3(-1, -1, -1)
          .normalize()
          .multiplyScalar(-200)}
      />
      <primitive object={csmHelper} />
      <Plane
        args={[10000, 10000]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
        material={floorMaterial}
      />
      {boxes}
    </>
  )
}

export const Basic: StoryFn = () => {
  return (
    <Canvas shadows camera={{ near: 0.1, far: 5000, position: [60, 60, 0] }}>
      <Scene />
    </Canvas>
  )
}
