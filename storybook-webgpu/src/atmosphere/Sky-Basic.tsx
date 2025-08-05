import { OrbitControls } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { useMemo, type FC } from 'react'
import { PostProcessing, type Renderer } from 'three/webgpu'

import {
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import {
  AtmosphereLight,
  AtmosphereLightNode,
  atmosphereLUT,
  AtmosphereRenderingContext,
  sky,
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

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const camera = useThree(({ camera }) => camera)

  const renderingContext = useMemo(() => new AtmosphereRenderingContext(), [])
  renderingContext.camera = camera

  // Post-processing:

  const lutNode = useResource(() => atmosphereLUT())

  const postProcessing = useResource(
    () => new PostProcessing(renderer),
    [renderer]
  )

  useTransientControl(
    ({ showSun, showMoon, showGround }: StoryArgs): SkyNodeOptions => ({
      showSun,
      showMoon,
      showGround
    }),
    options => {
      const skyNode = sky(renderingContext, lutNode, options)
      postProcessing.outputNode?.dispose()
      postProcessing.outputNode = skyNode
      postProcessing.needsUpdate = true
    }
  )

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Tone mapping controls:
  useToneMappingControls(() => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  const [longitude] = useLocationControls(renderingContext.worldToECEFMatrix)

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
    getSunDirectionECEF(date, renderingContext.sunDirectionECEF)
    getMoonDirectionECEF(date, renderingContext.moonDirectionECEF)
  })

  return (
    <>
      <atmosphereLight args={[renderingContext, lutNode]} />
      <OrbitControls target={[0, 0, 0]} minDistance={1} />
    </>
  )
}

interface StoryProps {}

interface StoryArgs extends ToneMappingArgs, LocationArgs, LocalDateArgs {
  showSun: boolean
  showMoon: boolean
  showGround: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    renderer={{
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{ position: [1, 0, 0] }}
  >
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
