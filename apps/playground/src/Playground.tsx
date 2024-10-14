/* eslint-disable @typescript-eslint/no-unused-vars */

import { OrbitControls, Plane } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { parseISO } from 'date-fns'
import { ToneMappingMode } from 'postprocessing'
import { useMemo, type FC } from 'react'
import { Vector3 } from 'three'

import { AerialPerspective, Atmosphere } from '@geovanni/atmosphere'
import { Geodetic, getSunDirectionECEF, radians } from '@geovanni/core'
import { EffectComposer, SSAO } from '@geovanni/effects'
import { LocalTangentFrame } from '@geovanni/react'

import { SunLight } from './components/SunLight'
import { Tileset } from './components/Tileset'

// Derive geoidal height of the above here:
// https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/calc_f.html'
const geoidalHeight = 36.6624

const location = new Geodetic(
  // Coordinates of Tokyo station.
  radians(139.7671),
  radians(35.6812)
)

const geodeticNormal = location.toECEF()
geodeticNormal.normalize()
const localLocation = new Geodetic().copy(location).setHeight(geoidalHeight)
const cameraTarget = localLocation.toECEF()
const cameraPosition = new Vector3()
  .copy(cameraTarget)
  .add(new Vector3().copy(geodeticNormal).multiplyScalar(1000))

const sunDirection = getSunDirectionECEF(parseISO('2024-09-30T10:00:00+09:00'))

export const Container: FC = () => {
  const effects = useMemo(
    () => (
      <>
        <SSAO intensity={3} aoRadius={10} />
        <AerialPerspective sunDirection={sunDirection} sunIrradiance={false} />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </>
    ),
    []
  )
  return (
    <Canvas
      shadows
      gl={{
        antialias: false,
        depth: false,
        stencil: false,
        logarithmicDepthBuffer: true,
        toneMappingExposure: 10
      }}
      camera={{
        near: 1,
        far: 1e8,
        position: cameraPosition,
        up: geodeticNormal
      }}
    >
      <OrbitControls target={cameraTarget} />
      <ambientLight intensity={0.05} />
      <Atmosphere sunDirection={sunDirection} />
      <EffectComposer normalPass>{effects}</EffectComposer>
      <LocalTangentFrame location={localLocation}>
        <SunLight />
        <Plane
          args={[1e5, 1e5]}
          position={[0, 0, location.height]}
          receiveShadow
        >
          <meshStandardMaterial color={[0.05, 0.05, 0.05]} />
        </Plane>
      </LocalTangentFrame>
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13101_chiyoda-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13102_chuo-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13103_minato-ku_2020_bldg_notexture/tileset.json' />
      {/* <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13104_shinjuku-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13113_shibuya-ku_2020_bldg_notexture/tileset.json' /> */}
    </Canvas>
  )
}
