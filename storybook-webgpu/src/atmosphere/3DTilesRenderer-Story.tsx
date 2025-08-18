import { useThree } from '@react-three/fiber'
import { GlobeControls } from '3d-tiles-renderer/r3f'
import type { FC } from 'react'
import {
  convertToTexture,
  diffuseColor,
  mrt,
  normalView,
  pass
} from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext,
  lensFlare
} from '@takram/three-atmosphere/webgpu'

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
import { Globe } from '../helpers/Globe'
import { useAsyncFrame } from '../helpers/useAsyncFrame'
import { useControl } from '../helpers/useControl'
import {
  usePointOfView,
  type PointOfViewProps
} from '../helpers/usePointOfView'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const Scene: FC<StoryProps> = ({
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

  const context = useResource(() => new AtmosphereContext(), [])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, , lensFlareNode] = useResource(() => {
    const passNode = pass(scene, camera).setMRT(
      mrt({
        output: diffuseColor,
        normal: normalView
      })
    )

    const aerialNode = aerialPerspective(
      context,
      passNode.getTextureNode('output').mul(2 / 3),
      passNode.getTextureNode('depth'),
      passNode.getTextureNode('normal')
    )
    const lensFlareNode = lensFlare(convertToTexture(aerialNode))

    const postProcessing = new PostProcessing(renderer)

    return [postProcessing, passNode, aerialNode, lensFlareNode]
  }, [renderer, camera, scene, context])

  useAsyncFrame(async () => {
    await postProcessing.renderAsync()
  }, 1)

  // Output pass controls:
  useOutputPassControls(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? lensFlareNode
    postProcessing.outputColorTransform = outputNode == null
    postProcessing.needsUpdate = true
  })

  // Tone mapping controls:
  useToneMappingControls(() => {
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
      <GlobeControls enableDamping />
    </Globe>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {
  googleMapsApiKey: string
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Scene {...props} />
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
