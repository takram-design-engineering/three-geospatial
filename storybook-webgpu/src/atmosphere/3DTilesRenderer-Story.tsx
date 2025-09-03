import { useThree } from '@react-three/fiber'
import { useMemo, type FC } from 'react'
import { AgXToneMapping, Scene } from 'three'
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
import { Description, TilesAttribution } from '../helpers/Description'
import { Globe } from '../helpers/Globe'
import { GlobeControls } from '../helpers/GlobeControls'
import { useControl } from '../helpers/useControl'
import { useGuardedFrame } from '../helpers/useGuardedFrame'
import {
  usePointOfView,
  type PointOfViewProps
} from '../helpers/usePointOfView'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const Content: FC<StoryProps> = ({
  longitude,
  latitude,
  height,
  heading,
  pitch,
  distance
}) => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)
  const overlayScene = useMemo(() => new Scene(), [])

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
        outputNode.mul(2 / 3),
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

      const overlayPassNode = pass(overlayScene, camera, {
        samples: 0,
        depthBuffer: false
      })
      const overlayNode = overlayPassNode.getTextureNode('output')

      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode.add(dither()).add(overlayNode)

      manage(aerialNode, lensFlareNode, taaNode)
      return [postProcessing, passNode, toneMappingNode]
    },
    [renderer, camera, scene, overlayScene, context]
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

  // Apply the initial point of view.
  usePointOfView({
    longitude,
    latitude,
    height,
    heading,
    pitch,
    distance
  })

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
    getSunDirectionECEF(date, context.sunDirectionECEF)
  })

  // Google Maps API key:
  const apiKey = useControl(({ googleMapsApiKey }: StoryArgs) =>
    googleMapsApiKey !== '' ? googleMapsApiKey : undefined
  )

  return (
    <Globe apiKey={apiKey}>
      <GlobeControls enableDamping overlayScene={overlayScene} />
    </Globe>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {
  googleMapsApiKey: string
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Content {...props} />
    <Description>
      <TilesAttribution />
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  googleMapsApiKey: '',
  ...localDateArgs(),
  ...toneMappingArgs(),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  googleMapsApiKey: { control: 'text' },
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes(),
  ...rendererArgTypes()
}

export default Story
