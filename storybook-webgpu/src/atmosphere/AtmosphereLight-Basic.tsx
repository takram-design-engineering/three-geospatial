import { OrbitControls, Sphere } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { useMemo, type FC } from 'react'
import { Matrix4, Vector3 } from 'three'
import { mrt, normalView, output, pass } from 'three/tsl'
import { AgXToneMapping, PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereLight,
  AtmosphereLightNode,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'

import {
  localDateArgTypes,
  useLocalDateControl,
  type LocalDateArgTypes
} from '../controls/localDate'
import {
  physicalMaterialArgTypes,
  usePhysicalMaterialControl,
  type PhysicalMaterialArgTypes
} from '../controls/physicalMaterial'
import {
  toneMappingArgTypes,
  useToneMappingControl,
  type ToneMappingArgTypes
} from '../controls/toneMapping'
import type { StoryFC } from '../helpers/createStory'
import { useCombinedChange } from '../helpers/useCombinedChange'
import { useResource } from '../helpers/useResource'
import { useSpringControl } from '../helpers/useSpringControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

const geodetic = new Geodetic()
const position = new Vector3()

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  // Post-processing:

  const sunDirectionECEF = useMemo(() => new Vector3(), [])
  const worldToECEFMatrix = useMemo(() => new Matrix4().identity(), [])

  // Share the LUT node with both AerialPerspectiveNode and AtmosphereLight.
  const lutNode = useResource(() => atmosphereLUT())

  const [postProcessing] = useResource(() => {
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
    aerialNode.light = false
    aerialNode.sunDirectionECEF = sunDirectionECEF
    aerialNode.worldToECEFMatrix = worldToECEFMatrix

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, aerialNode]
  }, [renderer, scene, camera, sunDirectionECEF, worldToECEFMatrix, lutNode])

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Tone mapping control:

  useToneMappingControl(() => {
    postProcessing.needsUpdate = true
  })

  // Location control:

  const longitude = useSpringControl(({ longitude }: StoryArgs) => longitude)
  const latitude = useSpringControl(({ latitude }: StoryArgs) => latitude)
  const height = useSpringControl(({ height }: StoryArgs) => height)
  useCombinedChange(
    [longitude, latitude, height],
    ([longitude, latitude, height]) => {
      Ellipsoid.WGS84.getNorthUpEastFrame(
        geodetic
          .set(radians(longitude), radians(latitude), height)
          .toECEF(position),
        worldToECEFMatrix
      )
    }
  )

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
  extends ToneMappingArgTypes,
    LocalDateArgTypes,
    PhysicalMaterialArgTypes {
  longitude: number
  latitude: number
  height: number
}

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
  toneMapping: AgXToneMapping,
  exposure: 10,
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
  ...toneMappingArgTypes,
  ...localDateArgTypes,
  ...physicalMaterialArgTypes,
  longitude: {
    control: {
      type: 'range',
      min: -180,
      max: 180
    },
    table: { category: 'location' }
  },
  latitude: {
    control: {
      type: 'range',
      min: -90,
      max: 90
    },
    table: { category: 'location' }
  },
  height: {
    control: {
      type: 'range',
      min: 0,
      max: 30000
    },
    table: { category: 'location' }
  }
}

export default Story
