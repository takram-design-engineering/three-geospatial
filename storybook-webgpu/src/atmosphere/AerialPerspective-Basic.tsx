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
import { Matrix4, Vector3 } from 'three'
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
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'

import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControl,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  outputPassArgs,
  outputPassArgTypes,
  useOutputPassControl,
  type OutputPassArgs
} from '../controls/outputPassControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControl,
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

  const sunDirectionECEF = useMemo(() => new Vector3(), [])
  const worldToECEFMatrix = useMemo(() => new Matrix4().identity(), [])

  // Post-processing:

  const [postProcessing, passNode, lutNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera).setMRT(
      mrt({
        output,
        normal: normalView
      })
    )

    const lutNode = atmosphereLUT()

    const aerialNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      passNode.getTextureNode('normal'),
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, lutNode, aerialNode]
  }, [renderer, scene, camera])

  aerialNode.light = true
  aerialNode.sunDirectionECEF = sunDirectionECEF
  aerialNode.worldToECEFMatrix = worldToECEFMatrix

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

  // Output pass control:
  useOutputPassControl(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.needsUpdate = true
  })

  // Tone mapping control:
  useToneMappingControl(() => {
    postProcessing.needsUpdate = true
  })

  // Local date control (depends on the longitude of the location):
  useLocalDateControl(longitude, date => {
    getSunDirectionECEF(date, sunDirectionECEF)
  })

  return (
    <>
      <atmosphereLight
        ref={light => {
          if (light != null) {
            // Share the references to sync updates with the light.
            light.worldToECEFMatrix = worldToECEFMatrix
            light.sunDirectionECEF = sunDirectionECEF
          }
        }}
        lutNode={lutNode}
      />
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
            material: useMemo(() => new MeshBasicNodeMaterial(), [])
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
  ...outputPassArgs,
  ...toneMappingArgs,
  ...localDateArgs,
  toneMappingExposure: 10,
  dayOfYear: 0,
  timeOfDay: 9
}

Story.argTypes = {
  ...outputPassArgTypes,
  ...toneMappingArgTypes,
  ...localDateArgTypes
}

export default Story
