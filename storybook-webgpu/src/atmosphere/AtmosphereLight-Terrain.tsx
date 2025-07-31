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
  AgXToneMapping,
  MeshPhysicalNodeMaterial,
  PostProcessing,
  type Renderer,
  type ToneMapping
} from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereLight,
  AtmosphereLightNode,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'

import { localDateArgTypes } from '../controls/localDate'
import { toneMappingArgTypes } from '../controls/toneMapping'
import type { StoryFC } from '../helpers/createStory'
import { useLocalDate } from '../helpers/useLocalDate'
import {
  usePointOfView,
  type PointOfViewProps
} from '../helpers/usePointOfView'
import { useResource } from '../helpers/useResource'
import { useSpringControl } from '../helpers/useSpringControl'
import { useTransientControl } from '../helpers/useTransientControl'
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

  // Post-processing

  const sunDirectionECEF = useMemo(() => new Vector3(), [])
  const worldToECEFMatrix = useMemo(() => new Matrix4().identity(), [])

  // Share the LUT node with both AerialPerspectiveNode and AtmosphereLight.
  const lutNode = useResource(() => atmosphereLUT())

  const postProcessing = useResource(() => {
    const passNode = pass(scene, camera).setMRT(
      mrt({
        output,
        normal: normalView
      })
    )
    const aerialNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('normal'),
      passNode.getTextureNode('depth'),
      lutNode
    )
    aerialNode.sunDirectionECEF = sunDirectionECEF
    aerialNode.worldToECEFMatrix = worldToECEFMatrix

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return postProcessing
  }, [renderer, scene, camera, sunDirectionECEF, worldToECEFMatrix, lutNode])

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Tone mapping controls

  useTransientControl(
    ({ toneMapping }: StoryArgs) => toneMapping,
    toneMapping => {
      renderer.toneMapping = toneMapping
    }
  )
  useSpringControl(
    ({ exposure }: StoryArgs) => exposure,
    exposure => {
      renderer.toneMappingExposure = exposure
    }
  )

  // Apply the initial point of view

  usePointOfView({
    longitude,
    latitude,
    height,
    heading,
    pitch,
    distance
  })

  // Local date controls (depends on the longitude of the location)

  const dayOfYear = useSpringControl(({ dayOfYear }: StoryArgs) => dayOfYear)
  const timeOfDay = useSpringControl(({ timeOfDay }: StoryArgs) => timeOfDay)
  useLocalDate(138.5, dayOfYear, timeOfDay, date => {
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
            material: new MeshPhysicalNodeMaterial({
              color: 'white',
              roughness: 0.5,
              metalness: 0.5,
              clearcoat: 1
            })
          }}
        />
      </TilesRenderer>
    </>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs {
  toneMapping: ToneMapping
  exposure: number
  dayOfYear: number
  timeOfDay: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    gl={renderer => {
      renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
    }}
  >
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  toneMapping: AgXToneMapping,
  exposure: 10,
  dayOfYear: 0,
  timeOfDay: 9
}

Story.argTypes = {
  ...toneMappingArgTypes,
  ...localDateArgTypes
}

export default Story
