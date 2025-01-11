import { css } from '@emotion/react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import {
  GlobeControls,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import { useAtom, useAtomValue } from 'jotai'
import {
  EffectMaterial,
  ToneMappingMode,
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
import { NearestFilter, RedFormat, RepeatWrapping, RGBAFormat } from 'three'
import { DRACOLoader } from 'three-stdlib'

import { TileCreasedNormalsPlugin } from '@takram/three-3d-tiles-support'
import {
  AerialPerspective,
  Atmosphere,
  Sky,
  Stars,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  createData3DTextureLoaderClass,
  Geodetic,
  parseUint8Array,
  PointOfView,
  radians
} from '@takram/three-geospatial'
import {
  Depth,
  Dithering,
  LensFlare,
  Normal
} from '@takram/three-geospatial-effects/r3f'
import {
  STBN_TEXTURE_DEPTH,
  STBN_TEXTURE_SIZE,
  type CloudsEffect
} from '@takram/three-global-clouds'
import { Clouds } from '@takram/three-global-clouds/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { HaldLUT } from '../helpers/HaldLUT'
import { googleMapsApiKeyAtom } from '../helpers/states'
import { Stats } from '../helpers/Stats'
import { useColorGradingControls } from '../helpers/useColorGradingControls'
import { useControls } from '../helpers/useControls'
import { useExposureControls } from '../helpers/useExposureControls'
import {
  useLocalDateControls,
  type LocalDateControlsParams
} from '../helpers/useLocalDateControls'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const Globe: FC = () => {
  const apiKey = useAtomValue(googleMapsApiKeyAtom)
  return (
    <TilesRenderer
      key={apiKey} // Reconstruct tiles when API key changes.
    >
      <TilesPlugin plugin={GoogleCloudAuthPlugin} args={{ apiToken: apiKey }} />
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin
        plugin={TileCreasedNormalsPlugin}
        args={{ creaseAngle: radians(30) }}
      />
      <GlobeControls
        enableDamping={true}
        // TODO: Re-enable adjustHeight after initial load completes.
        adjustHeight={false}
      />
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
  useExposureControls({ exposure })
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

  const { enabled, coverage, useShapeDetail, usePowder } = useControls(
    'clouds',
    {
      enabled: true,
      coverage: { value: 0.25, min: 0, max: 1, step: 0.01 },
      useShapeDetail: true,
      usePowder: true
    }
  )

  const { showShadowMap: debugShowShadowMap, showCascades: debugShowCascades } =
    useControls('debug', {
      showShadowMap: false,
      showCascades: false
    })

  const camera = useThree(({ camera }) => camera)
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

  const blueNoiseTexture = useLoader(
    createData3DTextureLoaderClass(parseUint8Array, {
      format: RedFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      width: STBN_TEXTURE_SIZE,
      height: STBN_TEXTURE_SIZE,
      depth: STBN_TEXTURE_DEPTH
    }),
    '/clouds/stbn_scalar.bin'
  )

  const blueNoiseVectorTexture = useLoader(
    createData3DTextureLoaderClass(parseUint8Array, {
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      width: STBN_TEXTURE_SIZE,
      height: STBN_TEXTURE_SIZE,
      depth: STBN_TEXTURE_DEPTH
    }),
    '/clouds/stbn_unit_vector.bin'
  )

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)

  useEffect(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.useShapeDetail = useShapeDetail
    clouds.cloudsMaterial.usePowder = usePowder
    clouds.cloudLayers[0].minHeight = 750
    clouds.cloudLayers[0].maxHeight = 1300
  }, [clouds, useShapeDetail, usePowder])

  useEffect(() => {
    if (clouds == null) {
      return
    }
    if (debugShowShadowMap) {
      clouds.cloudsMaterial.defines.DEBUG_SHOW_SHADOW_MAP = '1'
    } else {
      delete clouds.cloudsMaterial.defines.DEBUG_SHOW_SHADOW_MAP
    }
    if (debugShowCascades) {
      clouds.cloudsMaterial.defines.DEBUG_SHOW_CASCADES = '1'
    } else {
      delete clouds.cloudsMaterial.defines.DEBUG_SHOW_CASCADES
    }
    clouds.cloudsMaterial.needsUpdate = true
  }, [clouds, debugShowShadowMap, debugShowCascades])

  return (
    <Atmosphere
      ref={atmosphereRef}
      textures='atmosphere'
      correctAltitude={correctAltitude}
      photometric={photometric}
    >
      <Sky />
      <Stars data='atmosphere/stars.bin' />
      <Globe />
      <EffectComposer ref={composerRef} multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify({
            correctGeometricError,
            lensFlare,
            normal,
            depth,
            lut,
            enabled
          })}
        >
          {!normal && !depth && (
            <>
              {enabled && (
                <Clouds
                  ref={setClouds}
                  blueNoiseTexture={blueNoiseTexture}
                  blueNoiseVectorTexture={blueNoiseVectorTexture}
                  coverage={coverage}
                  resolution-scale={0.5}
                  localWeatherVelocity-x={0.00001}
                />
              )}
              <AerialPerspective
                sunIrradiance
                skyIrradiance
                correctGeometricError={correctGeometricError}
                irradianceScale={2 / Math.PI}
              />
            </>
          )}
          {!debugShowShadowMap && (
            <>
              {lensFlare && <LensFlare />}
              {depth && <Depth useTurbo />}
              {normal && <Normal />}
              {!normal && !depth && (
                <>
                  <ToneMapping mode={ToneMappingMode.AGX} />
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
  const [apiKey, setApiKey] = useAtom(googleMapsApiKeyAtom)
  useControls('google maps', {
    apiKey: {
      value: apiKey,
      onChange: value => {
        setApiKey(value)
      }
    }
  })
  return (
    <>
      <Canvas
        gl={{
          antialias: false,
          depth: false,
          stencil: false
        }}
      >
        <Stats />
        <Scene {...props} />
      </Canvas>
      {apiKey === '' && (
        <div
          css={css`
            position: absolute;
            top: 50%;
            left: 50%;
            color: white;
            transform: translate(-50%, -50%);
          `}
        >
          Enter Google Maps API key at the top right of this screen.
        </div>
      )}
    </>
  )
}

export default Story
