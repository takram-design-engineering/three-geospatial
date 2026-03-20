import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type FC } from 'react'
import { AgXToneMapping } from 'three'
import { context, toneMapping, uniform } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  AtmosphereContext,
  sky,
  type StarsNode
} from '@takram/three-atmosphere/webgpu'
import { dithering, lensFlare } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
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
import { longExposure } from '../helpers/LongExposureNode'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const camera = useThree(({ camera }) => camera)

  const atmosphereContext = useResource(() => new AtmosphereContext(), [])
  atmosphereContext.camera = camera

  useLayoutEffect(() => {
    renderer.contextNode = context({
      ...renderer.contextNode.value,
      getAtmosphere: () => atmosphereContext
    })
  }, [renderer, atmosphereContext])

  // Post-processing:

  const skyNode = useResource(() => {
    const skyNode = sky()
    skyNode.starsNode = longExposure(skyNode.starsNode) as unknown as StarsNode
    return skyNode
  }, [])

  const lensFlareNode = useResource(() => lensFlare(skyNode), [skyNode])

  const toneMappingNode = useResource(
    () => toneMapping(AgXToneMapping, uniform(0), lensFlareNode),
    [lensFlareNode]
  )

  const postProcessing = useResource(
    () => new PostProcessing(renderer, toneMappingNode.add(dithering)),
    [renderer, toneMappingNode]
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
      postProcessing.needsUpdate = true
    }
  )

  useTransientControl(
    ({ showGround }: StoryArgs) => ({
      showGround
    }),
    ({ showGround }) => {
      atmosphereContext.showGround = showGround
      postProcessing.needsUpdate = true
    }
  )

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  useLocationControls(atmosphereContext.matrixWorldToECEF.value)

  const referenceDate = useRef(+new Date('2025-08-01T18:30:00+09:00'))
  useGuardedFrame(() => {
    referenceDate.current += 10000
    const date = referenceDate.current
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } =
      atmosphereContext
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
  })

  return <OrbitControls target={[1, 0.8, 0.5]} minDistance={1} />
}

interface StoryProps {}

interface StoryArgs extends ToneMappingArgs, LocationArgs {
  showSun: boolean
  showMoon: boolean
  showGround: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas camera={{ fov: 90, position: [0, 0, 0] }}>
    <Content {...props} />
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  showSun: true,
  showMoon: true,
  showGround: true,
  ...locationArgs({
    longitude: 140,
    latitude: 35,
    height: 300
  }),
  ...toneMappingArgs({
    toneMappingExposure: 100
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
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...rendererArgTypes()
}

export default Story
