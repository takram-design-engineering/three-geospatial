import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMemo, type FC } from 'react'

import {
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import {
  atmosphereLUT,
  AtmosphereRenderingContext,
  skyBackground,
  type SkyNodeOptions
} from '@takram/three-atmosphere/webgpu'

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
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { useResource } from '../helpers/useResource'
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const Scene: FC<StoryProps> = () => {
  const scene = useThree(({ scene }) => scene)

  const renderingContext = useMemo(() => new AtmosphereRenderingContext(), [])
  const lutNode = useResource(() => atmosphereLUT())

  useTransientControl(
    ({ showSun, showMoon, showGround }: StoryArgs): SkyNodeOptions => ({
      showSun,
      showMoon,
      showGround
    }),
    options => {
      const skyNode = skyBackground(renderingContext, lutNode, options)
      scene.backgroundNode?.dispose()
      scene.backgroundNode = skyNode
    }
  )

  // Tone mapping controls:
  useToneMappingControls()

  // Location controls:
  const [longitude] = useLocationControls(renderingContext.worldToECEFMatrix)

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
    getSunDirectionECEF(date, renderingContext.sunDirectionECEF)
    getMoonDirectionECEF(date, renderingContext.moonDirectionECEF)
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
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...toneMappingArgs({
    toneMappingExposure: 10
  }),
  ...locationArgs({
    longitude: 30,
    latitude: 35,
    height: 300
  }),
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  showSun: true,
  showMoon: true,
  showGround: true
}

Story.argTypes = {
  ...toneMappingArgTypes(),
  ...locationArgTypes(),
  ...localDateArgTypes(),
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
  }
}

export default Story
