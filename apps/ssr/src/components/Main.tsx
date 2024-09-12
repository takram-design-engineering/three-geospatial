import { Plane } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { type FC, useContext, useMemo, useLayoutEffect, useState } from 'react'
import { EffectComposer, EffectComposerContext } from "@react-three/postprocessing"
import { SSGIEffect, VelocityDepthNormalPass, useControls } from "realism-effects"
import { SSREffect } from "screen-space-reflections"

import { Camera } from './Camera'
import { EastNorthUp } from './EastNorthUp'
import { SunLight } from './SunLight'
import { Tileset } from './Tileset'

export const Main: FC = () => {
  // Coordinates of Tokyo station.
  const longitude = 139.7671
  const latitude = 35.6812

  // Derive geoidal height of the above here:
  // https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/calc_f.html
  const geoidalHeight = 36.6624

  const RealismEffects = () => {
    const { scene, camera, composer } = useContext( EffectComposerContext )
    const velocityDepthNormalPass = useMemo( () => new VelocityDepthNormalPass( scene, camera ), [ scene, camera ] )
    useLayoutEffect( () => {
        composer.addPass( velocityDepthNormalPass )
        return () => {
            composer.removePass( velocityDepthNormalPass )
        }
    }, [ velocityDepthNormalPass, composer ] )
    const ssgiEffect = useMemo( () => new SSGIEffect( scene, camera, velocityDepthNormalPass ), [ scene, camera, velocityDepthNormalPass ] )
    return <primitive object={ ssgiEffect }/>
  }

  const SSR = () => {
    const { scene, camera, composer } = useContext( EffectComposerContext )
    const velocityDepthNormalPass = useMemo( () => new VelocityDepthNormalPass( scene, camera ), [ scene, camera ] )
    useLayoutEffect( () => {
        composer.addPass( velocityDepthNormalPass )
        return () => {
            composer.removePass( velocityDepthNormalPass )
        }
    }, [ velocityDepthNormalPass, composer ] )
    const ssrEffect = new SSREffect(scene, camera)
    return <primitive object={ssrEffect}/>
  }

  

  return (
    <Canvas shadows>
      <ambientLight intensity={0.5} />
      <fogExp2 attach='fog' color='white' density={0.0002} />
      <Camera longitude={longitude} latitude={latitude} height={4000} />
      <EastNorthUp longitude={longitude} latitude={latitude}>
        <SunLight />
        <Plane args={[1e5, 1e5]} position={[0, 0, geoidalHeight]} receiveShadow>
          <meshStandardMaterial color='white' />
        </Plane>
      </EastNorthUp>
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13101_chiyoda-ku_2020_bldg_notexture/tileset.json' />
      <Tileset url='https://plateau.takram.com/data/plateau/13100_tokyo23ku_2020_3Dtiles_etc_1_op/01_building/13102_chuo-ku_2020_bldg_notexture/tileset.json' />
      <EffectComposer>
        <RealismEffects/>
      </EffectComposer>
    </Canvas>
  )
}