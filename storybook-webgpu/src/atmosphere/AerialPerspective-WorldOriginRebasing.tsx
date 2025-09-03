import { OrbitControls, Sphere } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { FC } from 'react'
import { AgXToneMapping } from 'three'
import {
  diffuseColor,
  mrt,
  normalView,
  pass,
  toneMapping,
  uniform
} from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereContext
} from '@takram/three-atmosphere/webgpu'
import {
  dither,
  highpVelocity,
  isWebGPU,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControls,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  locationArgs,
  locationArgTypes,
  useLocationControls,
  type LocationArgs
} from '../controls/locationControls'
import {
  outputPassArgs,
  outputPassArgTypes,
  useOutputPassControls,
  type OutputPassArgs
} from '../controls/outputPassControls'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { useGuardedFrame } from '../helpers/useGuardedFrame'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const context = useResource(() => atmosphereContext(renderer), [renderer])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, toneMappingNode] = useResource(
    manage => {
      const passNode = pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output: diffuseColor,
          normal: normalView,
          velocity: highpVelocity
        })
      )
      const outputNode = passNode.getTextureNode('output')
      const depthNode = passNode.getTextureNode('depth')
      const normalNode = passNode.getTextureNode('normal')
      const velocityNode = passNode.getTextureNode('velocity')

      const aerialNode = aerialPerspective(
        context,
        outputNode,
        depthNode,
        normalNode
      )
      const lensFlareNode = lensFlare(aerialNode)
      const toneMappingNode = toneMapping(
        AgXToneMapping,
        uniform(0),
        lensFlareNode
      )
      const taaNode = isWebGPU(renderer)
        ? temporalAntialias(highpVelocity)(
            toneMappingNode,
            depthNode,
            velocityNode,
            camera
          )
        : toneMappingNode
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode.add(dither())

      manage(aerialNode, lensFlareNode, taaNode)
      return [postProcessing, passNode, toneMappingNode]
    },
    [renderer, scene, camera, context]
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass controls:

  useOutputPassControls(
    postProcessing,
    passNode,
    (outputNode, outputColorTransform) => {
      postProcessing.outputNode = outputNode
      postProcessing.outputColorTransform = outputColorTransform
      postProcessing.needsUpdate = true
    }
  )

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  useLocationControls(context.worldToECEFMatrix)

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(date => {
    getSunDirectionECEF(date, context.sunDirectionECEF)
  })

  return (
    <>
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]} />
    </>
  )
}

interface StoryProps {}

interface StoryArgs
  extends OutputPassArgs,
    ToneMappingArgs,
    LocationArgs,
    LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas camera={{ position: [2, 1, 2] }}>
    <Content {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...locationArgs({
    longitude: 30,
    latitude: 35,
    height: 300
  }),
  ...toneMappingArgs({
    toneMappingExposure: 10
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes(),
  ...rendererArgTypes()
}

export default Story
