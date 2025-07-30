import { useFrame, useThree } from '@react-three/fiber'
import { GlobeControls } from '3d-tiles-renderer/r3f'
import type { FC } from 'react'
import { Vector3 } from 'three'
import { diffuseColor, mrt, normalView, pass, uniform } from 'three/tsl'
import {
  AgXToneMapping,
  PostProcessing,
  type Renderer,
  type ToneMapping
} from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'

import { localDateArgTypes } from '../controls/localDate'
import { toneMappingArgTypes } from '../controls/toneMapping'
import { Globe } from '../helpers/Globe'
import {
  useControl,
  useSpringControl,
  useTransientControl,
  type StoryFC
} from '../helpers/StoryControls'
import { useLocalDate } from '../helpers/useLocalDate'
import {
  usePointOfView,
  type PointOfViewProps
} from '../helpers/usePointOfView'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const Scene: FC<StoryProps> = ({
  longitude,
  latitude,
  heading,
  pitch,
  distance
}) => {
  usePointOfView({
    longitude,
    latitude,
    heading,
    pitch,
    distance
  })

  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const sunDirection = useResource(() => uniform(new Vector3()))

  const [postProcessing] = useResource(() => {
    const passNode = pass(scene, camera).setMRT(
      mrt({
        output: diffuseColor,
        normal: normalView
      })
    )
    const lutNode = atmosphereLUT()
    const aerialPerspectiveNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('normal'),
      passNode.getTextureNode('depth'),
      lutNode
    )
    aerialPerspectiveNode.sunDirectionNode = sunDirection

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialPerspectiveNode

    return [postProcessing, lutNode]
  }, [renderer, scene, camera, sunDirection])

  useFrame(() => {
    postProcessing.render()
  }, 1)

  useTransientControl(
    ({ toneMapping }: StoryArgs) => toneMapping,
    toneMapping => {
      renderer.toneMapping = toneMapping
      postProcessing.needsUpdate = true
    }
  )

  useSpringControl(
    ({ exposure }: StoryArgs) => exposure,
    exposure => {
      renderer.toneMappingExposure = exposure
    }
  )

  const dayOfYear = useSpringControl(({ dayOfYear }: StoryArgs) => dayOfYear)
  const timeOfDay = useSpringControl(({ timeOfDay }: StoryArgs) => timeOfDay)
  useLocalDate(longitude, dayOfYear, timeOfDay, date => {
    getSunDirectionECEF(date, sunDirection.value)
  })

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

interface StoryArgs {
  googleMapsApiKey: string
  toneMapping: ToneMapping
  exposure: number
  dayOfYear: number
  timeOfDay: number
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
