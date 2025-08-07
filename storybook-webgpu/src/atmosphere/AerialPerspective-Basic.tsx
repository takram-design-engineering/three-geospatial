import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/plugins'
import {
  GlobeControls,
  TilesPlugin,
  TilesRenderer
} from '3d-tiles-renderer/r3f'
import { useMemo, type FC } from 'react'
import { mrt, normalView, output, pass } from 'three/tsl'
import {
  MeshBasicNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereLight,
  AtmosphereLightNode,
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
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import {
  usePointOfView,
  type PointOfViewProps
} from '../helpers/usePointOfView'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'
import { TileMeshPropsPlugin } from '../plugins/TileMeshPropsPlugin'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

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

  const renderingContext = useMemo(() => new AtmosphereRenderingContext(), [])
  renderingContext.camera = camera

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
      renderingContext,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      passNode.getTextureNode('normal'),
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, aerialNode]
  }, [renderer, scene, camera, renderingContext, lutNode])

  useFrame(() => {
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
    postProcessing.needsUpdate = true
  })

  // Tone mapping controls:
  useToneMappingControls(() => {
    postProcessing.needsUpdate = true
  })

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
    getSunDirectionECEF(date, renderingContext.sunDirectionECEF)
  })

  return (
    <>
      <atmosphereLight args={[renderingContext, lutNode]} />
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
          plugin={TileMeshPropsPlugin}
          args={{
            material: useResource(() => new MeshBasicNodeMaterial(), [])
          }}
        />
      </TilesRenderer>
    </>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    renderer={{
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
  >
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...toneMappingArgs({
    toneMappingExposure: 10
  }),
  ...outputPassArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes()
}

export default Story
