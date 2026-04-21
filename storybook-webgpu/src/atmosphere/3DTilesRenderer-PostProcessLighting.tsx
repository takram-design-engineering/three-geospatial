import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, type FC } from 'react'
import { AgXToneMapping, Scene } from 'three'
import {
  context,
  diffuseColor,
  mrt,
  normalView,
  pass,
  toneMapping,
  uniform
} from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext
} from '@takram/three-atmosphere/webgpu'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description, TilesAttribution } from '../components/Description'
import { Globe } from '../components/Globe'
import { GlobeControls } from '../components/GlobeControls'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControls,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  outputPassArgs,
  outputPassArgTypes,
  useOutputPassControls,
  type OutputPassArgs
} from '../controls/outputPassControls'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { usePointOfView, type PointOfViewProps } from '../hooks/usePointOfView'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'

const Content: FC<StoryProps> = ({
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
  const overlayScene = useMemo(() => new Scene(), [])

  const atmosphereContext = useResource(() => new AtmosphereContext(), [])
  atmosphereContext.camera = camera

  useLayoutEffect(() => {
    renderer.contextNode = context({
      ...renderer.contextNode.value,
      getAtmosphere: () => atmosphereContext
    })
  }, [renderer, atmosphereContext])

  // Post-processing:

  const passNode = useResource(
    () =>
      pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output: diffuseColor,
          normal: normalView,
          velocity: highpVelocity
        })
      ),
    [scene, camera]
  )

  const colorNode = passNode.getTextureNode('output')
  const depthNode = passNode.getTextureNode('depth')
  const normalNode = passNode.getTextureNode('normal')
  const velocityNode = passNode.getTextureNode('velocity')

  const aerialNode = useResource(
    () => aerialPerspective(colorNode.mul(2 / 3), depthNode, normalNode),
    [colorNode, depthNode, normalNode]
  )

  const lensFlareNode = useResource(() => lensFlare(aerialNode), [aerialNode])

  const toneMappingNode = useResource(
    () => toneMapping(AgXToneMapping, uniform(0), lensFlareNode),
    [lensFlareNode]
  )

  const taaNode = useResource(
    () => temporalAntialias(toneMappingNode, depthNode, velocityNode, camera),
    [camera, depthNode, velocityNode, toneMappingNode]
  )

  const overlayPassNode = useResource(
    () =>
      pass(overlayScene, camera, {
        samples: 0,
        depthBuffer: false
      }),
    [camera, overlayScene]
  )

  const postProcessing = useResource(
    () =>
      new PostProcessing(
        renderer,
        taaNode
          .add(dithering)
          .mul(overlayPassNode.a.oneMinus())
          .add(overlayPassNode)
      ),
    [renderer, taaNode, overlayPassNode]
  )

  useTransientControl(
    ({
      transmittance,
      inscatter,
      showGround,
      raymarchScattering
    }: StoryArgs) => ({
      transmittance,
      inscatter,
      showGround,
      raymarchScattering
    }),
    ({ transmittance, inscatter, showGround, raymarchScattering }) => {
      aerialNode.transmittance = transmittance
      aerialNode.inscatter = inscatter
      atmosphereContext.showGround = showGround
      atmosphereContext.raymarchScattering = raymarchScattering
      postProcessing.needsUpdate = true
    }
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass controls:
  useOutputPassControls(
    postProcessing,
    passNode,
    (outputNode, outputColorTransform) => {
      postProcessing.outputNode = outputNode
      postProcessing.outputColorTransform = outputColorTransform
      postProcessing.needsUpdate = true
    }
  )

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    postProcessing.needsUpdate = true
  })

  // Apply the initial point of view.
  usePointOfView({
    longitude,
    latitude,
    height,
    heading,
    pitch,
    distance
  })

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
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

  // Google Maps API key:
  const apiKey = useControl(({ googleMapsApiKey }: StoryArgs) =>
    googleMapsApiKey !== '' ? googleMapsApiKey : undefined
  )

  return (
    <Globe apiKey={apiKey}>
      <GlobeControls enableDamping overlayScene={overlayScene} />
    </Globe>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {
  googleMapsApiKey: string
  transmittance: boolean
  inscatter: boolean
  showGround: boolean
  raymarchScattering: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas>
    <Content {...props} />
    <Description>
      <TilesAttribution />
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  googleMapsApiKey: '',
  transmittance: true,
  inscatter: true,
  showGround: false,
  raymarchScattering: true,
  ...localDateArgs(),
  ...toneMappingArgs(),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  googleMapsApiKey: { control: 'text' },
  transmittance: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  },
  inscatter: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  },
  showGround: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  },
  raymarchScattering: {
    control: {
      type: 'boolean'
    },
    table: { category: 'aerial perspective' }
  },
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes(),
  ...rendererArgTypes()
}
