import { Environment, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, type FC } from 'react'
import { AgXToneMapping } from 'three'
import { pass, toneMapping, uniform } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import { dithering, lensFlare } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const [postProcessing, lensFlareNode, toneMappingNode] = useResource(
    manage => {
      const passNode = manage(pass(scene, camera))
      const colorNode = passNode.getTextureNode('output')
      const lensFlareNode = manage(lensFlare(colorNode))
      const toneMappingNode = manage(
        toneMapping(AgXToneMapping, uniform(0), lensFlareNode)
      )
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = toneMappingNode.add(dithering)

      return [postProcessing, lensFlareNode, toneMappingNode]
    },
    [renderer, scene, camera]
  )

  useTransientControl(
    ({
      bloomIntensity,
      glareIntensity,
      ghostIntensity,
      haloIntensity
    }: StoryArgs) => ({
      bloomIntensity,
      glareIntensity,
      ghostIntensity,
      haloIntensity
    }),
    ({ bloomIntensity, glareIntensity, ghostIntensity, haloIntensity }) => {
      lensFlareNode.bloomIntensity.value = bloomIntensity
      lensFlareNode.glareNode.intensity.value = glareIntensity * 1e-4
      lensFlareNode.ghostNode.intensity.value = ghostIntensity
      lensFlareNode.haloNode.intensity.value = haloIntensity
    }
  )

  useTransientControl(
    ({ wireframe }: StoryArgs) => wireframe,
    wireframe => {
      lensFlareNode.glareNode.wireframe = wireframe
      postProcessing.needsUpdate = true
    }
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    postProcessing.needsUpdate = true
  })

  return (
    <>
      <OrbitControls />
      <Suspense>
        <Environment files='public/hdri/wooden_lounge_4k.hdr' background />
      </Suspense>
    </>
  )
}

interface StoryProps {}

interface StoryArgs extends ToneMappingArgs {
  bloomIntensity: number
  glareIntensity: number
  ghostIntensity: number
  haloIntensity: number
  wireframe: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Content {...props} />
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  bloomIntensity: 0.3,
  glareIntensity: 1,
  ghostIntensity: 0.005,
  haloIntensity: 0.005,
  wireframe: false,
  ...toneMappingArgs({
    toneMappingExposure: 1
  }),
  ...rendererArgs()
}

Story.argTypes = {
  bloomIntensity: {
    control: {
      type: 'range',
      min: 0,
      max: 2,
      step: 0.01
    }
  },
  glareIntensity: {
    name: 'glare intensity × 1e-4',
    control: {
      type: 'range',
      min: 0,
      max: 5,
      step: 0.01
    }
  },
  ghostIntensity: {
    control: {
      type: 'range',
      min: 0,
      max: 0.1,
      step: 0.001
    }
  },
  haloIntensity: {
    control: {
      type: 'range',
      min: 0,
      max: 0.1,
      step: 0.001
    }
  },
  wireframe: {
    control: {
      type: 'boolean'
    }
  },
  ...toneMappingArgTypes(),
  ...rendererArgTypes()
}

export default Story
