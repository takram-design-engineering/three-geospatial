import { useFrame, useThree } from '@react-three/fiber'
import { GlobeControls } from '3d-tiles-renderer/r3f'
import { useMemo, type FC } from 'react'
import { Vector3 } from 'three'
import { diffuseColor, mrt, normalView, pass } from 'three/tsl'
import { AgXToneMapping, PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'

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
import { Globe } from '../helpers/Globe'
import { useControl } from '../helpers/useControl'
import {
  usePointOfView,
  type PointOfViewProps
} from '../helpers/usePointOfView'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

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

  // Post-processing:

  const sunDirectionECEF = useMemo(() => new Vector3(), [])

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

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, lutNode, aerialNode]
  }, [renderer, scene, camera, sunDirectionECEF])

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Apply the initial point of view:

  usePointOfView({
    longitude,
    latitude,
    height,
    heading,
    pitch,
    distance
  })

  // Tone mapping control:

  useToneMappingControl(() => {
    postProcessing.needsUpdate = true
  })

  // Local date control (depends on the longitude of the location):

  useLocalDateControl(longitude, date => {
    getSunDirectionECEF(date, sunDirectionECEF)
  })

  // Google Maps API key:

  const apiKey = useControl(({ googleMapsApiKey }: StoryArgs) =>
    googleMapsApiKey !== '' ? googleMapsApiKey : undefined
  )

  return (
    <Globe apiKey={apiKey}>
      <GlobeControls enableDamping />
    </Globe>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends ToneMappingArgTypes, LocalDateArgTypes {
  googleMapsApiKey: string
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  googleMapsApiKey: '',
  toneMapping: AgXToneMapping
}

Story.argTypes = {
  googleMapsApiKey: { control: 'text' },
  ...toneMappingArgTypes,
  ...localDateArgTypes
}

export default Story
