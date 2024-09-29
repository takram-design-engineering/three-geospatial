import {
  Box,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  Plane,
  ScreenQuad,
  Sphere,
  Torus,
  TorusKnot
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, SMAA, ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import {
  addMilliseconds,
  getDayOfYear,
  parseISO,
  setDayOfYear,
  startOfDay
} from 'date-fns'
import { button, Leva, useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { FC, useRef, useState } from 'react'
import { DoubleSide, Mesh, Object3D, Vector3 } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import {
  Cartographic,
  Ellipsoid,
  isNotFalse,
  LocalFrame,
  radians
} from '@geovanni/core'
import { Depth, Normal, SSAO } from '@geovanni/effects'

import { AerialPerspective } from './AerialPerspective'
import { AerialPerspectiveEffect } from './AerialPerspectiveEffect'
import { Atmosphere, AtmosphereImpl } from './Atmosphere'
import { AtmosphereMaterial } from './AtmosphereMaterial'
import { Tileset } from './Tileset'

interface StoryProps {
  dayOfYear: number
  timeOfDay: number
}

export default {
  title: 'atmosphere/Atmosphere',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta<StoryProps>

const MILLISECONDS_PER_DAY = 3600000

const location = new Cartographic(radians(139.7671), radians(35.6812))
const position = location.toVector()
const up = Ellipsoid.WGS84.geodeticSurfaceNormal(position)

const now = parseISO('2024-09-29T10:00:00+09:00')

const Scene: FC = () => {
  const { normal, depth, aerialPerspective } = useControls('rendering', {
    normal: false,
    depth: false,
    aerialPerspective: true
  })

  const [{ dayOfYear, timeOfDay }, setClock] = useControls('clock', () => ({
    dayOfYear: {
      value: getDayOfYear(now),
      min: 1,
      max: 365,
      step: 1
    },
    timeOfDay: {
      value: (+now - +startOfDay(now)) / MILLISECONDS_PER_DAY,
      min: 0,
      max: 24
    },
    now: button(() => {
      setClock({
        dayOfYear: getDayOfYear(now),
        timeOfDay: (+now - +startOfDay(now)) / MILLISECONDS_PER_DAY
      })
    })
  }))

  const date = addMilliseconds(
    startOfDay(setDayOfYear(now, dayOfYear)),
    timeOfDay * MILLISECONDS_PER_DAY
  )

  const sunDirectionRef = useRef<Vector3>(new Vector3())
  const sunDirection = sunDirectionRef.current

  const atmosphereRef = useRef<AtmosphereImpl>(null)
  const skyRef = useRef<AtmosphereMaterial>(null)
  const aerialPerspectiveRef = useRef<AerialPerspectiveEffect>(null)

  useFrame(() => {
    getSunDirectionECEF(new Date(date), sunDirection)
    if (atmosphereRef.current != null) {
      atmosphereRef.current.material.sunDirection = sunDirection
    }
    if (aerialPerspectiveRef.current != null) {
      aerialPerspectiveRef.current.sunDirection = sunDirection
    }
  })

  const [target, setTarget] = useState<Object3D | null>(null)

  return (
    <>
      <OrbitControls target={position} minDistance={1000} />
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      {/* <Grid
          infiniteGrid
          fadeDistance={1e8}
          cellSize={1e6}
          cellColor='white'
          cellThickness={1}
          sectionThickness={0}
          fadeStrength={10}
          fadeFrom={0}
          side={DoubleSide}
          rotation={[Math.PI / 2, 0, 0]}
        /> */}

      <Atmosphere
        ref={atmosphereRef}
        renderOrder={-1}
        sunDirection={sunDirection}
      />
      <Sphere args={[Ellipsoid.WGS84.minimumRadius, 360, 180]} receiveShadow>
        <meshStandardMaterial color={[0.8, 0.1, 0.1]} />
      </Sphere>
      <object3D ref={setTarget} position={[0, 0, 0]} />
      {/* <directionalLight
          position={sunDirection}
          intensity={5}
          castShadow
          shadow-mapSize={[4096, 4096]}
          target={target ?? undefined}
        >
          <orthographicCamera
            attach='shadow-camera'
            args={[-2500, 2500, 2500, -2500, 1, 5000]}
          />
        </directionalLight> */}
      <LocalFrame location={location}>
        <ambientLight intensity={2} />
        <TorusKnot args={[200, 60, 256, 64]} position={[0, 0, 20]}>
          <meshStandardMaterial color='white' />
        </TorusKnot>
        {/* <Plane
            args={[1e5, 1e5]}
            position={[0, 0, location.height]}
            receiveShadow
          >
            <meshStandardMaterial color='white' />
          </Plane> */}
      </LocalFrame>
      {/* <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13101_chiyoda-ku_2020_bldg_notexture/tileset.json' />
        <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13102_chuo-ku_2020_bldg_notexture/tileset.json' />
        <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13103_minato-ku_2020_bldg_notexture/tileset.json' />
        <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13104_shinjuku-ku_2020_bldg_notexture/tileset.json' />
        <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13113_shibuya-ku_2020_bldg_notexture/tileset.json' /> */}
      <EffectComposer enableNormalPass multisampling={0}>
        {[
          aerialPerspective && (
            <AerialPerspective
              key='aerialPerspective'
              ref={aerialPerspectiveRef}
              sunDirection={sunDirection}
            />
          ),
          <SSAO key='ssao' intensity={2} aoRadius={20} />,
          normal && <Normal key='normal' />,
          depth && <Depth key='depth' useTurbo />,
          !normal && !depth && (
            <ToneMapping key='toneMapping' mode={ToneMappingMode.ACES_FILMIC} />
          ),
          <SMAA />
        ].filter(isNotFalse)}
      </EffectComposer>
    </>
  )
}

export const Basic: StoryFn = () => {
  const { exposure } = useControls('gl', {
    exposure: { value: 10, min: 0, max: 100 }
  })
  return (
    <>
      <Canvas
        shadows
        gl={{
          powerPreference: 'high-performance',
          logarithmicDepthBuffer: true,
          toneMappingExposure: exposure
        }}
        camera={{
          near: 1,
          far: 1e8,
          position,
          up
        }}
      >
        <Scene />
      </Canvas>
      <Leva
        theme={{
          sizes: {
            rootWidth: '380px',
            controlWidth: '260px'
          }
        }}
      />
    </>
  )
}
