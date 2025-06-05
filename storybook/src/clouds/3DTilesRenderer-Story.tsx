import { css } from '@emotion/react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import {
  type GlobeControls as GlobeControlsImpl,
  type TilesRenderer as TilesRendererImpl
} from '3d-tiles-renderer'
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import {
  GlobeControls,
  TilesAttributionOverlay,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import { useAtomValue, useSetAtom } from 'jotai'
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
import { DRACOLoader } from 'three-stdlib'

import {
  AerialPerspective,
  Atmosphere,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { type CloudsEffect } from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'
import {
  Depth,
  Dithering,
  LensFlare,
  Normal
} from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { HaldLUT } from '../helpers/HaldLUT'
import { googleMapsApiKeyAtom, needsApiKeyAtom } from '../helpers/states'
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
import { TileCreasedNormalsPlugin } from '../plugins/TileCreasedNormalsPlugin'
import { useCloudsControls } from './helpers/useCloudsControls'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const Globe: FC = () => {
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

  const apiKey = useAtomValue(googleMapsApiKeyAtom)

  const [tiles, setTiles] = useState<TilesRendererImpl | null>(null)
  const setNeedsApiKey = useSetAtom(needsApiKeyAtom)
  useEffect(() => {
    if (tiles == null) {
      return
    }
    const callback = (): void => {
      setNeedsApiKey(true)
    }
    tiles.addEventListener('load-error', callback)
    return () => {
      tiles.removeEventListener('load-error', callback)
    }
  }, [tiles, setNeedsApiKey])

  return (
    <TilesRenderer
      key={apiKey} // Reconstruct tiles when API key changes.
      ref={setTiles}
    >
      {apiKey !== '' ? (
        <TilesPlugin
          plugin={GoogleCloudAuthPlugin}
          args={{
            apiToken: apiKey,
            autoRefreshToken: true
          }}
        />
      ) : (
        <TilesPlugin
          plugin={GoogleCloudAuthPlugin}
          args={{
            apiToken: import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY,
            autoRefreshToken: true
          }}
        />
      )}
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin
        plugin={TileCreasedNormalsPlugin}
        args={{ creaseAngle: radians(30) }}
      />
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
      <TilesAttributionOverlay />
    </TilesRenderer>
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
  const camera = useThree(({ camera }) => camera)
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
  usePovControls(camera, { collapsed: true })
  const motionDate = useLocalDateControls({ longitude, ...localDate })
  const { correctAltitude, correctGeometricError, photometric } = useControls(
    'atmosphere',
    {
      correctAltitude: true,
      correctGeometricError: true,
      photometric: true
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
    <Atmosphere
      ref={atmosphereRef}
      correctAltitude={correctAltitude}
      photometric={photometric}
    >
      <Globe />
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
                sunIrradiance
                skyIrradiance
                correctGeometricError={correctGeometricError}
                irradianceScale={2 / Math.PI}
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
  const needsApiKey = useAtomValue(needsApiKeyAtom)
  return (
    <>
      <Canvas gl={{ depth: false }}>
        <Stats />
        <Scene {...props} />
      </Canvas>
      {needsApiKey && (
        <div
          css={css`
            position: absolute;
            top: 50%;
            left: 50%;
            color: white;
            text-align: center;
            line-height: 1.5;
            transform: translate(-50%, -50%);
          `}
        >
          Our API key has seemingly exceeded its daily quota.
          <br />
          Enter your{' '}
          <a
            href='https://developers.google.com/maps/documentation/tile/get-api-key'
            target='_blank'
            rel='noreferrer'
            style={{ color: 'inherit' }}
          >
            Google Maps API key
          </a>{' '}
          at the top right of this screen, or check back tomorrow.
        </div>
      )}
    </>
  )
}

export default Story
