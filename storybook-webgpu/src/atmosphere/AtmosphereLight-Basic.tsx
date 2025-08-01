import { OrbitControls, Sphere } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { useMemo, type FC } from 'react'
import { Matrix4, Vector3 } from 'three'
import { pass } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

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
  locationArgs,
  locationArgTypes,
  useLocationControl,
  type LocationArgs
} from '../controls/locationControls'
import {
  outputPassArgs,
  outputPassArgTypes,
  useOutputPassControl,
  type OutputPassArgs
} from '../controls/outputPassControls'
import {
  physicalMaterialArgTypes,
  usePhysicalMaterialControl,
  type PhysicalMaterialArgTypes
} from '../controls/physicalMaterialControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControl,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const sunDirectionECEF = useMemo(() => new Vector3(), [])
  const worldToECEFMatrix = useMemo(() => new Matrix4().identity(), [])

  // Post-processing:

  const [postProcessing, passNode, lutNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera)

    const lutNode = atmosphereLUT()

    const aerialNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      null,
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, lutNode, aerialNode]
  }, [renderer, scene, camera])

  aerialNode.light = false
  aerialNode.sunDirectionECEF = sunDirectionECEF
  aerialNode.worldToECEFMatrix = worldToECEFMatrix

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass control:
  useOutputPassControl(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.needsUpdate = true
  })

  // Tone mapping control:
  useToneMappingControl(() => {
    postProcessing.needsUpdate = true
  })

  // Location control:
  const [longitude] = useLocationControl(worldToECEFMatrix)

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
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere
        args={[0.5, 128, 128]}
        position={[0, 0.5, 0]}
        material={usePhysicalMaterialControl()}
      />
    </>
  )
}

interface StoryProps {}

interface StoryArgs
  extends OutputPassArgs,
    ToneMappingArgs,
    LocalDateArgs,
    LocationArgs,
    PhysicalMaterialArgTypes {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    renderer={{
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{ position: [2, 1, 2] }}
  >
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...outputPassArgs,
  ...toneMappingArgs,
  ...localDateArgs,
  ...locationArgs,
  toneMappingExposure: 10,
  dayOfYear: 0,
  timeOfDay: 9,
  color: '#ffffff',
  roughness: 0.5,
  metalness: 0.5,
  longitude: 30,
  latitude: 35,
  height: 300
}

Story.argTypes = {
  ...outputPassArgTypes,
  ...toneMappingArgTypes,
  ...localDateArgTypes,
  ...locationArgTypes,
  ...physicalMaterialArgTypes
}

export default Story
