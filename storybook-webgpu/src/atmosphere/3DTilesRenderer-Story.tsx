import { useFrame, useThree } from '@react-three/fiber'
import { GlobeControls } from '3d-tiles-renderer/r3f'
import { useEffect, type FC } from 'react'
import { diffuseColor, mrt, normalView, pass } from 'three/tsl'
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
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  usePointOfView({
    longitude,
    latitude,
    heading,
    pitch,
    distance
  })

  const passNode = useResource(
    () =>
      pass(scene, camera).setMRT(
        mrt({
          output: diffuseColor,
          normal: normalView
        })
      ),
    [scene, camera]
  )
  const atmosphereLUTNode = useResource(() => atmosphereLUT())
  const aerialPerspectiveNode = useResource(
    () =>
      aerialPerspective(
        camera,
        passNode.getTextureNode('output'),
        passNode.getTextureNode('normal'),
        passNode.getTextureNode('depth'),
        atmosphereLUTNode
      ),
    [camera, passNode, atmosphereLUTNode]
  )
  const postProcessing = useResource(
    () => new PostProcessing(renderer),
    [renderer]
  )

  useEffect(() => {
    postProcessing.outputNode = aerialPerspectiveNode
  }, [postProcessing, aerialPerspectiveNode])

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
    getSunDirectionECEF(date, aerialPerspectiveNode.sunDirection)
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
