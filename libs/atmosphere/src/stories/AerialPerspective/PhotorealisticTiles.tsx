import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import {
  GoogleCloudAuthPlugin,
  GooglePhotorealisticTilesRenderer
} from '3d-tiles-renderer'
import { GlobeControls } from '3d-tiles-renderer/src/three/controls/GlobeControls'
import { parseISO } from 'date-fns'
import { useControls } from 'leva'
import {
  BlendFunction,
  EffectMaterial,
  SMAAPreset,
  ToneMappingMode,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import { useEffect, useMemo, useRef, type FC } from 'react'
import { Vector3 } from 'three'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

import { TileCompressionPlugin, UpdateOnChangePlugin } from '@geovanni/3d-tiles'
import { getSunDirectionECEF } from '@geovanni/astronomy'
import { Cartographic, radians } from '@geovanni/core'
import { Depth, EffectComposer, Normal } from '@geovanni/effects'

import { AerialPerspective } from '../../AerialPerspective'
import { type AerialPerspectiveEffect } from '../../AerialPerspectiveEffect'
import { Atmosphere, type AtmosphereImpl } from '../../Atmosphere'
import { useMotionDate } from '../useMotionDate'

const location = new Cartographic(
  // Coordinates of Tokyo station.
  radians(139.7671),
  radians(35.6812)
)

const surfaceNormal = location.toVector().normalize()
const cameraPosition = location
  .toVector()
  .add(new Vector3().copy(surfaceNormal).multiplyScalar(2000))

const sunDirection = getSunDirectionECEF(parseISO('2024-09-30T10:00:00+09:00'))

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const Scene: FC = () => {
  const { normal, depth, depthNormal } = useControls('effect', {
    depth: false,
    normal: false,
    depthNormal: false
  })

  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    getSunDirectionECEF(new Date(motionDate.get()), sunDirectionRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection = sunDirectionRef.current
    }
  })

  const { gl, scene, camera } = useThree()

  const tiles = useMemo(() => {
    const tiles = new GooglePhotorealisticTilesRenderer()
    tiles.registerPlugin(
      new GoogleCloudAuthPlugin({
        apiToken: import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY
      })
    )
    tiles.registerPlugin(new UpdateOnChangePlugin())
    tiles.registerPlugin(new TileCompressionPlugin())

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
        <AerialPerspective
          ref={aerialPerspectiveRef}
          reconstructNormal
          skyIrradiance={false}
          inputIntensity={0.08}
          blendFunction={
            !normal && !depth && !depthNormal
              ? BlendFunction.NORMAL
              : BlendFunction.SKIP
          }
        />
        <Depth
          useTurbo
          blendFunction={depth ? BlendFunction.NORMAL : BlendFunction.SKIP}
        />
        <Normal
          reconstructFromDepth={depthNormal}
          blendFunction={
            normal || depthNormal ? BlendFunction.NORMAL : BlendFunction.SKIP
          }
        />
        <ToneMapping
          mode={ToneMappingMode.AGX}
          blendFunction={
            !normal && !depth && !depthNormal
              ? BlendFunction.NORMAL
              : BlendFunction.SKIP
          }
        />
        <SMAA preset={SMAAPreset.ULTRA} />
      </EffectComposer>
    ),
    [normal, depth, depthNormal]
  )

  return (
    <>
      <Atmosphere
        ref={atmosphereRef}
        sunDirection={sunDirection}
        renderOrder={-1}
      />
      <primitive object={tiles.group} />
      {effectComposer}
    </>
  )
}

export const PhotorealisticTiles: StoryFn = () => {
  const { exposure } = useControls('gl', {
    exposure: { value: 10, min: 0, max: 100 }
  })
  return (
    <Canvas
      gl={{
        antialias: false,
        depth: false,
        stencil: false,
        logarithmicDepthBuffer: true,
        toneMappingExposure: exposure
      }}
      camera={{ position: cameraPosition, up: surfaceNormal }}
    >
      <Scene />
    </Canvas>
  )
}
