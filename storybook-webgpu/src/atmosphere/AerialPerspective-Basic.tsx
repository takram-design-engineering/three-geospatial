import { useThree } from '@react-three/fiber'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins'
import {
  GlobeControls,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import type { FC } from 'react'
import { AgXToneMapping } from 'three'
import { mrt, normalView, output, pass, toneMapping, uniform } from 'three/tsl'
import {
  MeshBasicNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext,
  lensFlare
} from '@takram/three-atmosphere/webgpu'
import { dithering } from '@takram/three-geospatial/webgpu'

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
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'
import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
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

  const context = useResource(() => new AtmosphereContext(), [])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, aerialNode, , toneMappingNode] =
    useResource(() => {
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
        passNode.getTextureNode('normal')
      )
      const lensFlareNode = lensFlare(aerialNode)
      const toneMappingNode = toneMapping(
        AgXToneMapping,
        uniform(0),
        lensFlareNode
      )
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = toneMappingNode.add(dithering())

      return [
        postProcessing,
        passNode,
        aerialNode,
        lensFlareNode,
        toneMappingNode
      ]
    }, [renderer, scene, camera, context])

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  useTransientControl(
    ({ transmittance, inscatter }: StoryArgs) => ({ transmittance, inscatter }),
    ({ transmittance, inscatter }) => {
      aerialNode.transmittance = transmittance
      aerialNode.inscatter = inscatter
      postProcessing.needsUpdate = true
    }
  )

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
        <TilesPlugin plugin={TilesFadePlugin} />
      </TilesRenderer>
    </>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {
  transmittance: boolean
  inscatter: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  transmittance: true,
  inscatter: true,
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
  transmittance: {
    control: {
      type: 'boolean'
    }
  },
  inscatter: {
    control: {
      type: 'boolean'
    }
  },
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes(),
  ...rendererArgTypes()
}

export default Story
