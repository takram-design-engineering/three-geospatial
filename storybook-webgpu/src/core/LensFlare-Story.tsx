import { Environment, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Suspense, type FC } from 'react'
import { bool, pass, toneMapping, uniform } from 'three/tsl'
import { RenderPipeline, type Node, type Renderer } from 'three/webgpu'

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
import { AgXPunchyToneMapping } from '../helpers/AgxToneMapping'
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const passNode = useResource(
    () => pass(scene, camera, { samples: 0 }),
    [scene, camera]
  )

  const colorNode = passNode.getTextureNode('output')

  const lensFlareNode = useResource(() => lensFlare(colorNode), [colorNode])

  const toneMappingNode = useResource(
    () => toneMapping(AgXPunchyToneMapping, uniform(0), lensFlareNode),
    [lensFlareNode]
  )

  const debugLensFlare = useControl(
    ({ enable, debug }: StoryArgs) => enable && debug
  )

  const renderPipeline = useResource(() => {
    let outputNode: Node = toneMappingNode.add(dithering)

    // Useless conditional to keep the main path in the graph:
    if (debugLensFlare) {
      outputNode = bool(true).select(
        lensFlareNode.getDebugInternalTexturesNode(),
        outputNode
      ) // uniformFlow intentionally omitted
    }

    return new RenderPipeline(renderer, outputNode)
  }, [renderer, lensFlareNode, toneMappingNode, debugLensFlare])

  useTransientControl(
    ({ enable }: StoryArgs) => enable,
    value => {
      toneMappingNode.colorNode = value ? lensFlareNode : colorNode
      renderPipeline.needsUpdate = true
    }
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
      renderPipeline.needsUpdate = true
    }
  )

  useGuardedFrame(() => {
    renderPipeline.render()
  }, 1)

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    renderPipeline.needsUpdate = true
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
  enable: boolean
  debug: boolean
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
  enable: true,
  bloomIntensity: 0.3,
  glareIntensity: 1,
  ghostIntensity: 0.005,
  haloIntensity: 0.005,
  debug: false,
  wireframe: false,
  ...toneMappingArgs({
    toneMappingExposure: 1
  }),
  ...rendererArgs()
}

Story.argTypes = {
  enable: {
    control: {
      type: 'boolean'
    }
  },
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
  debug: {
    control: {
      type: 'boolean'
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
