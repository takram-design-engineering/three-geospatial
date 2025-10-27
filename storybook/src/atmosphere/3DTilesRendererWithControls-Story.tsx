import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { OrbitControls, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
import {
  EffectMaterial,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import { Fragment, useLayoutEffect, useRef, useState, type FC } from 'react'

import {
  AerialPerspective,
  Atmosphere,
  Sky,
  Stars,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'
import {
  Depth,
  Dithering,
  LensFlare,
  Normal
} from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Globe } from '../helpers/Globe'
import { GoogleMapsAPIKeyPrompt } from '../helpers/GoogleMapsAPIKeyPrompt'
import { HaldLUT } from '../helpers/HaldLUT'
import { Stats } from '../helpers/Stats'
import { useColorGradingControls } from '../helpers/useColorGradingControls'
import { useControls } from '../helpers/useControls'
import { useGoogleMapsAPIKeyControls } from '../helpers/useGoogleMapsAPIKeyControls'
import {
  useLocalDateControls,
  type LocalDateControlsParams
} from '../helpers/useLocalDateControls'
import { usePovControls } from '../helpers/usePovControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import type {
  OrthographicCamera as OrthographicCameraImpl,
  PerspectiveCamera as PerspectiveCameraImpl,
  Vector3
} from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

enum CameraTypes {
  perspective = 'perspective',
  orthographic = 'orthographic'
}

interface SceneProps extends LocalDateControlsParams {
  exposure?: number
  longitude?: number
  latitude?: number
  heading?: number
  pitch?: number
  distance?: number
}

const Scene: FC<SceneProps> = ({
  exposure = 10,
  longitude = 139.7671,
  latitude = 35.6812,
  heading = 180,
  pitch = -30,
  distance = 4500,
  ...localDate
}) => {
  const { toneMappingMode } = useToneMappingControls({ exposure })
  const { cameraType, fov } = useControls(
    'camera',
    {
      cameraType: {
        value: CameraTypes.perspective,
        label: 'type',
        options: CameraTypes
      },
      fov: {
        value: 60,
        min: 10,
        max: 120,
        step: 1,
        label: 'FOV',
        render: (get: any) => get('camera.cameraType') === CameraTypes.perspective
      }
    },
    { collapsed: true }
  )

  const lut = useColorGradingControls()
  const { lensFlare, normal, depth } = useControls(
    'effects',
    {
      lensFlare: true,
      depth: false,
      normal: false
    },
    { collapsed: true }
  )
  const camera = useThree(({ camera }) => camera)
  usePovControls(camera, { collapsed: true })
  const motionDate = useLocalDateControls({ longitude, ...localDate })
  const { correctAltitude, correctGeometricError } = useControls('atmosphere', {
    correctAltitude: true,
    correctGeometricError: true
  })
  const {
    enable: enabled,
    sun,
    sky,
    transmittance,
    inscatter
  } = useControls('aerial perspective', {
    enable: true,
    sun: true,
    sky: true,
    transmittance: true,
    inscatter: true
  })

  const [perspectiveCamera, setPerspectiveCamera] =
    useState<PerspectiveCameraImpl | null>(null)
  const [orthographicCamera, setOrthographicCamera] =
    useState<OrthographicCameraImpl | null>(null)
  const [orbitControls, setOrbitControls] = useState<OrbitControlsImpl | null>(
    null
  )

  const perspectivePosition: [number, number, number] = [50, 50, 70]
  const orthographicPosition = 100
  const orthographicZoom = 5

  useLayoutEffect(() => {
    // Check the camera position to see if we've already moved it to globe surface
    if (camera.position.length() > 10) {
      return
    }

    new PointOfView(distance, radians(heading), radians(pitch)).decompose(
      new Geodetic(radians(longitude), radians(latitude)).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [longitude, latitude, heading, pitch, distance, camera])

  // Effects must know the camera near/far changed by controls
  const composerRef = useRef<EffectComposerImpl>(null)
  useFrame(() => {
    const composer = composerRef.current
    if (composer != null) {
      composer.passes.forEach(pass => {
        if (pass.fullscreenMaterial instanceof EffectMaterial) {
          pass.fullscreenMaterial.adoptCameraSettings(camera)
        }
      })
    }
  })

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date(motionDate.get()))
  })

  const isPerspective = cameraType === CameraTypes.perspective

  return (
    <Atmosphere ref={atmosphereRef} correctAltitude={correctAltitude}>
      <Sky />
      <Stars data='atmosphere/stars.bin' />
      <Globe>
        {/* Custom OrbitControls instead of GlobeControls */}
        {isPerspective && (
          <>
            <PerspectiveCamera
              ref={setPerspectiveCamera}
              makeDefault
              position={perspectivePosition}
              fov={fov}
              near={0.1}
              far={100000}
            />
            <OrbitControls
              ref={setOrbitControls}
              camera={perspectiveCamera ?? undefined}
              enableDamping
              dampingFactor={0.05}
              minDistance={1}
              maxDistance={50000}
            />
          </>
        )}
        {!isPerspective && (
          <>
            <OrthographicCamera
              ref={setOrthographicCamera}
              makeDefault
              position={[orthographicPosition, orthographicPosition, orthographicPosition]}
              zoom={orthographicZoom}
              near={0.1}
              far={100000}
            />
            <OrbitControls
              ref={setOrbitControls}
              camera={orthographicCamera ?? undefined}
              enableDamping
              dampingFactor={0.05}
            />
          </>
        )}
      </Globe>
      <EffectComposer ref={composerRef} multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify([
            enabled,
            sun,
            sky,
            transmittance,
            inscatter,
            correctGeometricError,
            lensFlare,
            normal,
            depth,
            lut
          ])}
        >
          {enabled && !normal && !depth && (
            <AerialPerspective
              sunLight={sun}
              skyLight={sky}
              transmittance={transmittance}
              inscatter={inscatter}
              correctGeometricError={correctGeometricError}
              albedoScale={2 / Math.PI}
            />
          )}
          {lensFlare && <LensFlare />}
          {depth && <Depth useTurbo />}
          {normal && <Normal />}
          {!normal && !depth && (
            <>
              <ToneMapping mode={toneMappingMode} />
              {lut != null && <HaldLUT path={lut} />}
              <SMAA />
              <Dithering />
            </>
          )}
        </Fragment>
      </EffectComposer>
    </Atmosphere>
  )
}

export const Story: FC<SceneProps> = props => {
  useGoogleMapsAPIKeyControls()
  return (
    <>
      <Canvas gl={{ depth: false }} frameloop='demand'>
        <Stats />
        <Scene {...props} />
      </Canvas>
      <GoogleMapsAPIKeyPrompt />
    </>
  )
}

export default Story
