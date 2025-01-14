import { Box, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { Fragment, useEffect, useRef, useState, type FC } from 'react'
import {
  NearestFilter,
  Quaternion,
  RedFormat,
  RepeatWrapping,
  RGBFormat,
  Vector3,
  type Camera
} from 'three'
import { type OrbitControls as OrbitControlsImpl } from 'three-stdlib'

import {
  AerialPerspective,
  Atmosphere,
  Sky,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
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
import {
  STBN_TEXTURE_DEPTH,
  STBN_TEXTURE_SIZE,
  type CloudsEffect
} from '@takram/three-global-clouds'
import { Clouds } from '@takram/three-global-clouds/r3f'

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

  const stbnScalarTexture = useLoader(
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

  const stbnVec2Texture = useLoader(
    createData3DTextureLoaderClass(parseUint8Array, {
      format: RGBFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      wrapS: RepeatWrapping,
      wrapT: RepeatWrapping,
      wrapR: RepeatWrapping,
      width: STBN_TEXTURE_SIZE,
      height: STBN_TEXTURE_SIZE,
      depth: STBN_TEXTURE_DEPTH
    }),
    '/clouds/stbn_vec2.bin'
  )

  const {
    coverage,
    halfResolution,
    temporalUpscaling,
    animate,
    skyIrradianceScale,
    useShapeDetail,
    usePowder
  } = useControls('clouds', {
    coverage: { value: 0.3, min: 0, max: 1, step: 0.01 },
    halfResolution: false,
    temporalUpscaling: true,
    animate: false,
    skyIrradianceScale: { value: 0.3, min: 0, max: 0.5 },
    useShapeDetail: true,
    usePowder: true
  })

  const { maxIterations, minStepSize, maxStepSize, maxRayDistance } =
    useControls('primary raymarch', {
      maxIterations: { value: 500, min: 100, max: 1000 },
      minStepSize: { value: 50, min: 50, max: 200 },
      maxStepSize: { value: 1000, min: 200, max: 2000 },
      maxRayDistance: { value: 1.5e5, min: 1e4, max: 2e5 }
    })

  const {
    showShadowMap: debugShowShadowMap,
    showCascades: debugShowCascades,
    showBox: debugShowBox,
    showUv: debugShowUv
  } = useControls('debug', {
    showShadowMap: false,
    showCascades: false,
    showBox: false,
    showUv: false
  })

  const [clouds, setClouds] = useState<CloudsEffect | null>(null)

  useFrame(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.uniforms.skyIrradianceScale.value = skyIrradianceScale
    clouds.cloudsMaterial.uniforms.maxIterations.value = maxIterations
    clouds.cloudsMaterial.uniforms.minStepSize.value = minStepSize
    clouds.cloudsMaterial.uniforms.maxStepSize.value = maxStepSize
    clouds.cloudsMaterial.uniforms.maxRayDistance.value = maxRayDistance
  })

  useEffect(() => {
    if (clouds == null) {
      return
    }
    clouds.cloudsMaterial.useShapeDetail = useShapeDetail
    clouds.cloudsMaterial.usePowder = usePowder
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
    if (debugShowUv) {
      clouds.cloudsMaterial.defines.DEBUG_SHOW_UV = '1'
    } else {
      delete clouds.cloudsMaterial.defines.DEBUG_SHOW_UV
    }
    clouds.cloudsMaterial.needsUpdate = true
  }, [clouds, debugShowShadowMap, debugShowCascades, debugShowUv])

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
        <Sky />
        <EffectComposer multisampling={0} enableNormalPass>
          <Fragment key={JSON.stringify({ debugShowUv, debugShowShadowMap })}>
            <Clouds
              ref={setClouds}
              stbnScalarTexture={stbnScalarTexture}
              stbnVec2Texture={stbnVec2Texture}
              coverage={coverage}
              temporalUpscaling={temporalUpscaling}
              resolution-scale={halfResolution ? 0.5 : 1}
              localWeatherVelocity-x={animate ? 0.00005 : 0}
            />
            <AerialPerspective sunIrradiance skyIrradiance />
            {!debugShowUv && !debugShowShadowMap && (
              <>
                <LensFlare />
                <ToneMapping mode={ToneMappingMode.AGX} />
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
