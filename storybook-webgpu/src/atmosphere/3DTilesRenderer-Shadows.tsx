import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import type { TilesRenderer } from '3d-tiles-renderer'
import { TilesPlugin } from '3d-tiles-renderer/r3f'
import { useEffect, useLayoutEffect, useMemo, useRef, type FC } from 'react'
import { AgXToneMapping, Scene } from 'three'
import {
  bool,
  context,
  mrt,
  output,
  pass,
  toneMapping,
  uniform
} from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'
import invariant from 'tiny-invariant'

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
  viewZUnit,
  type SkyNode
} from '@takram/three-atmosphere/webgpu'
import {
  CascadedShadowMapsNode,
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias,
  type Node
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description, TilesAttribution } from '../components/Description'
import { Globe } from '../components/Globe'
import { GlobeControls } from '../components/GlobeControls'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import {
  atmosphereArgs,
  atmosphereArgTypes,
  type AtmosphereArgs
} from '../controls/atmosphereControls'
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
  shadowLengthArgs,
  shadowLengthArgTypes,
  type ShadowLengthArgs
} from '../controls/shadowLengthControls'
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
  distance,
  csmFar: shadowFar
}) => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)
  const overlayScene = useMemo(() => new Scene(), [])

  const higherOrderScatteringTexture = useControl(
    ({ higherOrderScatteringTexture }: StoryArgs) =>
      higherOrderScatteringTexture
  )
  const atmosphereParameters = useMemo(() => {
    const parameters = new AtmosphereParameters()
    parameters.higherOrderScatteringTexture = higherOrderScatteringTexture
    return parameters
  }, [higherOrderScatteringTexture])
  const atmosphereContext = useResource(
    () => new AtmosphereContext(atmosphereParameters),
    [atmosphereParameters]
  )

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
    light.shadow.mapSize.width = 1024
    light.shadow.mapSize.height = 1024
    light.shadow.camera.near = 0
    light.shadow.camera.far = shadowFar * 4

    const csmNode = new CascadedShadowMapsNode(light)
    csmNode.cascadeCount = 3
    csmNode.maxFar = shadowFar
    csmNode.fade = true
    csmNode.lightMargin = shadowFar * 2
    light.shadow.shadowNode = csmNode

    return [light, csmNode]
  }, [shadowFar])

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
          viewZUnit
        })
      ),
    [scene, camera]
  )

  const colorNode = passNode.getTextureNode('output')
  const depthNode = passNode.getTextureNode('depth')
  const velocityNode = passNode.getTextureNode('velocity')
  const viewZUnitNode = passNode.getTextureNode('viewZUnit')

  // Note that the shadow length is computed against the depths jittered by TAA,
  // causing temporal instability. But in practice, this is not noticeable.
  const shadowLengthNode = useResource(
    () => shadowLength(csmShadowNode, viewZUnitNode),
    [csmShadowNode, viewZUnitNode]
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
      outputNode = bool(true).select(
        shadowLengthNode.xxx
          .mul(1 / atmosphereContext.parameters.worldToUnit)
          .mul(0.0001), // 1 = 10 km
        outputNode
      )
    }
    return new PostProcessing(renderer, outputNode)
  }, [
    renderer,
    atmosphereContext,
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
      inscattering,
      showGround,
      raymarchScattering
    }: StoryArgs) => ({
      transmittance,
      inscattering,
      showGround,
      raymarchScattering
    }),
    ({ transmittance, inscattering, showGround, raymarchScattering }) => {
      aerialNode.transmittance = transmittance
      aerialNode.inscattering = inscattering
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

  // Make tiles outside the camera frustum but inside the shadow camera
  // frustum active. Note that doing this every frame is inefficient, but it's
  // hard to choose the right timing when the CSM allocates shadow cameras.
  const tilesRef = useRef<TilesRenderer | null>(null)
  useFrame(() => {
    const tiles = tilesRef.current
    if (tiles != null && csmShadowNode.lights.length > 0) {
      const { lights } = csmShadowNode
      const lastLight = lights[lights.length - 1]
      invariant(lastLight.shadow != null)
      tiles.setCamera(lastLight.shadow.camera)
      tiles.setResolution(lastLight.shadow.camera, lastLight.shadow.mapSize)
    }
  })

  // Google Maps API key:
  const apiKey = useControl(({ googleMapsApiKey }: StoryArgs) =>
    googleMapsApiKey !== '' ? googleMapsApiKey : undefined
  )

  return (
    <>
      <primitive object={light} />
      <Globe
        ref={tilesRef}
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

interface StoryProps extends PointOfViewProps {
  fov?: number
  csmFar: number
}

interface StoryArgs
  extends
    OutputPassArgs,
    ToneMappingArgs,
    LocalDateArgs,
    ShadowLengthArgs,
    AtmosphereArgs {
  googleMapsApiKey: string
}

export const Story: StoryFC<StoryProps, StoryArgs> = ({ fov, ...props }) => (
  <WebGPUCanvas
    shadows
    camera={{ fov }}
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
  ...atmosphereArgs({
    showGround: false
  }),
  ...shadowLengthArgs(),
  ...localDateArgs(),
  ...toneMappingArgs(),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  googleMapsApiKey: { control: 'text' },
  ...atmosphereArgTypes(),
  ...shadowLengthArgTypes(),
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasVelocity: true
  }),
  ...rendererArgTypes()
}
