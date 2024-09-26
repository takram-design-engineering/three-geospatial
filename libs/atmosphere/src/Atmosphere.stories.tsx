import { Ellipsoid } from '@math.gl/geospatial'
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
import { DoubleSide, Vector3 } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import { isNotFalse, LocalFrame } from '@geovanni/core'
import { Depth, Normal } from '@geovanni/effects'

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

const longitude = 139.7671
const latitude = 35.6812
const position = new Vector3().fromArray(
  Ellipsoid.WGS84.cartographicToCartesian([longitude, latitude, 0])
)
const up = new Vector3().fromArray(
  Ellipsoid.WGS84.geodeticSurfaceNormal(position.toArray())
)

export const Basic: StoryFn = () => {
  const { normal, depth } = useControls('rendering', {
    normal: false,
    depth: false
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
        gl={{ logarithmicDepthBuffer: true }}
        camera={{ near: 1, far: 1e8, position, up }}
      >
        <ambientLight intensity={0.1} />
        <directionalLight position={sunDirection} intensity={0.9} />
        <OrbitControls target={position} minDistance={100} />
        <LocalFrame longitude={longitude} latitude={latitude}>
          <Sphere args={[10, 64, 32]} position={[0, 0, 10]}>
            <meshStandardMaterial color='white' />
          </Sphere>
        </LocalFrame>
        <Sphere
          args={[Ellipsoid.WGS84.minimumRadius, 360, 180]}
          renderOrder={-2}
        >
          <meshBasicMaterial color='black' />
        </Sphere>
        <Atmosphere sunDirection={sunDirection} renderOrder={-1} />
        <EffectComposer enableNormalPass>
          {[
            normal && <Normal key='normal' />,
            depth && <Depth key='depth' useTurbo />,
            !normal && !depth && (
              <ToneMapping
                key='tone-mapping'
                mode={ToneMappingMode.ACES_FILMIC}
              />
            )
          ].filter(isNotFalse)}
        </EffectComposer>
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
        <GizmoHelper alignment='top-left' renderPriority={2}>
          <GizmoViewport />
        </GizmoHelper>
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
