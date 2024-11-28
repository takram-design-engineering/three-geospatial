import { Box, Cone, Icosahedron, OrbitControls, Plane } from '@react-three/drei'
import { applyProps, Canvas, useLoader } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, type FC } from 'react'
import { DRACOLoader } from 'three-stdlib'

import { type SSREffect } from '@takram/three-geospatial-effects'
import { EffectComposer, SSR } from '@takram/three-geospatial-effects/r3f'

import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'

const Scene: FC = () => {
  const bunnyGeometry = useLoader(
    DRACOLoader,
    'https://raw.githubusercontent.com/mrdoob/three.js/refs/heads/master/examples/models/draco/bunny.drc',
    loader => {
      loader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
    }
  )
  useEffect(() => {
    bunnyGeometry.computeVertexNormals()
  }, [bunnyGeometry])

  const { enabled, ...ssrParams } = useControls('ssr', {
    enabled: true,
    iterations: { value: 200, min: 0, max: 1000 },
    binarySearchIterations: { value: 4, min: 0, max: 64 },
    pixelZSize: { value: 0.02, min: 0, max: 10, step: 0.01 },
    pixelStride: { value: 1, min: 0, max: 64 },
    pixelStrideZCutoff: { value: 100, min: 0, max: 1000 },
    maxRayDistance: { value: 10, min: 0, max: 1000 },
    screenEdgeFadeStart: { value: 0.75, min: 0, max: 1 },
    eyeFadeStart: { value: 0, min: 0, max: 1 },
    eyeFadeEnd: { value: 1, min: 0, max: 1 },
    jitter: { value: 0, min: 0, max: 1 }
  })

  const ssrRef = useRef<SSREffect | null>(null)
  if (ssrRef.current != null) {
    applyProps(ssrRef.current, ssrParams)
  }

  const effectComposer = useMemo(
    () => (
      <EffectComposer key={Math.random()} multisampling={0}>
        {enabled && <SSR ref={ssrRef} />}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    ),
    [enabled]
  )

  return (
    <>
      <color attach='background' args={[0x443333]} />
      <OrbitControls target={[-0.02, 0.02, 0]} />
      <hemisphereLight args={[0x8d7c7c, 0x494966, 3]} />
      <spotLight
        intensity={8}
        angle={Math.PI / 16}
        penumbra={0.5}
        position={[-1, 1, 1]}
      />
      <Plane args={[8, 8]} position-y={-0.0001} rotation-x={-Math.PI / 2}>
        <meshPhongMaterial color={0xcbcbcb} />
      </Plane>
      <mesh geometry={bunnyGeometry} position-y={-0.0365}>
        <meshStandardMaterial color={0xa5a5a5} />
      </mesh>
      <Box args={[0.05, 0.05, 0.05]} position={[-0.12, 0.025, 0.015]}>
        <meshStandardMaterial color='green' />
      </Box>
      <Icosahedron args={[0.025, 4]} position={[-0.05, 0.025, 0.08]}>
        <meshStandardMaterial color='cyan' />
      </Icosahedron>
      <Cone args={[0.025, 0.05, 64]} position={[-0.05, 0.025, -0.055]}>
        <meshStandardMaterial color='yellow' />
      </Cone>
      {effectComposer}
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false
    }}
    camera={{
      fov: 35,
      position: [-0.2, 0.3, 0.5]
    }}
  >
    <Stats />
    <Scene />
  </Canvas>
)

export default Story
