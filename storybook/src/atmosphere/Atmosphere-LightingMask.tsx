/// <reference types="vite/types/importMeta.d.ts" />

import { css } from '@emotion/react'
import {
  OrbitControls,
  RenderCubeTexture,
  useGLTF,
  type RenderCubeTextureApi
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import type { StoryFn } from '@storybook/react-vite'
import { TilesPlugin } from '3d-tiles-renderer/r3f'
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FC
} from 'react'
import { Layers, Matrix3, Vector3, type Group } from 'three'

import type { AerialPerspectiveEffect } from '@takram/three-atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  AtmosphereContext,
  LightingMask,
  Sky,
  SkyLight,
  SunLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { Globe } from '../helpers/Globe'
import { GoogleMapsAPIKeyPrompt } from '../helpers/GoogleMapsAPIKeyPrompt'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useGoogleMapsAPIKeyControls } from '../helpers/useGoogleMapsAPIKeyControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'
import { ReorientationPlugin } from '../plugins/ReorientationPlugin'

const geodetic = new Geodetic()
const position = new Vector3()

const vectorScratch = new Vector3()
const rotationScratch1 = new Matrix3()
const rotationScratch2 = new Matrix3()

const LIGHTING_MASK_LAYER = 10
const layers = new Layers()
layers.enable(LIGHTING_MASK_LAYER)

interface ISSProps extends ComponentProps<'group'> {}

