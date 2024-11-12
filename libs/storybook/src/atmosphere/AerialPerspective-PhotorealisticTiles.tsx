import { GizmoHelper, GizmoViewport } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import {
  GlobeControls,
  GoogleCloudAuthPlugin,
  TilesRenderer
} from '3d-tiles-renderer'
import { useControls } from 'leva'
import {
  EffectMaterial,
  ToneMappingMode,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import { useEffect, useMemo, useRef, type FC } from 'react'
import { Matrix4, Vector3 } from 'three'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

import {
  TileCompressionPlugin,
  TileCreaseNormalsPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '@geovanni/3d-tiles'
import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  type AerialPerspectiveEffect
} from '@geovanni/atmosphere'
import {
  AerialPerspective,
  Sky,
  Stars,
  type SkyImpl,
  type StarsImpl
} from '@geovanni/atmosphere/react'
import { Ellipsoid, Geodetic, radians } from '@geovanni/core'
import {
  Depth,
  Dithering,
  EffectComposer,
  LensFlare,
  Normal,
  useColorGradingControls
} from '@geovanni/effects/react'

import { Stats } from '../helpers/Stats'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useRendererControls } from '../helpers/useRendererControls'

// Coordinates of Tokyo station.
const location = new Geodetic(radians(139.7671), radians(35.6812))
const position = location.toECEF().multiplyScalar(2000)
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })
  const lut = useColorGradingControls()

  const { lensFlare, normal, depth } = useControls('effects', {
    lensFlare: true,
    depth: false,
    normal: false
  })

  const { osculateEllipsoid, morphToSphere, photometric } = useControls(
    'atmosphere',
    {
      osculateEllipsoid: true,
      morphToSphere: true,
      photometric: true
    }
  )

  const { enable, sun, sky, transmittance, inscatter } = useControls(
    'aerial perspective',
    {
      enable: true,
      sun: true,
      sky: true,
      transmittance: true,
      inscatter: true
    }
  )

  const motionDate = useLocalDateControls()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const rotationMatrixRef = useRef(new Matrix4())
  const skyRef = useRef<SkyImpl>(null)
  const starsRef = useRef<StarsImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    getECIToECEFRotationMatrix(date, rotationMatrixRef.current)
    if (skyRef.current != null) {
      skyRef.current.material.sunDirection.copy(sunDirectionRef.current)
      skyRef.current.material.moonDirection.copy(moonDirectionRef.current)
    }
    if (starsRef.current != null) {
      starsRef.current.material.sunDirection.copy(sunDirectionRef.current)
      starsRef.current.setRotationFromMatrix(rotationMatrixRef.current)
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection.copy(sunDirectionRef.current)
    }
  })

  const { gl, scene, camera } = useThree()

  const tiles = useMemo(() => {
    // @ts-expect-error Missing type
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

  useEffect(() => {
    tiles.setCamera(camera)
  }, [tiles, camera])

  useEffect(() => {
    tiles.setResolutionFromRenderer(camera, gl)
  }, [tiles, camera, gl])

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

  const composerRef = useRef<EffectComposerImpl>(null)

  useFrame(() => {
    tiles.update()
    controls.update()

    const composer = composerRef.current
    if (composer != null) {
      composer.passes.forEach(pass => {
        if (pass.fullscreenMaterial instanceof EffectMaterial) {
          pass.fullscreenMaterial.adoptCameraSettings(camera)
        }
      })
    }
  })

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} ref={composerRef} multisampling={0}>
        {enable && !normal && !depth && (
          <AerialPerspective
            ref={aerialPerspectiveRef}
            osculateEllipsoid={osculateEllipsoid}
            morphToSphere={morphToSphere}
            photometric={photometric}
            sunIrradiance={sun}
            skyIrradiance={sky}
            transmittance={transmittance}
            inscatter={inscatter}
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
      </EffectComposer>
    ),
    [
      osculateEllipsoid,
      morphToSphere,
      photometric,
      enable,
      sun,
      sky,
      transmittance,
      inscatter,
      lensFlare,
      normal,
      depth,
      lut
    ]
  )

  return (
    <>
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <Sky
        ref={skyRef}
        osculateEllipsoid={osculateEllipsoid}
        photometric={photometric}
      />
      <Stars ref={starsRef} osculateEllipsoid={osculateEllipsoid} />
      <primitive object={tiles.group} />
      {effectComposer}
    </>
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
