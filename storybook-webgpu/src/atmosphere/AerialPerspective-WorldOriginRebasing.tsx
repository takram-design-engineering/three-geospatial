import { OrbitControls, Sphere } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, type FC } from 'react'
import { Matrix4, Vector3 } from 'three'
import { diffuseColor, mrt, normalView, pass } from 'three/tsl'
import { AgXToneMapping, PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'

import {
  localDateArgTypes,
  useLocalDateControl,
  type LocalDateArgTypes
} from '../controls/localDate'
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

const geodetic = new Geodetic()
const position = new Vector3()

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  // Post-processing:

  const sunDirectionECEF = useMemo(() => new Vector3(), [])
  const worldToECEFMatrix = useMemo(() => new Matrix4().identity(), [])

  const [postProcessing] = useResource(() => {
    const passNode = pass(scene, camera).setMRT(
      mrt({
        output: diffuseColor,
        normal: normalView
      })
    )
    const lutNode = atmosphereLUT()
    const aerialNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('normal'),
      passNode.getTextureNode('depth'),
      lutNode
    )
    aerialNode.light = true
    aerialNode.sunDirectionECEF = sunDirectionECEF
    aerialNode.worldToECEFMatrix = worldToECEFMatrix

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, lutNode, aerialNode]
  }, [renderer, scene, camera, sunDirectionECEF, worldToECEFMatrix])

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
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]} />
    </>
  )
}

interface StoryProps {}

interface StoryArgs extends ToneMappingArgTypes, LocalDateArgTypes {
  longitude: number
  latitude: number
  height: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas camera={{ position: [2, 1, 2] }}>
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  toneMapping: AgXToneMapping,
  exposure: 10,
  dayOfYear: 0,
  timeOfDay: 9,
  longitude: 30,
  latitude: 35,
  height: 300
}

Story.argTypes = {
  ...toneMappingArgTypes,
  ...localDateArgTypes,
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
