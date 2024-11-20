import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { GlobeControls, TilesRenderer } from '3d-tiles-renderer'
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins'
import {
  EffectMaterial,
  ToneMappingMode,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import { Fragment, useEffect, useMemo, useRef, type FC } from 'react'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

import {
  TileCompressionPlugin,
  TileCreaseNormalsPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '@geovanni/3d-tiles'
import {
  AerialPerspective,
  Atmosphere,
  Sky,
  Stars,
  type AtmosphereApi
} from '@geovanni/atmosphere/react'
import { Ellipsoid, Geodetic, radians } from '@geovanni/core'
import {
  Depth,
  Dithering,
  EffectComposer,
  LensFlare,
  Normal
} from '@geovanni/effects/react'

import { Stats } from '../helpers/Stats'
import { useColorGradingControls } from '../helpers/useColorGradingControls'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useRendererControls } from '../helpers/useRendererControls'

const location = new Geodetic(radians(139.7671), radians(35.6812), 4500)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const Globe: FC = () => {
  const tiles = useMemo(() => {
    const tiles = new TilesRenderer()
    tiles.registerPlugin(
      new GoogleCloudAuthPlugin({
        apiToken: import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY
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
  }, [])

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

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })
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
  const motionDate = useLocalDateControls()
  const { osculateEllipsoid, morphToSphere, photometric } = useControls(
    'atmosphere',
    {
      osculateEllipsoid: true,
      morphToSphere: true,
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

  // Effects must know the camera near/far changed by GlobeControls.
  const camera = useThree(({ camera }) => camera)
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
    atmosphereRef.current?.update(new Date(motionDate.get()))
  })

  return (
    <Atmosphere
      ref={atmosphereRef}
      texturesUrl='/'
      osculateEllipsoid={osculateEllipsoid}
      photometric={photometric}
    >
      <Sky />
      <Stars dataUrl='/stars.bin' />
      <Globe />
      <EffectComposer ref={composerRef} multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify({
            enabled,
            sun,
            sky,
            transmittance,
            inscatter,
            morphToSphere,
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
              morphToSphere={morphToSphere}
              albedoScale={0.2}
            />
          )}
          {lensFlare && <LensFlare />}
          {depth && <Depth useTurbo />}
          {normal && <Normal octEncoded />}
          {!normal && !depth && (
            <>
              <ToneMapping mode={ToneMappingMode.AGX} />
              {lut != null && lut}
              <SMAA />
              <Dithering />
            </>
          )}
        </Fragment>
      </EffectComposer>
    </Atmosphere>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false,
      logarithmicDepthBuffer: true
    }}
    camera={{ position, up }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
