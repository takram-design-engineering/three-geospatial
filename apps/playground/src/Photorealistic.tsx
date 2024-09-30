/* eslint-disable @typescript-eslint/no-unused-vars */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type TilesRenderer } from '3d-tiles-renderer'
import { GlobeControls } from '3d-tiles-renderer/src/three/controls/GlobeControls'
import { parseISO } from 'date-fns'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useState, type FC } from 'react'
import { Vector3 } from 'three'

import { getSunDirectionECEF } from '@geovanni/astronomy'
import { AerialPerspective, Atmosphere } from '@geovanni/atmosphere'
import { Cartographic, radians } from '@geovanni/core'
import { EffectComposer } from '@geovanni/effects'

import { GooglePhotorealisticTiles } from './components/GooglePhotorealisticTiles'

// Derive geoidal height of the above here:
// https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/calc_f.html'
const geoidalHeight = 36.6624

const location = new Cartographic(
  // Coordinates of Tokyo station.
  radians(139.7671),
  radians(35.6812)
)

const geodeticNormal = location.toVector().normalize()
const localLocation = new Cartographic().copy(location).setHeight(geoidalHeight)
const cameraTarget = localLocation.toVector()
const cameraPosition = new Vector3()
  .copy(cameraTarget)
  .add(new Vector3().copy(geodeticNormal).multiplyScalar(2000))

const sunDirection = getSunDirectionECEF(parseISO('2024-09-30T10:00:00+09:00'))

const Controls: FC<{ tiles: TilesRenderer }> = ({ tiles }) => {
  const { gl, scene, camera } = useThree()

  const controls = useMemo(() => {
    const controls = new GlobeControls(scene, camera, gl.domElement, tiles)
    controls.enableDamping = true
    return controls
  }, [scene, camera, gl, tiles])

  useEffect(() => {
    return () => {
      controls.dispose()
    }
  }, [controls])

  useFrame(() => {
    controls.update()
  })
  return null
}

export const Container: FC = () => {
  const effects = useMemo(
    () => (
      <>
        <AerialPerspective
          sunDirection={sunDirection}
          sunIrradiance={false}
          skyIrradiance={false}
          inputIntensity={0.1}
        />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </>
    ),
    []
  )

  const [tiles, setTiles] = useState<TilesRenderer | null>(null)
  return (
    <Canvas
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
      <Atmosphere sunDirection={sunDirection} renderOrder={-1} />
      <EffectComposer normalPass>{effects}</EffectComposer>
      <GooglePhotorealisticTiles
        ref={setTiles}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAP_API_KEY}
      />
      {tiles != null && <Controls tiles={tiles} />}
    </Canvas>
  )
}
