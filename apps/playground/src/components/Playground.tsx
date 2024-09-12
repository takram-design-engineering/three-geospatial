/* eslint-disable @typescript-eslint/no-unused-vars */

import { Plane } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO } from '@react-three/postprocessing'
import {
  KernelSize,
  ToneMappingEffect,
  ToneMappingMode,
  type Effect
} from 'postprocessing'
import { forwardRef, useMemo, type FC } from 'react'

import { Camera } from './Camera'
import { ENUFrame } from './ENUFrame'
import { GooglePhotorealisticTiles } from './GooglePhotorealisticTiles'
import { SunLight } from './SunLight'
import { Tileset } from './Tileset'

export const ToneMapping = forwardRef<Effect, {}>((props, ref) => {
  const effect = useMemo(
    () =>
      new ToneMappingEffect({
        mode: ToneMappingMode.ACES_FILMIC,
        adaptive: true
      }),
    []
  )
  return <primitive ref={ref} object={effect} dispose={null} />
})

export const Playground: FC = () => {
  // Coordinates of Tokyo station.
  const longitude = 139.7671
  const latitude = 35.6812

  // Derive geoidal height of the above here:
  // https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/calc_f.html
  const geoidalHeight = 36.6624

  return (
    <Canvas shadows gl={{ antialias: false }}>
      <color attach='background' args={['#ffffff']} />
      <ambientLight intensity={0.5} />
      <fogExp2 attach='fog' color='white' density={0.0002} />
      <Camera longitude={longitude} latitude={latitude} height={4000} />
      <EffectComposer>
        <N8AO />
        <Bloom kernelSize={KernelSize.HUGE} />
        <ToneMapping />
      </EffectComposer>
      <ENUFrame longitude={longitude} latitude={latitude}>
        <SunLight />
        <Plane args={[1e5, 1e5]} position={[0, 0, geoidalHeight]} receiveShadow>
          <meshStandardMaterial color='white' />
        </Plane>
      </ENUFrame>
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13101_chiyoda-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13102_chuo-ku_2020_bldg_notexture/tileset.json' />
    </Canvas>
  )
}

// export const Playground: FC = () => {
//   // Coordinates of Tokyo station.
//   const longitude = 139.7671
//   const latitude = 35.6812

//   return (
//     <Canvas shadows>
//       <color attach='background' args={['#ffffff']} />
//       <ambientLight intensity={0.5} />
//       <fogExp2 attach='fog' color='white' density={0.00005} />
//       <Camera longitude={longitude} latitude={latitude} height={4000} />
//       <EffectComposer>
//         <N8AO />
//         <Bloom kernelSize={KernelSize.HUGE} />
//         <ToneMapping />
//       </EffectComposer>
//       <ENUFrame longitude={longitude} latitude={latitude}>
//         <SunLight />
//       </ENUFrame>
//       <GooglePhotorealisticTiles />
//     </Canvas>
//   )
// }