const ISS: FC<ISSProps> = ({ ...props }) => {
  const iss = useGLTF('public/iss.glb')
  useEffect(() => {
    Object.values(iss.meshes).forEach(mesh => {
      mesh.layers = layers
      mesh.receiveShadow = true
      mesh.castShadow = true
    })
  }, [iss])

  const { trusses, solarPanels, radiators } = useMemo(() => {
    const scene = iss.scene
    return {
      trusses: [
        scene.getObjectByName('23_S4_Truss'),
        scene.getObjectByName('20_P4_Truss')
      ].filter(value => value != null),
      solarPanels: [
        scene.getObjectByName('23_S4_Truss_01'),
        scene.getObjectByName('23_S4_Truss_02'),
        scene.getObjectByName('32_S6_Truss_01'),
        scene.getObjectByName('32_S6_Truss_02'),
        scene.getObjectByName('20_P4_Truss_01'),
        scene.getObjectByName('20_P4_Truss_02'),
        scene.getObjectByName('08_P6_Truss_01'),
        scene.getObjectByName('08_P6_Truss_02')
      ].filter(value => value != null),
      radiators: [
        scene.getObjectByName('16_S1_Truss_02'),
        scene.getObjectByName('17_P1_Truss_02')
      ].filter(value => value != null)
    }
  }, [iss.scene])

  const { transientStates } = useContext(AtmosphereContext)
  useFrame(() => {
    if (transientStates == null) {
      return
    }
    const ecefToWorld = rotationScratch1
      .setFromMatrix4(transientStates.worldToECEFMatrix)
      .transpose()
    const worldToLocal = rotationScratch2
      .setFromMatrix4(iss.scene.matrixWorld)
      .transpose()
    const sunDirection = vectorScratch
      .copy(transientStates.sunDirection)
      .applyMatrix3(ecefToWorld)
      .normalize()
      .applyMatrix3(worldToLocal)
      .normalize()

    const { x, y, z } = sunDirection
    const trussAngle = Math.atan2(z, y)
    const solarPanelAngle = Math.atan2(
      x,
      y * Math.cos(trussAngle) + z * Math.sin(trussAngle)
    )
    for (const truss of trusses) {
      truss.rotation.x = trussAngle
    }
    for (const solarPanel of solarPanels) {
      solarPanel.rotation.z = -solarPanelAngle
    }

    const sunDirectionXY = vectorScratch.set(x, y, 0).normalize()
    const radiatorAngle = Math.atan2(sunDirectionXY.x, sunDirectionXY.y)
    for (const radiator of radiators) {
      radiator.rotation.z = -radiatorAngle
    }
  })

  return <primitive object={iss.scene} {...props} />
}

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 8 })
  const { longitude, latitude, height } = useLocationControls({
    longitude: -110,
    latitude: 45,
    height: 408000,
    maxHeight: 408000
  })
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 150,
    timeOfDay: 17
  })
  const { correctAltitude } = useControls(
    'atmosphere',
    { correctAltitude: true },
    { collapsed: true }
  )
  const { showMask, invertMask, disableMask } = useControls('lighting mask', {
    showMask: false,
    invertMask: false,
    disableMask: false
  })
  const { useEnvMap } = useControls('rendering', {
    useEnvMap: true
  })

  const [atmosphere, setAtmosphere] = useState<AtmosphereApi | null>(null)
  useEffect(() => {
    if (atmosphere == null) {
      return
    }
    geodetic.set(radians(longitude), radians(latitude), height)
    Ellipsoid.WGS84.getNorthUpEastFrame(
      geodetic.toECEF(position),
      atmosphere.worldToECEFMatrix
    )
  }, [longitude, latitude, height, atmosphere])

  useFrame(() => {
    if (atmosphere != null) {
      atmosphere.updateByDate(new Date(motionDate.get()))
    }
  })

  const envMapParentRef = useRef<Group>(null)
  const [envMap, setEnvMap] = useState<RenderCubeTextureApi | null>(null)
  const scene = useThree(({ scene }) => scene)
  useEffect(() => {
    scene.environment = useEnvMap ? (envMap?.fbo.texture ?? null) : null
  }, [useEnvMap, envMap, scene])

  const effectRef = useRef<AerialPerspectiveEffect>(null)
  useEffect(() => {
    const effect = effectRef.current
    if (effect == null) {
      return
    }
    if (showMask) {
      effect.defines.set('DEBUG_SHOW_LIGHTING_MASK', '1')
    } else {
      effect.defines.delete('DEBUG_SHOW_LIGHTING_MASK')
    }
    ;(effect as any).setChanged()
  }, [showMask])

  const reorientationPluginRef = useRef<ReorientationPlugin>(null)
  useEffect(() => {
    reorientationPluginRef.current?.invalidate()
  }, [longitude, latitude, height])

  return (
    <Atmosphere ref={setAtmosphere} correctAltitude={correctAltitude}>
      <OrbitControls minDistance={20} maxDistance={1e5} />

      {/* Background objects and light sources */}
      <Sky />
      {/* TODO: <Stars data='atmosphere/stars.bin' /> */}
      <SunLight
        distance={80}
        castShadow
        shadow-normalBias={0.1}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach='shadow-camera'
          top={60}
          bottom={-60}
          left={-60}
          right={60}
          near={0}
          far={160}
        />
      </SunLight>
      {/* Sky light must be turned off when using an environment map. */}
      {!useEnvMap && <SkyLight />}

      {/* Quantized mesh terrain */}
      <Globe>
        <TilesPlugin
          ref={reorientationPluginRef}
          plugin={ReorientationPlugin}
          lon={radians(longitude)}
          lat={radians(latitude)}
          height={height}
        />
      </Globe>

      {/* Scene objects in a ENU frame */}
      <group rotation-x={-Math.PI / 2}>
        <ISS rotation-x={Math.PI / 2} rotation-y={Math.PI / 2} />
      </group>

      {/* Off-screen environment map */}
      <group ref={envMapParentRef}>
        <RenderCubeTexture ref={setEnvMap} resolution={64}>
          <Sky
            // Turn off the sun because we already have a sun directional light.
            sun={false}
          />
        </RenderCubeTexture>
      </group>

      {/* Post-processing */}
      {useMemo(
        () => (
          <EffectComposer multisampling={0} enableNormalPass>
            <Fragment key={JSON.stringify([disableMask])}>
              {!disableMask && (
                <LightingMask
                  selectionLayer={LIGHTING_MASK_LAYER}
                  inverted={invertMask}
                />
              )}
              <AerialPerspective ref={effectRef} sunLight skyLight />
              <LensFlare />
              <ToneMapping mode={toneMappingMode} />
              <SMAA />
              <Dithering />
            </Fragment>
          </EffectComposer>
        ),
        [toneMappingMode, invertMask, disableMask]
      )}
    </Atmosphere>
  )
}

const Story: StoryFn = () => {
  useGoogleMapsAPIKeyControls()
  return (
    <>
      <Canvas
        gl={{
          depth: false,
          logarithmicDepthBuffer: true
        }}
        camera={{ position: [80, 30, 100], near: 10, far: 1e7, fov: 40 }}
        shadows
      >
        <Stats />
        <Scene />
      </Canvas>
      <GoogleMapsAPIKeyPrompt />
      <div
        css={css`
          position: absolute;
          bottom: 16px;
          right: 16px;
          color: white;
          font-size: small;
          letter-spacing: 0.025em;
        `}
      >
        Model:{' '}
        <a
          href='https://science.nasa.gov/resource/international-space-station-3d-model/'
          target='_blank'
          rel='noreferrer'
        >
          International Space Station 3D Model
        </a>{' '}
        by{' '}
        <a href='https://www.nasa.gov/' target='_blank' rel='noreferrer'>
          NASA
        </a>
        .
      </div>
    </>
  )
}

export default Story
