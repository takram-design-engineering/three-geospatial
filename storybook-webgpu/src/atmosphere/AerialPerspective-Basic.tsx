import { useThree } from '@react-three/fiber'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins'
import {
  GlobeControls,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import type { FC } from 'react'
import { mrt, normalView, output, pass } from 'three/tsl'
import {
  MeshBasicNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereLUT,
  AtmosphereRenderingContext
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
import { useGuardedFrame } from '../helpers/useGuardedFrame'
import {
  usePointOfView,
  type PointOfViewProps
} from '../helpers/usePointOfView'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'

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

  const context = useResource(() => new AtmosphereRenderingContext(), [])
  context.camera = camera

  const lutNode = useResource(() => atmosphereLUT(), [])

  // Post-processing:

  const [postProcessing, passNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera).setMRT(
      mrt({
        output,
        normal: normalView
      })
    )

    const aerialNode = aerialPerspective(
      context,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      passNode.getTextureNode('normal'),
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, aerialNode]
  }, [renderer, scene, camera, context, lutNode])

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  // Apply the initial point of view.
  usePointOfView({
    longitude,
    latitude,
    height,
    heading,
    pitch,
    distance
  })

  // Output pass controls:
  useOutputPassControls(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.outputColorTransform = outputNode == null
    postProcessing.needsUpdate = true
  })

  // Tone mapping controls:
  useToneMappingControls(() => {
    postProcessing.needsUpdate = true
  })

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
    getSunDirectionECEF(date, context.sunDirectionECEF)
  })

  return (
    <>
      <GlobeControls enableDamping />
      <TilesRenderer>
        <TilesPlugin
          plugin={CesiumIonAuthPlugin}
          args={{
            apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN,
            assetId: 2767062, // Japan Regional Terrain
            autoRefreshToken: true
          }}
        />
        <TilesPlugin
          plugin={TileMaterialReplacementPlugin}
          args={MeshBasicNodeMaterial}
        />
      </TilesRenderer>
    </>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...toneMappingArgs({
    toneMappingExposure: 5
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes(),
  ...rendererArgTypes()
}

export default Story
