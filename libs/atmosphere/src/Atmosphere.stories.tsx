import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  Sphere
} from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { type Meta, type StoryFn } from '@storybook/react'
import {
  addMilliseconds,
  getDayOfYear,
  setDayOfYear,
  startOfDay
} from 'date-fns'
import { button, Leva, useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { DoubleSide } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import {
  Cartographic,
  Ellipsoid,
  isNotFalse,
  LocalFrame,
  radians
} from '@geovanni/core'
import { Depth, Normal } from '@geovanni/effects'

import { AerialPerspective } from './AerialPerspective'
import { Atmosphere } from './Atmosphere'

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

export const Basic: StoryFn = () => {
  const { normal, depth, exposure } = useControls('rendering', {
    normal: false,
    depth: false,
    exposure: { value: 10, min: 0, max: 50 }
  })

  const [{ dayOfYear, timeOfDay }, setClock] = useControls('clock', () => ({
    dayOfYear: {
      value: getDayOfYear(new Date()),
      min: 1,
      max: 365,
      step: 1
    },
    timeOfDay: {
      value: (Date.now() - +startOfDay(Date.now())) / MILLISECONDS_PER_DAY,
      min: 0,
      max: 24
    },
    now: button(() => {
      setClock({
        dayOfYear: getDayOfYear(new Date()),
        timeOfDay: (Date.now() - +startOfDay(Date.now())) / MILLISECONDS_PER_DAY
      })
    })
  }))

  const date = addMilliseconds(
    startOfDay(setDayOfYear(new Date(), dayOfYear)),
    timeOfDay * MILLISECONDS_PER_DAY
  )
  const sunDirection = getSunDirectionECEF(date)

  return (
    <>
      <Canvas
        gl={{
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
        <OrbitControls target={position} minDistance={100} />
        <GizmoHelper alignment='top-left' renderPriority={2}>
          <GizmoViewport />
        </GizmoHelper>
        <Grid
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
        />
        <Atmosphere sunDirection={sunDirection} renderOrder={-1} />
        <Sphere
          args={[Ellipsoid.WGS84.minimumRadius, 360, 180]}
          renderOrder={-2}
        >
          <meshBasicMaterial color='black' />
        </Sphere>
        <ambientLight intensity={0.02} />
        <directionalLight position={sunDirection} intensity={0.4} />
        <LocalFrame location={location}>
          <Sphere args={[10, 64, 32]} position={[0, 0, 10]}>
            <meshStandardMaterial color='white' />
          </Sphere>
        </LocalFrame>
        <EffectComposer enableNormalPass>
          {[
            <AerialPerspective key='aerialPerspective' />,
            normal && <Normal key='normal' />,
            depth && <Depth key='depth' useTurbo />,
            !normal && !depth && (
              <ToneMapping
                key='toneMapping'
                mode={ToneMappingMode.ACES_FILMIC}
              />
            )
          ].filter(isNotFalse)}
        </EffectComposer>
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
