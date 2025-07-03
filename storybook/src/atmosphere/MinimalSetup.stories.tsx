import { Canvas } from '@react-three/fiber'
import { EffectComposer, ToneMapping } from '@react-three/postprocessing'
import type { Meta, StoryFn } from '@storybook/react-vite'
import { ToneMappingMode } from 'postprocessing'

import { AerialPerspective, Atmosphere } from '@takram/three-atmosphere/r3f'
import { LensFlare } from '@takram/three-geospatial-effects/r3f'

export default {
  title: 'atmosphere/Minimal Setup',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const MinimalSetup: StoryFn = () => (
  <Canvas
    gl={{
      depth: false,
      toneMappingExposure: 10
    }}
    camera={{
      // See the Sky/Basic story for deriving ECEF coordinates and rotation.
      position: [5232062.795055689, -2.8678862431699113, 3639017.417296496],
      rotation: [0.7072729447236096, -0.48911705050206433, -1.1888907679219152]
    }}
  >
    <Atmosphere date={Date.parse('2025-01-01T09:00:00Z')}>
      <EffectComposer multisampling={0} enableNormalPass>
        <AerialPerspective sky sunLight skyLight />
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.AGX} />
      </EffectComposer>
    </Atmosphere>
  </Canvas>
)
