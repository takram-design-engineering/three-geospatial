import { css } from '@emotion/react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { GlobeControls, TilesRenderer } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins'
import {
  EffectMaterial,
  ToneMappingMode,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FC
} from 'react'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

import {
  TileCompressionPlugin,
  TileCreaseNormalsPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '@takram/three-3d-tiles-support'
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
  EffectComposer,
  LensFlare,
  Normal
} from '@takram/three-geospatial-effects/r3f'

import { HaldLUT } from '../helpers/HaldLUT'
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

const Globe: FC<{ apiKey: string }> = ({ apiKey }) => {
  const tiles = useMemo(() => {
    const tiles = new TilesRenderer()
    tiles.registerPlugin(
      new GoogleCloudAuthPlugin({
        apiToken: apiKey
      })
    )
    tiles.registerPlugin(new UpdateOnChangePlugin())
    tiles.registerPlugin(new TileCompressionPlugin())
    tiles.registerPlugin(
      new TileCreaseNormalsPlugin({
        creaseAngle: radians(30)
      })
    )
    tiles.registerPlugin(new TilesFadePlugin())

    const loader = new GLTFLoader(tiles.manager)
    loader.setDRACOLoader(dracoLoader)
    tiles.manager.addHandler(/\.gltf$/, loader)

    return tiles
  }, [apiKey])

  useEffect(() => {
    return () => {
      tiles.dispose()
    }
  }, [tiles])

  const camera = useThree(({ camera }) => camera)
  useEffect(() => {
    tiles.setCamera(camera)
  }, [tiles, camera])

  const gl = useThree(({ gl }) => gl)
  useEffect(() => {
    tiles.setResolutionFromRenderer(camera, gl)
  }, [tiles, camera, gl])

  const scene = useThree(({ scene }) => scene)
  const controls = useMemo(() => {
    const controls = new GlobeControls(scene, camera, gl.domElement, tiles)
    controls.enableDamping = true
    return controls
  }, [scene, camera, gl, tiles])

  useEffect(() => {
    return () => {
      controls.dispose()
    }
  }, [controls])

  useFrame(() => {
    tiles.update()
    controls.update()
  })

  return <primitive object={tiles.group} />
}

interface SceneProps extends LocalDateControlsParams {
  exposure?: number
  longitude?: number
  latitude?: number
  heading?: number
  pitch?: number
  distance?: number
}

const Scene: FC<SceneProps & { apiKey: string }> = ({
  apiKey,
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
    }
  )
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

  const camera = useThree(({ camera }) => camera)
  useLayoutEffect(() => {
    new PointOfView(
      new Geodetic(radians(longitude), radians(latitude)).toECEF(),
      radians(heading),
      radians(pitch),
      distance
    ).decompose(camera.position, camera.quaternion)
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

  return (
    <Atmosphere
      ref={atmosphereRef}
      textures='/'
      correctAltitude={correctAltitude}
      photometric={photometric}
    >
      <Sky renderTargetCount={2} />
      <Stars data='/stars.bin' renderTargetCount={2} />
      <Globe apiKey={apiKey} />
      <EffectComposer ref={composerRef} multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify({
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
          })}
        >
          {enabled && !normal && !depth && (
            <AerialPerspective
              sunIrradiance={sun}
              skyIrradiance={sky}
              transmittance={transmittance}
              inscatter={inscatter}
              correctGeometricError={correctGeometricError}
              irradianceScale={2 / Math.PI}
            />
          )}
          {lensFlare && <LensFlare />}
          {depth && <Depth useTurbo />}
          {normal && <Normal octEncoded />}
          {!normal && !depth && (
            <>
              <ToneMapping mode={ToneMappingMode.AGX} />
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
  const { apiKey } = useControls('google maps', {
    apiKey: {
      value: import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY
    }
  })
  return (
    <>
      <Canvas
        gl={{
          antialias: false,
          depth: false,
          stencil: false,
          logarithmicDepthBuffer: true
        }}
      >
        <Stats />
        <Scene {...props} apiKey={apiKey} />
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
