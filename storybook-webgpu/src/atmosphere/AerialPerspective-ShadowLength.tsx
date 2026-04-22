import { Box } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC
} from 'react'
import { AgXToneMapping, Scene } from 'three'
import { CSMHelper } from 'three/examples/jsm/csm/CSMHelper.js'
import {
  bool,
  context,
  mrt,
  output,
  pass,
  toneMapping,
  uniform,
  uv,
  vec2,
  vec3,
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
  type ShadowLengthNode,
  type SkyNode
} from '@takram/three-atmosphere/webgpu'
import { radians } from '@takram/three-geospatial'
import { EastNorthUpFrame } from '@takram/three-geospatial/r3f'
import {
  CascadedShadowMapsNode,
  dithering,
  FnVar,
  highpVelocity,
  lensFlare,
  temporalAntialias,
  viewZ,
  type Node
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { GlobeControls } from '../components/GlobeControls'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { PLATEAU_TERRAIN_API_TOKEN } from '../constants'
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
import { CesiumIonTerrainPlugin } from '../plugins/CesiumIonTerrainPlugin'
import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'
import { TileMeshPropsPlugin } from '../plugins/TileMeshPropsPlugin'

const internalTextures = FnVar(
  (shadowLengthNode: ShadowLengthNode): Node<'vec3'> => {
    const {
      sliceEndpointsNode,
      coordinateNode,
      sliceUVDirectionNode,
      minMaxLevelsNode,
      epipolarShadowLengthNode
    } = shadowLengthNode
    const sliceEndpoints = sliceEndpointsNode.getTextureNode()
    const coordinate = coordinateNode.getTextureNode()
    const sliceUVDirection = sliceUVDirectionNode.getTextureNode()
    const minMaxLevels = minMaxLevelsNode.getTextureNode()
    const epipolarShadowLength = epipolarShadowLengthNode.getTextureNode()

    const uvNode = uv()
    const uv1 = vec4(uvNode, uvNode.sub(0.5)).mul(2).toConst()
    const uv2 = vec3(uv1.x, uv1.yy.sub(vec2(0, 0.5)).mul(2)).toConst()
    return uvNode.y
      .lessThan(0.5)
      .select(
        uvNode.x
          .lessThan(0.5)
          .select(
            uv1.y
              .lessThan(0.5)
              .select(
                sliceEndpoints.sample(uv2.xy),
                sliceUVDirection.sample(uv2.xz)
              ),
            coordinate.sample(uv1.zy)
          ),
        uvNode.x
          .lessThan(0.5)
          .select(
            minMaxLevels.sample(uv1.xw),
            vec3(epipolarShadowLength.sample(uv1.zw).xy, 0)
          )
      ).rgb
  }
)

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
    light.shadow.mapSize.width = 1024
    light.shadow.mapSize.height = 1024
    light.shadow.bias = 0.0001
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

  // Note that the shadow length is computed against the depths jittered by TAA,
  // causing temporal instability. But in practice, this is not noticeable.
  const shadowLengthNode = useResource(
    () => shadowLength(csmShadowNode, viewZNode),
    [csmShadowNode, viewZNode]
  )

  const aerialNode = useResource(
    () => aerialPerspective(colorNode, depthNode),
    [colorNode, depthNode]
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

  const { displayShadowLength, debugShadowLength } = useControl(
    ({ shadowLength, displayShadowLength, debugShadowLength }: StoryArgs) => ({
      displayShadowLength: shadowLength && displayShadowLength,
      debugShadowLength: shadowLength && debugShadowLength
    })
  )

  const postProcessing = useResource(() => {
    let outputNode: Node = taaNode
      .add(dithering)
      .mul(overlayPassNode.a.oneMinus())
      .add(overlayPassNode)

    // Useless conditionals to keep the main path in the graph:
    if (debugShadowLength) {
      outputNode = bool(true).select(
        internalTextures(shadowLengthNode),
        outputNode
      )
    } else if (displayShadowLength) {
      outputNode = bool(true).select(vec4(shadowLengthNode.rrr, 1), outputNode)
    }
    return new PostProcessing(renderer, outputNode)
  }, [
    renderer,
    shadowLengthNode,
    taaNode,
    overlayPassNode,
    displayShadowLength,
    debugShadowLength
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

  const updateHelperRef = useRef(true)
  useTransientControl(
    ({ updateHelper }: StoryArgs) => updateHelper,
    updateHelper => {
      updateHelperRef.current = updateHelper
    }
  )

  useGuardedFrame(() => {
    if (updateHelperRef.current) {
      csmHelper.update()
    }
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

  const csmHelper = useResource(
    () => new CSMHelper(csmShadowNode),
    [csmShadowNode]
  )

  const showHelper = useControl(({ showHelper }: StoryArgs) => showHelper)

  const [tilesScene, setTilesScene] = useState<Scene | null>(null)

  return (
    <>
      <primitive object={light} />
      {showHelper && <primitive object={csmHelper} />}
      <EastNorthUpFrame
        longitude={radians(longitude)}
        latitude={radians(latitude)}
        height={1000}
      >
        <Box
          args={[1000, 1000, 1000]}
          material={new MeshLambertNodeMaterial()}
          castShadow
        />
      </EastNorthUpFrame>
      <scene ref={setTilesScene}>
        <GlobeControls
          enableDamping
          scene={tilesScene}
          overlayScene={overlayScene}
        />
        <TilesRenderer>
          <TilesPlugin
            plugin={CesiumIonTerrainPlugin}
            args={{
              apiToken: PLATEAU_TERRAIN_API_TOKEN,
              assetId: 3258112, // PLATEAU terrain dataset
              autoRefreshToken: true
            }}
          />
          <TilesPlugin
            plugin={TileMaterialReplacementPlugin}
            args={() => new MeshLambertNodeMaterial()}
          />
          <TilesPlugin
            plugin={TileMeshPropsPlugin}
            args={{ castShadow: true, receiveShadow: true }}
          />
          <TilesPlugin plugin={TilesFadePlugin} />
        </TilesRenderer>
      </scene>
    </>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs
  extends
    OutputPassArgs,
    ToneMappingArgs,
    LocalDateArgs,
    ShadowLengthArgs,
    AtmosphereArgs {
  showHelper: boolean
  updateHelper: boolean
  debugShadowLength: boolean
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
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  showHelper: false,
  updateHelper: true,
  ...atmosphereArgs(),
  ...shadowLengthArgs(),
  debugShadowLength: false,
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...toneMappingArgs({
    toneMappingExposure: 5
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  showHelper: {
    control: {
      type: 'boolean'
    },
    table: { category: 'CSM' }
  },
  updateHelper: {
    control: {
      type: 'boolean'
    },
    table: { category: 'CSM' }
  },
  ...atmosphereArgTypes(),
  ...shadowLengthArgTypes(),
  debugShadowLength: {
    control: {
      type: 'boolean'
    },
    name: 'debug',
    table: { category: 'shadow length' }
  },
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasVelocity: true
  }),
  ...rendererArgTypes()
}
