/* eslint-disable @typescript-eslint/no-unused-vars */

import { Plane } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { KernelSize, ToneMappingMode } from 'postprocessing'
import { type FC } from 'react'

import { Cartographic, LocalFrame, radians } from '@geovanni/core'
import { SSAO } from '@geovanni/effects'

import { Camera } from './components/Camera'
import { GooglePhotorealisticTiles } from './components/GooglePhotorealisticTiles'
import { SunLight } from './components/SunLight'
import { Tileset } from './components/Tileset'

const location = new Cartographic(
  // Coordinates of Tokyo station.
  radians(139.7671),
  radians(35.6812),
  // Derive geoidal height of the above here:
  // https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/calc_f.html'
  36.6624
)

export const Container: FC = () => {
  // Coordinates of Tokyo station.
  const longitude = 139.7671
  const latitude = 35.6812

  // Derive geoidal height of the above here:
  // https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/calc_f.html
  const geoidalHeight = 36.6624

  return (
    <Canvas shadows>
      <color attach='background' args={['#ffffff']} />
      <ambientLight intensity={0.5} />
      <fogExp2 attach='fog' color='white' density={0.0002} />
      <Camera location={new Cartographic().copy(location).setHeight(4000)} />
      <EffectComposer>
        <SSAO />
        <Bloom kernelSize={KernelSize.HUGE} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
      <LocalFrame location={new Cartographic().copy(location).setHeight(0)}>
        <SunLight />
        <Plane
          args={[1e5, 1e5]}
          position={[0, 0, location.height]}
          receiveShadow
        >
          <meshStandardMaterial color='white' />
        </Plane>
      </LocalFrame>
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13101_chiyoda-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13102_chuo-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13103_minato-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13104_shinjuku-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13113_shibuya-ku_2020_bldg_notexture/tileset.json' />
    </Canvas>
  )
}

// export const Container: FC = () => {
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
//         <SSAO />
//         <Bloom kernelSize={KernelSize.HUGE} />
//         <ToneMapping />
//       </EffectComposer>
//       <LocalFrame longitude={longitude} latitude={latitude}>
//         <SunLight />
//       </LocalFrame>
//       <GooglePhotorealisticTiles
//         apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY}
//       />
//     </Canvas>
//   )
// }
