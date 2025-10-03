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

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContextNode
} from '@takram/three-atmosphere/webgpu'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description, TilesAttribution } from '../components/Description'
import { Globe } from '../components/Globe'
import { GlobeControls } from '../components/GlobeControls'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
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
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { usePointOfView, type PointOfViewProps } from '../hooks/usePointOfView'
import { useResource } from '../hooks/useResource'

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

  const context = useResource(() => new AtmosphereContextNode(), [])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, toneMappingNode] = useResource(
    manage => {
      const passNode = manage(
        pass(scene, camera, { samples: 0 }).setMRT(
          mrt({
            output: diffuseColor,
            normal: normalView,
            velocity: highpVelocity
          })
        )
      )
      const colorNode = passNode.getTextureNode('output')
      const depthNode = passNode.getTextureNode('depth')
      const normalNode = passNode.getTextureNode('normal')
      const velocityNode = passNode.getTextureNode('velocity')

      const aerialNode = manage(
        aerialPerspective(context, colorNode.mul(2 / 3), depthNode, normalNode)
      )
      const lensFlareNode = manage(lensFlare(aerialNode))
      const toneMappingNode = manage(
        toneMapping(AgXToneMapping, uniform(0), lensFlareNode)
      )
      const taaNode = manage(
        temporalAntialias(highpVelocity)(
          toneMappingNode,
          depthNode,
          velocityNode,
          camera
        )
      )

      const overlayPassNode = manage(
        pass(overlayScene, camera, {
          samples: 0,
          depthBuffer: false
        })
      )

      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode
        .add(dithering)
        .mul(overlayPassNode.a.oneMinus())
        .add(overlayPassNode)

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
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
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
