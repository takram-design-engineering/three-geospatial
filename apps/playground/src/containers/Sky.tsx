/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  Plane,
  Sphere
} from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import {
  addMilliseconds,
  getDayOfYear,
  setDayOfYear,
  startOfDay
} from 'date-fns'
import { button, useControls } from 'leva'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, type FC } from 'react'
import { DoubleSide } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import { Atmosphere } from '@geovanni/atmosphere'
import { Depth, Normal } from '@geovanni/effects'

import { Camera } from '../components/Camera'
import { ENUFrame } from '../components/ENUFrame'
import { SunLight } from '../components/SunLight'

const longitude = 139.7671
const latitude = 35.6812

const Scene: FC = () => {
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
      value: (Date.now() - +startOfDay(Date.now())) / 3600000,
      min: 0,
      max: 24
    },
    now: button(() => {
      setClock({
        dayOfYear: getDayOfYear(new Date()),
        timeOfDay: (Date.now() - +startOfDay(Date.now())) / 3600000
      })
    })
  }))

  const date = addMilliseconds(
    startOfDay(setDayOfYear(new Date(), dayOfYear)),
    timeOfDay * 3600000
  )
  const sunDirection = getSunDirectionECEF(date)

  return (
    <>
      <Camera longitude={longitude} latitude={latitude} height={4000} />
      <Suspense>
        <Atmosphere sunDirection={sunDirection} />
      </Suspense>
      <ENUFrame longitude={longitude} latitude={latitude}>
        <SunLight />
        <Sphere args={[100]}>
          <meshStandardMaterial color='white' />
        </Sphere>
        <Plane args={[1e5, 1e5]} position={[0, 0, 0]} receiveShadow>
          <meshStandardMaterial color='white' transparent opacity={0} />
        </Plane>
      </ENUFrame>
      <EffectComposer enableNormalPass>
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <>{normal && <Normal />}</>
        <>{depth && <Depth useTurbo />}</>
      </EffectComposer>
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
    </>
  )
}

export const Container: FC = () => {
  return (
    <Canvas id='canvas'>
      <Scene />
    </Canvas>
  )
}
