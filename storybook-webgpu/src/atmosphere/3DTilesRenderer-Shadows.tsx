import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { TilesPlugin } from '3d-tiles-renderer/r3f'
import { useEffect, useLayoutEffect, useMemo, type FC } from 'react'
import { AgXToneMapping, Scene } from 'three'
import {
  bool,
  context,
  mrt,
  output,
  pass,
  toneMapping,
  uniform,
  vec4
} from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  AtmosphereParameters,
  shadowLength,
  type SkyNode
} from '@takram/three-atmosphere/webgpu'
import {
  CascadedShadowMapsNode,
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias,
  viewZ,
  type Node
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
import { TileMeshPropsPlugin } from '../plugins/TileMeshPropsPlugin'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

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

  const atmosphereContext = useResource(() => {
    const parameters = new AtmosphereParameters()
    parameters.higherOrderScatteringTexture = true
    return new AtmosphereContext(parameters)
  }, [])
  atmosphereContext.camera = camera

  useLayoutEffect(() => {
    renderer.contextNode = context({
      ...renderer.contextNode.value,
      getAtmosphere: () => atmosphereContext
    })
  }, [renderer, atmosphereContext])

  const [light, csmShadowNode] = useMemo(() => {
    const light = new AtmosphereLight()
    light.castShadow = true
    light.shadow.mapSize.width = 2048
    light.shadow.mapSize.height = 2048
    light.shadow.camera.near = 0
    light.shadow.camera.far = 3e5

    const csmNode = new CascadedShadowMapsNode(light)
    csmNode.cascadeCount = 3
    csmNode.maxFar = 5e4
    csmNode.fade = true
    csmNode.lightMargin = 1e5
    light.shadow.shadowNode = csmNode

    return [light, csmNode]
  }, [])

  useEffect(() => {
    return () => {
      light.dispose()
    }
  }, [light])

  // Post-processing:

  const passNode = useResource(
    () =>
      pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output,
          velocity: highpVelocity,
          viewZ
        })
      ),
    [scene, camera]
  )

  const colorNode = passNode.getTextureNode('output')
  const depthNode = passNode.getTextureNode('depth')
  const velocityNode = passNode.getTextureNode('velocity')
  const viewZNode = passNode.getTextureNode('viewZ')

  const shadowLengthNode = useResource(
    () => shadowLength(csmShadowNode, viewZNode),
    [csmShadowNode, viewZNode]
  )

  const aerialNode = useResource(
    () =>
      aerialPerspective(
        colorNode.mul(2 / 3),
        depthNode,
        null,
        shadowLengthNode
      ),
    [colorNode, depthNode, shadowLengthNode]
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

  const displayShadowLength = useControl(
    ({ shadowLength, displayShadowLength }: StoryArgs) =>
      shadowLength && displayShadowLength
  )

  const postProcessing = useResource(() => {
    let outputNode: Node = taaNode
      .add(dithering)
      .mul(overlayPassNode.a.oneMinus())
      .add(overlayPassNode)

    // Useless conditionals to keep the main path in the graph:
    if (displayShadowLength) {
      outputNode = bool(true).select(vec4(shadowLengthNode.rrr, 1), outputNode)
    }
    return new PostProcessing(renderer, outputNode)
  }, [
    renderer,
    shadowLengthNode,
    taaNode,
    overlayPassNode,
    displayShadowLength
  ])

  useTransientControl(
    ({ shadowLength }: StoryArgs) => shadowLength,
    value => {
      aerialNode.shadowLengthNode = value ? shadowLengthNode : null
      const skyNode = aerialNode.skyNode as SkyNode
      skyNode.shadowLengthNode = value ? shadowLengthNode : null
      postProcessing.needsUpdate = true
    }
  )

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

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
    <>
      <primitive object={light} />
      <Globe
        apiKey={apiKey}
        materialHandler={() => new MeshLambertNodeMaterial()}
      >
        <GlobeControls enableDamping overlayScene={overlayScene} />
        <TilesPlugin
          plugin={TileMeshPropsPlugin}
          args={{ castShadow: true, receiveShadow: true }}
        />
      </Globe>
    </>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {
  googleMapsApiKey: string
  transmittance: boolean
  inscatter: boolean
  showGround: boolean
  raymarchScattering: boolean
  shadowLength: boolean
  displayShadowLength: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    shadows
    renderer={{
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
  >
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
  shadowLength: true,
  displayShadowLength: false,
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
  shadowLength: {
    control: {
      type: 'boolean'
    },
    name: 'enable',
    table: { category: 'shadow length' }
  },
  displayShadowLength: {
    control: {
      type: 'boolean'
    },
    name: 'display',
    table: { category: 'shadow length' }
  },
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes(),
  ...rendererArgTypes()
}
