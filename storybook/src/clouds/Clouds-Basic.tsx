import { Box, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { Fragment, useEffect, useRef, useState, type FC } from 'react'
import {
  NearestFilter,
  Quaternion,
  RepeatWrapping,
  RGBAFormat,
  Vector3,
  type Camera
} from 'three'
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import {
  AerialPerspective,
  Atmosphere,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import {
  STBN_TEXTURE_DEPTH,
  STBN_TEXTURE_HEIGHT,
  STBN_TEXTURE_WIDTH,
  type CloudsEffect
} from '@takram/three-clouds'
import { Clouds } from '@takram/three-clouds/r3f'
import {
  createData3DTextureLoaderClass,
  Ellipsoid,
  Geodetic,
  parseUint8Array,
  radians,
  type GeodeticLike
} from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'
import { EastNorthUpFrame } from '@takram/three-geospatial/r3f'

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useExposureControls } from '../helpers/useExposureControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'

const geodetic = new Geodetic()
const position = new Vector3()
const up = new Vector3()
const offset = new Vector3()
const rotation = new Quaternion()

function applyLocation(
  camera: Camera,
  controls: OrbitControlsImpl,
  { longitude, latitude, height }: GeodeticLike
): void {
  geodetic.set(radians(longitude), radians(latitude), height)
  geodetic.toECEF(position)
  Ellipsoid.WGS84.getSurfaceNormal(position, up)

  rotation.setFromUnitVectors(camera.up, up)
  offset.copy(camera.position).sub(controls.target)
  offset.applyQuaternion(rotation)
  camera.up.copy(up)
  camera.position.copy(position).add(offset)
  controls.target.copy(position)
}

const Scene: FC = () => {
  useExposureControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls(
    {
      longitude: 30,
      height: 300
    },
    { collapsed: true }
  )
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0
  })
  const { correctAltitude, photometric } = useControls(
    'atmosphere',
    {
      correctAltitude: true,
      photometric: true
    },
    { collapsed: true }
  )

  const camera = useThree(({ camera }) => camera)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  useEffect(() => {
    const controls = controlsRef.current
    if (controls != null) {
      applyLocation(camera, controls, {
        longitude,
        latitude,
        height
      })
    }
  }, [longitude, latitude, height, camera])

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    atmosphereRef.current?.updateByDate(new Date(motionDate.get()))
  })

  const stbnTexture = useLoader(
    createData3DTextureLoaderClass(parseUint8Array, {
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      width: STBN_TEXTURE_WIDTH,
      height: STBN_TEXTURE_HEIGHT,
      depth: STBN_TEXTURE_DEPTH
    }),
    '/clouds/stbn.bin'
  )

  const { enabled, coverage, animate, shapeDetail, shadowLength } = useControls(
    'clouds',
    {
      enabled: true,
      coverage: { value: 0.35, min: 0, max: 1, step: 0.01 },
      animate: false,
      shapeDetail: true,
      shadowLength: true
    }
  )

  const { temporalUpscaling, halfResolution, shadowMapSize } = useControls(
    'rendering',
    {
      temporalUpscaling: true,
      halfResolution: false,
      shadowMapSize: { value: 512, options: [256, 512, 1024] }
    }
  )

  const scatteringParams = useControls(
    'scattering',
    {
      albedo: { value: 0.98, min: 0, max: 1 },
      powderScale: { value: 0.8, min: 0.5, max: 1 },
      powderExponent: { value: 200, min: 1, max: 1000 },
      scatterAnisotropy1: { value: 0.7, min: 0, max: 1 },
      scatterAnisotropy2: { value: -0.2, min: -1, max: 0 },
      scatterAnisotropyMix: { value: 0.5, min: 0, max: 1 },
      skyIrradianceScale: { value: 0.95, min: 0, max: 1 },
      groundIrradianceScale: { value: 0.5, min: 0, max: 1 },
      shadowExtension: { value: 3, min: 1, max: 10 },
    },
    { collapsed: true }
  )

  const cloudsRaymarchParams = useControls(
    'clouds raymarch',
    {
      maxIterations: { value: 500, min: 100, max: 1000 },
      minStepSize: { value: 50, min: 50, max: 200 },
      maxStepSize: { value: 1000, min: 200, max: 2000 }
    },
    { collapsed: true }
  )

  const shadowRaymarchParams = useControls(
    'shadow raymarch',
    {
      maxIterations: { value: 50, min: 10, max: 100 },
      minStepSize: { value: 100, min: 50, max: 200 },
      maxStepSize: { value: 1000, min: 200, max: 2000 }
    },
    { collapsed: true }
  )

  const {
    showShadowMap: debugShowShadowMap,
    showCascades: debugShowCascades,
    showBox: debugShowBox,
    showUv: debugShowUv,
    showShadowLength: debugShowShadowLength,
    showVelocity: debugShowVelocity
  } = useControls(
    'debug',
    {
      showShadowMap: false,
      showCascades: false,
      showBox: false,
      showUv: false,
      showShadowLength: false,
      showVelocity: false
    },
    { collapsed: true }
  )

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)

  useFrame(() => {
    if (clouds == null) {
      return
    }
    const { albedo, ...scalarScatteringParams } = scatteringParams
    clouds.cloudsMaterial.uniforms.albedo.value.setScalar(albedo)
    for (const key in scalarScatteringParams) {
      clouds.cloudsMaterial.uniforms[key].value =
        scalarScatteringParams[key as keyof typeof scalarScatteringParams]
    }
    for (const key in cloudsRaymarchParams) {
      clouds.cloudsMaterial.uniforms[key].value =
        cloudsRaymarchParams[key as keyof typeof cloudsRaymarchParams]
    }
    for (const key in shadowRaymarchParams) {
      clouds.shadowMaterial.uniforms[key].value =
        shadowRaymarchParams[key as keyof typeof shadowRaymarchParams]
    }
  })

  useEffect(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.useShapeDetail = shapeDetail
  }, [clouds, shapeDetail])

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
    if (debugShowUv) {
      clouds.cloudsMaterial.defines.DEBUG_SHOW_UV = '1'
    } else {
      delete clouds.cloudsMaterial.defines.DEBUG_SHOW_UV
    }
    if (debugShowShadowLength) {
      clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH = '1'
    } else {
      delete clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_SHADOW_LENGTH
    }
    if (debugShowVelocity) {
      clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_VELOCITY = '1'
    } else {
      delete clouds.cloudsResolveMaterial.defines.DEBUG_SHOW_VELOCITY
    }
    clouds.cloudsMaterial.needsUpdate = true
    clouds.cloudsResolveMaterial.needsUpdate = true
  }, [
    clouds,
    debugShowShadowMap,
    debugShowCascades,
    debugShowUv,
    debugShowShadowLength,
    debugShowVelocity
  ])

  return (
    <>
      <OrbitControls ref={controlsRef} minDistance={1000} />
      {debugShowBox && (
        <EastNorthUpFrame
          longitude={radians(longitude)}
          latitude={radians(latitude)}
        >
          <Box
            args={[2e3, 2e3, 2e3]}
            position={[1e3, -2e3, 1e3]}
            rotation={[Math.PI / 4, Math.PI / 4, 0]}
          >
            <meshBasicMaterial color='white' />
          </Box>
        </EastNorthUpFrame>
      )}
      <Atmosphere
        ref={atmosphereRef}
        textures='atmosphere'
        correctAltitude={correctAltitude}
        photometric={photometric}
      >
        <EffectComposer multisampling={0} enableNormalPass>
          <Fragment
            key={JSON.stringify({
              enabled,
              debugShowUv,
              debugShowShadowMap
            })}
          >
            {enabled && (
              <Clouds
                ref={setClouds}
                stbnTexture={stbnTexture}
                coverage={coverage}
                temporalUpscaling={temporalUpscaling}
                resolution-scale={halfResolution ? 0.5 : 1}
                localWeatherVelocity={animate ? [0.00005, 0] : [0, 0]}
                shadow-mapSize={[shadowMapSize, shadowMapSize]}
                shadow-maxFar={1e5}
                shadowLength={shadowLength}
              />
            )}
            <AerialPerspective sky sunIrradiance skyIrradiance />
            {!debugShowUv && !debugShowShadowMap && !debugShowShadowLength && (
              <>
                <LensFlare />
                <ToneMapping mode={ToneMappingMode.AGX} />
                <SMAA />
                <Dithering />
              </>
            )}
          </Fragment>
        </EffectComposer>
      </Atmosphere>
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false
    }}
    camera={{ near: 1, far: 4e5 }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
