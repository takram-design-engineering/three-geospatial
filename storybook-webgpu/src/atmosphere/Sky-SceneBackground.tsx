import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { FC } from 'react'
import { pass, toneMapping, uniform } from 'three/tsl'
import { AgXToneMapping, PostProcessing, type Renderer } from 'three/webgpu'

import {
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import {
  atmosphereContext,
  skyBackground
} from '@takram/three-atmosphere/webgpu'
import { dithering, lensFlare } from '@takram/three-geospatial/webgpu'

import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControls,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  locationArgs,
  locationArgTypes,
  useLocationControls,
  type LocationArgs
} from '../controls/locationControls'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { Description } from '../helpers/Description'
import { useGuardedFrame } from '../helpers/useGuardedFrame'
import { useResource } from '../helpers/useResource'
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const context = useResource(() => atmosphereContext(renderer), [renderer])
  context.camera = camera

  const skyNode = useResource(() => skyBackground(context), [context])
  scene.backgroundNode = skyNode

  // Post-processing:

  const [postProcessing, toneMappingNode] = useResource(
    manage => {
      const passNode = manage(pass(scene, camera, { samples: 0 }))
      const lensFlareNode = manage(lensFlare(passNode))
      const toneMappingNode = manage(
        toneMapping(AgXToneMapping, uniform(0), lensFlareNode)
      )

      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = toneMappingNode.add(dithering)

      return [postProcessing, toneMappingNode]
    },
    [renderer, scene, camera]
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  useTransientControl(
    ({ showSun, showMoon }: StoryArgs) => ({
      showSun,
      showMoon
    }),
    options => {
      Object.assign(skyNode, options)
      skyNode.needsUpdate = true
    }
  )

  useTransientControl(
    ({ showGround }: StoryArgs) => ({
      showGround
    }),
    ({ showGround }) => {
      context.showGround = showGround
      skyNode.needsUpdate = true
    }
  )

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  useLocationControls(context.matrixWorldToECEF)

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(date => {
    getSunDirectionECEF(date, context.sunDirectionECEF)
    getMoonDirectionECEF(date, context.moonDirectionECEF)
  })

  return <OrbitControls target={[0, 0, 0]} minDistance={1} />
}

interface StoryProps {}

interface StoryArgs extends ToneMappingArgs, LocationArgs, LocalDateArgs {
  showSun: boolean
  showMoon: boolean
  showGround: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas camera={{ position: [1, 0, 0] }}>
    <Content {...props} />
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  showSun: true,
  showMoon: true,
  showGround: true,
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...locationArgs({
    longitude: 30,
    latitude: 35,
    height: 300
  }),
  ...toneMappingArgs({
    toneMappingExposure: 10
  }),
  ...rendererArgs()
}

Story.argTypes = {
  showSun: {
    control: {
      type: 'boolean'
    }
  },
  showMoon: {
    control: {
      type: 'boolean'
    }
  },
  showGround: {
    control: {
      type: 'boolean'
    }
  },
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...rendererArgTypes()
}

export default Story
