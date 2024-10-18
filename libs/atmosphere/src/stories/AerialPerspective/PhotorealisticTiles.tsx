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
  Geodetic,
  getECIToECEFRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  radians
} from '@geovanni/core'
import {
  Depth,
  EffectComposer,
  LensFlare,
  Normal,
  useColorGradingControls
} from '@geovanni/effects'

import { AerialPerspective } from '../../AerialPerspective'
import { type AerialPerspectiveEffect } from '../../AerialPerspectiveEffect'
import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { Stars, type StarsImpl } from '../../Stars'
import { useLocalDateControls } from '../useLocalDateControls'
import { useRendererControls } from '../useRendererControls'

const location = new Geodetic(
  // Coordinates of Tokyo station.
  radians(139.7671),
  radians(35.6812)
)

const surfaceNormal = location.toECEF().normalize()
const cameraPosition = location
  .toECEF()
  .add(new Vector3().copy(surfaceNormal).multiplyScalar(2000))

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

  const { photometric } = useControls('atmosphere', {
    photometric: true
  })

  const { enable, sunIrradiance, skyIrradiance, transmittance, inscatter } =
    useControls('aerial perspective', {
      enable: true,
      sunIrradiance: true,
      skyIrradiance: true,
      transmittance: true,
      inscatter: true
    })

  const motionDate = useLocalDateControls()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const rotationMatrixRef = useRef(new Matrix4())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const starsRef = useRef<StarsImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    const date = new Date(motionDate.get())
    getSunDirectionECEF(date, sunDirectionRef.current)
    getMoonDirectionECEF(date, moonDirectionRef.current)
    getECIToECEFRotationMatrix(date, rotationMatrixRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
      atmosphereRef.current.material.moonDirection = moonDirectionRef.current
    }
    if (starsRef.current != null) {
      starsRef.current.material.sunDirection = sunDirectionRef.current
      starsRef.current.setRotationFromMatrix(rotationMatrixRef.current)
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection = sunDirectionRef.current
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
      <EffectComposer
        key={Math.random()}
        ref={composerRef}
        normalPass
        multisampling={0}
      >
        {enable && !normal && !depth && (
          <AerialPerspective
            ref={aerialPerspectiveRef}
            photometric={photometric}
            sunIrradiance={sunIrradiance}
            skyIrradiance={skyIrradiance}
            transmittance={transmittance}
            inscatter={inscatter}
            inputIntensity={0.25}
          />
        )}
        {lensFlare && <LensFlare />}
        {depth && <Depth useTurbo />}
        {normal && <Normal />}
        {!normal && !depth && (
          <>
            <ToneMapping mode={ToneMappingMode.AGX} />
            {lut != null && lut}
            <SMAA />
          </>
        )}
      </EffectComposer>
    ),
    [
      photometric,
      enable,
      sunIrradiance,
      skyIrradiance,
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
      <Atmosphere ref={atmosphereRef} photometric={photometric} />
      <Stars ref={starsRef} />
      <primitive object={tiles.group} />
      {effectComposer}
    </>
  )
}

export const PhotorealisticTiles: StoryFn = () => {
  return (
    <Canvas
      gl={{
        antialias: false,
        depth: false,
        stencil: false,
        logarithmicDepthBuffer: true
      }}
      camera={{ position: cameraPosition, up: surfaceNormal }}
    >
      <Scene />
    </Canvas>
  )
}
