import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import type { GlobeControls as GlobeControlsImpl } from '3d-tiles-renderer'
import { GlobeControls } from '3d-tiles-renderer/r3f'
import {
  EffectMaterial,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC
} from 'react'

import {
  AerialPerspective,
  Atmosphere,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import type { CloudsEffect } from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'
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
import { useKeyboardControl } from '../helpers/useKeyboardControl'
import {
  useLocalDateControls,
  type LocalDateControlsParams
} from '../helpers/useLocalDateControls'
import { usePovControls } from '../helpers/usePovControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import { useCloudsControls } from './helpers/useCloudsControls'

const GlobeAndControls: FC = () => {
  const controls = useThree(
    ({ controls }) => controls as GlobeControlsImpl | null
  )
  useEffect(() => {
    if (controls != null) {
      const callback = (): void => {
        controls.adjustHeight = true
        controls.removeEventListener('start', callback)
      }
      controls.addEventListener('start', callback)
      return () => {
        controls.removeEventListener('start', callback)
      }
    }
  }, [controls])

  return (
    <Globe>
      <GlobeControls
        enableDamping
        // Globe controls adjust the camera height based on very low LoD tiles
        // during the initial load, causing the camera to unexpectedly jump to
        // the sky when set to a low altitude.
        // Re-enable it when the user first drags.
        adjustHeight={false}
        maxAltitude={Math.PI * 0.55} // Permit grazing angles
        // maxDistance={7500} // Below the bottom of the top cloud layer, for now
      />
    </Globe>
  )
}

interface SceneProps extends LocalDateControlsParams {
  exposure?: number
  longitude?: number
  latitude?: number
  heading?: number
  pitch?: number
  distance?: number
  coverage?: number
}

const Scene: FC<SceneProps> = ({
  exposure = 10,
  longitude = 139.7671,
  latitude = 35.6812,
  heading = 180,
  pitch = -30,
  distance = 4500,
  coverage = 0.3,
  ...localDate
}) => {
  const { toneMappingMode } = useToneMappingControls({ exposure })
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
  const { correctAltitude, correctGeometricError } = useControls(
    'atmosphere',
    {
      correctAltitude: true,
      correctGeometricError: true
    },
    { collapsed: true }
  )

  useLayoutEffect(() => {
    new PointOfView(distance, radians(heading), radians(pitch)).decompose(
      new Geodetic(radians(longitude), radians(latitude)).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [longitude, latitude, heading, pitch, distance, camera])

  // Effects must know the camera near/far changed by GlobeControls.
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

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)
  const [{ enabled, toneMapping }, cloudsProps] = useCloudsControls(clouds, {
    coverage,
    animate: true
  })

  useKeyboardControl()

  return (
    <Atmosphere ref={atmosphereRef} correctAltitude={correctAltitude}>
      <GlobeAndControls />
      <EffectComposer ref={composerRef} multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify([
            correctGeometricError,
            lensFlare,
            normal,
            depth,
            lut,
            enabled,
            toneMappingMode
          ])}
        >
          {!normal && !depth && (
            <>
              {enabled && (
                <Clouds
                  ref={setClouds}
                  shadow-farScale={0.25}
                  {...cloudsProps}
                />
              )}
              <AerialPerspective
                sky
                sunLight
                skyLight
                correctGeometricError={correctGeometricError}
                albedoScale={2 / Math.PI}
              />
            </>
          )}
          {toneMapping && (
            <>
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
      <Canvas gl={{ depth: false }}>
        <Stats />
        <Scene {...props} />
      </Canvas>
      <GoogleMapsAPIKeyPrompt />
    </>
  )
}

export default Story
