import { useThree } from '@react-three/fiber'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import { useMemo, type FC } from 'react'
import { AgXToneMapping, Scene } from 'three'
import { mrt, normalView, output, pass, toneMapping, uniform } from 'three/tsl'
import {
  MeshBasicNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

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
import { Description } from '../components/Description'
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
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { usePointOfView, type PointOfViewProps } from '../hooks/usePointOfView'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'
import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'

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

  const [postProcessing, passNode, aerialNode, toneMappingNode] = useResource(
    manage => {
      const passNode = manage(
        pass(scene, camera, { samples: 0 }).setMRT(
          mrt({
            output,
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
        aerialPerspective(context, colorNode, depthNode, normalNode)
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

      return [postProcessing, passNode, aerialNode, toneMappingNode]
    },
    [renderer, scene, camera, overlayScene, context]
  )

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
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
  })

  return (
    <>
      <GlobeControls enableDamping overlayScene={overlayScene} />
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
    <Content {...props} />
    <Description />
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
