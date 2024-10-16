import { OrbitControls, Plane } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { useControls } from 'leva'
import { Fragment, useEffect, useMemo, useRef, type FC } from 'react'
import { BoxGeometry, MeshStandardMaterial } from 'three'
import { ShadowMapViewer } from 'three-stdlib'

import { radians } from '@geovanni/core'

import { CascadedShadowMaps } from '../CascadedShadowMaps'
import { CSMHelper } from '../CSMHelper'

const floorMaterial = new MeshStandardMaterial({ color: '#252a34' })
const material1 = new MeshStandardMaterial({ color: '#08d9d6' })
const material2 = new MeshStandardMaterial({ color: '#ff2e63' })

const boxGeometry = new BoxGeometry(10, 10, 10)
const boxHeights = Array.from({ length: 40 }, () => [
  Math.random(),
  Math.random()
])

const Scene: FC = () => {
  const { camera, viewport } = useThree()

  const csm = useMemo(
    () =>
      new CascadedShadowMaps(camera, {
        cascadeCount: 4,
        far: 1000,
        mode: 'practical',
        fade: true
      }),
    [camera]
  )
  useEffect(() => {
    return () => {
      csm.dispose()
    }
  }, [csm])

  const helper = useMemo(() => new CSMHelper(csm), [csm])

  useEffect(() => {
    csm.setupMaterial(floorMaterial)
    csm.setupMaterial(material1)
    csm.setupMaterial(material2)
  }, [csm])

  useEffect(() => {
    csm.needsUpdateFrusta = true
  }, [viewport, csm])

  useFrame(() => {
    camera.updateMatrixWorld()
    csm.update()
    helper.displayPlanes = false
    helper.displayFrustum = false
    helper.updateVisibility()
    helper.update()
  })

  useControls('Controls', {
    orthographic: false,
    fade: {
      value: true,
      onChange: value => {
        csm.fade = value
        csm.needsUpdateFrusta = true
      }
    },
    far: {
      value: 1000,
      min: 1,
      max: 5000,
      onChange: value => {
        csm.far = value
        csm.needsUpdateFrusta = true
      }
    },
    mode: {
      options: ['practical', 'uniform', 'logarithmic'],
      onChange: value => {
        csm.mode = value
        csm.needsUpdateFrusta = true
      }
    },
    margin: { value: 100 },
    direction: {
      value: {
        x: 125,
        y: -135
      },
      joystick: false,
      onChange: value => {
        csm.directionalLight.direction.setFromSphericalCoords(
          1,
          radians(value.x),
          radians(value.y)
        )
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
    }
  })

  const { visible } = useControls('Helper', {
    visible: false,
    frustum: true,
    planes: true,
    shadowBounds: true,
    autoUpdate: true
  })

  const viewersRef = useRef<ShadowMapViewer[]>([])

  useFrame(({ gl, scene, camera }) => {
    const lights = csm.directionalLight.cascadedLights
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
      <primitive object={csm.directionalLight} mainLight-intensity={3} />
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
      {visible && <primitive object={helper} />}
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

export const Basic: StoryFn = () => (
  <Canvas
    shadows
    gl={{ logarithmicDepthBuffer: true }}
    camera={{ near: 0.1, far: 5000, position: [60, 60, 0] }}
  >
    <Scene />
  </Canvas>
)
