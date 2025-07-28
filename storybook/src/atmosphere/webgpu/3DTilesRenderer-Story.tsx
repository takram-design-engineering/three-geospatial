import { useFrame, useThree } from '@react-three/fiber'
import { GlobeControls, TilesPlugin } from '3d-tiles-renderer/r3f'
import { useEffect, useLayoutEffect, type FC } from 'react'
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
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'

import { Globe } from '../../helpers/Globe'
import {
  useSpringControl,
  useTransientControl,
  type StoryFC
} from '../../helpers/StoryControls'
import { useLocalDate } from '../../helpers/useLocalDate'
import { useResource } from '../../helpers/useResource'
import { WebGPUCanvas } from '../../helpers/webgpu/WebGPUCanvas'
import { TileNodeMaterialReplacementPlugin } from '../../plugins/TileNodeMaterialReplacementPlugin'

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

  useLayoutEffect(() => {
    new PointOfView(distance, radians(heading), radians(pitch)).decompose(
      new Geodetic(radians(longitude), radians(latitude)).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [longitude, latitude, heading, pitch, distance, camera])

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
  const lutNode = useResource(() => atmosphereLUT())
  const apNode = useResource(
    () =>
      aerialPerspective(
        camera,
        passNode.getTextureNode('output'),
        passNode.getTextureNode('normal'),
        passNode.getTextureNode('depth'),
        lutNode
      ),
    [passNode]
  )
  const postProcessing = useResource(
    () => new PostProcessing(renderer),
    [renderer]
  )

  useEffect(() => {
    postProcessing.outputNode = apNode
  }, [postProcessing, apNode])

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
    getSunDirectionECEF(date, apNode.sunDirection)
  })

  return (
    <Globe>
      <GlobeControls enableDamping />
      <TilesPlugin plugin={TileNodeMaterialReplacementPlugin} />
    </Globe>
  )
}

export const Story: StoryFC<StoryProps> = props => (
  <WebGPUCanvas>
    <Scene {...props} />
  </WebGPUCanvas>
)

interface StoryProps {
  longitude: number
  latitude: number
  heading: number
  pitch: number
  distance: number
}

interface StoryArgs {
  toneMapping: ToneMapping
  exposure: number
  dayOfYear: number
  timeOfDay: number
}

Story.args = {
  googleMapsApiKey: '',
  toneMapping: AgXToneMapping
}

Story.argTypes = {
  googleMapsApiKey: { control: 'text' },
  toneMapping: {
    options: [1, 2, 3, 4, 6, 7],
    control: {
      type: 'select',
      labels: {
        1: 'Linear',
        2: 'Reinhard',
        3: 'Cineon',
        4: 'ACES Filmic',
        6: 'AgX',
        7: 'Neutral'
      }
    },
    table: { category: 'tone mapping' }
  },
  exposure: {
    control: {
      type: 'range',
      min: 1,
      max: 100,
      step: 1
    },
    table: { category: 'tone mapping' }
  },
  dayOfYear: {
    control: {
      type: 'range',
      min: 1,
      max: 365,
      step: 1
    },
    table: { category: 'local date' }
  },
  timeOfDay: {
    control: {
      type: 'range',
      min: 0,
      max: 24,
      step: 0.1
    },
    table: { category: 'local date' }
  }
}

export default Story
