import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import {
  GoogleCloudAuthPlugin,
  GooglePhotorealisticTilesRenderer
} from '3d-tiles-renderer'
import { GlobeControls } from '3d-tiles-renderer/src/three/controls/GlobeControls'
import { useControls } from 'leva'
import {
  EffectMaterial,
  SMAAPreset,
  ToneMappingMode,
  type EffectComposer as EffectComposerImpl
} from 'postprocessing'
import { useEffect, useMemo, useRef, type FC } from 'react'
import { Mesh, Vector3, type BufferGeometry, type Group } from 'three'
import { DRACOLoader, GLTFLoader } from 'three-stdlib'

import {
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '@geovanni/3d-tiles'
import { getMoonDirectionECEF, getSunDirectionECEF } from '@geovanni/astronomy'
import { isNotFalse } from '@geovanni/core'
import { Depth, EffectComposer, LensFlare, Normal } from '@geovanni/effects'
import { Cartographic, radians } from '@geovanni/math'

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

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

const onLoadModel = ((event: { type: 'load-model'; scene: Group }): void => {
  event.scene.traverse(object => {
    if (object instanceof Mesh) {
      const geometry: BufferGeometry = object.geometry
      geometry.computeVertexNormals()
    }
  })
}) as (event: Object) => void

const Scene: FC = () => {
  const { normal, depth, depthNormal } = useControls('effect', {
    depth: false,
    normal: false,
    depthNormal: false
  })

  const motionDate = useMotionDate()
  const sunDirectionRef = useRef(new Vector3())
  const moonDirectionRef = useRef(new Vector3())
  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    getSunDirectionECEF(new Date(motionDate.get()), sunDirectionRef.current)
    getMoonDirectionECEF(new Date(motionDate.get()), moonDirectionRef.current)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirectionRef.current
      atmosphereRef.current.material.moonDirection = moonDirectionRef.current
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
    tiles.registerPlugin(new TilesFadePlugin())

    const loader = new GLTFLoader(tiles.manager)
    loader.setDRACOLoader(dracoLoader)
    tiles.manager.addHandler(/\.gltf$/, loader)

    return tiles
  }, [])

  useEffect(() => {
    tiles.addEventListener('load-model', onLoadModel)
    return () => {
      tiles.removeEventListener('load-model', onLoadModel)
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
      <EffectComposer
        key={Math.random()}
        ref={composerRef}
        normalPass
        multisampling={0}
      >
        {[
          !normal && !depth && !depthNormal && (
            <AerialPerspective
              key='aerialPerspective'
              ref={aerialPerspectiveRef}
              skyIrradiance={false}
              inputIntensity={0.08}
            />
          ),
          <LensFlare key='lensFlare' />,
          depth && <Depth key='Depth' useTurbo />,
          (normal || depthNormal) && (
            <Normal key='normal' reconstructFromDepth={depthNormal} />
          ),
          !normal && !depth && !depthNormal && (
            <ToneMapping key='toneMapping' mode={ToneMappingMode.AGX} />
          ),
          <SMAA key='smaa' preset={SMAAPreset.ULTRA} />
        ].filter(isNotFalse)}
      </EffectComposer>
    ),
    [normal, depth, depthNormal]
  )

  return (
    <>
      <Atmosphere ref={atmosphereRef} renderOrder={-1} />
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
