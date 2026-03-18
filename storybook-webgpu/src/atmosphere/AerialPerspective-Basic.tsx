import { useThree } from '@react-three/fiber'
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
import { PLATEAU_TERRAIN_API_TOKEN } from '../constants'
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
import { CesiumIonTerrainPlugin } from '../plugins/CesiumIonTerrainPlugin'
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

  const atmosphereContext = useResource(() => new AtmosphereContextNode(), [])
  atmosphereContext.camera = camera

  // Post-processing:

  const passNode = useResource(
    () =>
      pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output,
          normal: normalView,
          velocity: highpVelocity
        })
      ),
    [scene, camera]
  )

  const colorNode = passNode.getTextureNode('output')
  const depthNode = passNode.getTextureNode('depth')
  const normalNode = passNode.getTextureNode('normal')
  const velocityNode = passNode.getTextureNode('velocity')

  const aerialNode = useResource(
    () =>
      aerialPerspective(atmosphereContext, colorNode, depthNode, normalNode),
    [atmosphereContext, colorNode, depthNode, normalNode]
  )

  const lensFlareNode = useResource(() => lensFlare(aerialNode), [aerialNode])

  const toneMappingNode = useResource(
    () => toneMapping(AgXToneMapping, uniform(0), lensFlareNode),
    [lensFlareNode]
  )

  const taaNode = useResource(
    () =>
      temporalAntialias(highpVelocity)(
        toneMappingNode,
        depthNode,
        velocityNode,
        camera
      ),
    [camera, depthNode, velocityNode, toneMappingNode]
  )

  const overlayPassNode = useResource(
    () =>
      pass(overlayScene, camera, {
        samples: 0,
        depthBuffer: false
      }),
    [camera, overlayScene]
  )

  const postProcessing = useResource(
    () =>
      new PostProcessing(
        renderer,
        taaNode
          .add(dithering)
          .mul(overlayPassNode.a.oneMinus())
          .add(overlayPassNode)
      ),
    [renderer, taaNode, overlayPassNode]
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
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } =
      atmosphereContext
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
          plugin={CesiumIonTerrainPlugin}
          args={{
            apiToken: PLATEAU_TERRAIN_API_TOKEN,
            assetId: 3258112, // PLATEAU terrain dataset
            autoRefreshToken: true
          }}
        />
        <TilesPlugin
          plugin={TileMaterialReplacementPlugin}
          args={() => new MeshBasicNodeMaterial()}
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
