import { OrbitControls, Plane } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { Fragment, useEffect, useRef, type FC } from 'react'
import { BoxGeometry, Material, MeshStandardMaterial } from 'three'
import { ShadowMapViewer } from 'three-stdlib'

import { CascadedDirectionalLights, CSM, useCSM } from '@geovanni/csm/r3f'

import { useControls } from '../helpers/useControls'

const floorMaterial = new MeshStandardMaterial({ color: '#252a34' })
const material1 = new MeshStandardMaterial({ color: '#08d9d6' })
const material2 = new MeshStandardMaterial({ color: '#ff2e63' })

const boxGeometry = new BoxGeometry(10, 10, 10)
const boxHeights = Array.from({ length: 40 }, () => [
  Math.random(),
  Math.random()
])

const Scene: FC = () => {
  const csm = useCSM()

  useEffect(
    () => csm.setupMaterials([floorMaterial, material1, material2]),
    [csm]
  )

  const { directionX, directionY, directionZ } = useControls('Controls', {
    directionX: { value: -1, min: -1, max: 1 },
    directionY: { value: -1, min: -1, max: 1 },
    directionZ: { value: -1, min: -1, max: 1 }
  })

  const gl = useThree(({ gl }) => gl)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const { anotherLight } = useControls('Scene', {
    shadows: {
      value: true,
      onChange: value => {
        gl.shadowMap.enabled = value
        scene.traverse(child => {
          if ('material' in child && child.material instanceof Material) {
            child.material.needsUpdate = true
          }
        })
      }
    },
    cameraFar: {
      value: camera.far,
      min: 1,
      max: 5000,
      onChange: value => {
        camera.far = value
        camera.updateProjectionMatrix()
      }
    },
    anotherLight: true
  })

  const viewersRef = useRef<ShadowMapViewer[]>([])

  useFrame(({ gl, scene, camera }) => {
    const lights = csm.directionalLights.cascadedLights
    for (let i = 0; i < lights.length; ++i) {
      const light = lights[i]
      if (viewersRef.current[i] == null && light.shadow.map?.texture != null) {
        const viewer = new ShadowMapViewer(light)
        viewer.position.set(0, 100 * i)
        viewer.size.set(100, 100)
        viewersRef.current[i] = viewer
      }
    }
    gl.render(scene, camera)
    viewersRef.current.forEach(viewer => {
      viewer?.render(gl)
    })
  }, 1)

  return (
    <>
      <color args={['#454e61']} attach='background' />
      <OrbitControls target={[-100, 10, 0]} maxPolarAngle={Math.PI / 2} />
      <ambientLight args={[0xffffff, 1.5]} />
      <CascadedDirectionalLights
        intensity={3}
        direction={[directionX, directionY, directionZ]}
      />
      {anotherLight && (
        <directionalLight
          args={[0xffffff, 1.5]}
          position={[200, 200, -200]}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-250}
          shadow-camera-right={250}
          shadow-camera-top={250}
          shadow-camera-bottom={-250}
          shadow-camera-near={0}
          shadow-camera-far={500}
        />
      )}
      <Plane
        args={[10000, 10000]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
        material={floorMaterial}
      />
      {boxHeights.map(([left, right], index) => (
        <Fragment key={index}>
          <mesh
            geometry={boxGeometry}
            material={index % 2 === 0 ? material1 : material2}
            position={[-index * 25, 20, 30]}
            scale={[1, left * 2 + 6, 1]}
            receiveShadow
            castShadow
          />
          <mesh
            geometry={boxGeometry}
            material={index % 2 === 0 ? material2 : material1}
            position={[-index * 25, 20, -30]}
            scale={[1, right * 2 + 6, 1]}
            receiveShadow
            castShadow
          />
        </Fragment>
      ))}
    </>
  )
}

const Story: StoryFn = () => {
  const { fade, far, mode, margin } = useControls('Controls', {
    fade: true,
    far: { value: 1000, min: 1, max: 5000 },
    mode: { options: ['practical', 'uniform', 'logarithmic'] as const },
    margin: { value: 100, min: 0, max: 200 }
  })

  return (
    <Canvas
      shadows
      gl={{ logarithmicDepthBuffer: true }}
      camera={{ near: 0.1, far: 5000, position: [60, 60, 0] }}
    >
      <CSM fade={fade} far={far} mode={mode} margin={margin}>
        <Scene />
      </CSM>
    </Canvas>
  )
}

export default Story
