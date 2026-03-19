import { useFrame, useThree } from '@react-three/fiber'
import {
  GLTFCesiumRTCExtension,
  GLTFExtensionsPlugin
} from '3d-tiles-renderer/plugins'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import { Suspense, useLayoutEffect, useMemo, type FC } from 'react'
import { DirectionalLight, Scene } from 'three'
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { builtinShadowContext, mrt, pass, screenUV } from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'
import {
  dithering,
  highpVelocity,
  screenSpaceShadow,
  ScreenSpaceShadowNode,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { GlobeControls } from '../components/GlobeControls'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { PLATEAU_TERRAIN_API_TOKEN } from '../constants'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import { useControl } from '../hooks/useControl'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'
import { CesiumIonTerrainPlugin } from '../plugins/CesiumIonTerrainPlugin'
import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'
import { TileMeshPropsPlugin } from '../plugins/TileMeshPropsPlugin'

const gltfLoader = new GLTFLoader()
gltfLoader.register(() => new GLTFCesiumRTCExtension())
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
const ktx2loader = new KTX2Loader()

const geodetic = new Geodetic(radians(139.7528), radians(35.6852), 0)
const position = geodetic.toECEF()

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const terrainScene = useMemo(() => new Scene(), [])
  const overlayScene = useMemo(() => new Scene(), [])

  const light = useResource(() => {
    const light = new DirectionalLight(0xffffff, 10)
    light.position.set(0.3, 1, 0)
    light.castShadow = true
    light.shadow.mapSize.width = 2048
    light.shadow.mapSize.height = 2048
    light.shadow.camera.near = 1
    light.shadow.camera.far = 10000
    light.shadow.camera.top = 1000
    light.shadow.camera.bottom = -1000
    light.shadow.camera.left = -1000
    light.shadow.camera.right = 1000
    light.shadow.bias = -0.001

    const csmNode = new CSMShadowNode(light)
    csmNode.cascades = 3
    csmNode.maxFar = 5000
    csmNode.fade = true
    light.shadow.shadowNode = csmNode // CSMShadowNode is disposed by DirectionalLight's dispose

    return light
  }, [])

  const { enabled } = useControl(({ enabled }: StoryArgs) => ({ enabled }))

  const prePassNode = useResource(
    () =>
      pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output: highpVelocity
        })
      ),
    [scene, camera]
  )

  const sssNode = useResource(() => {
    const depthNode = prePassNode.getTextureNode('depth')
    return screenSpaceShadow(depthNode, camera, light)
  }, [camera, light, prePassNode])

  const passNode = useResource(
    () => pass(scene, camera, { samples: 0 }),
    [scene, camera]
  )

  useLayoutEffect(() => {
    if (enabled) {
      const sssSample = sssNode.getTextureNode().sample(screenUV).r
      const sssContext = builtinShadowContext(sssSample, light)
      passNode.contextNode = sssContext
    } else {
      passNode.contextNode = null
    }
    passNode.needsUpdate = true
  }, [light, passNode, sssNode, enabled])

  const taaNode = useResource(
    () =>
      temporalAntialias(highpVelocity)(
        passNode,
        prePassNode.getTextureNode('depth'),
        prePassNode.getTextureNode('output'),
        camera
      ),
    [camera, prePassNode, passNode]
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

  useFrame(() => {
    postProcessing.render()
  }, 1)

  useTransientControl(
    ({ thickness, shadowContrast, shadowIntensity }: StoryArgs) => ({
      thickness,
      shadowContrast,
      shadowIntensity
    }),
    ({ thickness, shadowContrast, shadowIntensity }) => {
      if (sssNode instanceof ScreenSpaceShadowNode) {
        sssNode.thickness.value = thickness
        sssNode.shadowContrast.value = shadowContrast
        sssNode.shadowIntensity.value = shadowIntensity
      }
    }
  )

  useTransientControl(
    ({ sampleCount, hardShadowSamples, fadeOutSamples }: StoryArgs) => ({
      sampleCount,
      hardShadowSamples,
      fadeOutSamples
    }),
    ({ sampleCount, hardShadowSamples, fadeOutSamples }) => {
      if (sssNode instanceof ScreenSpaceShadowNode) {
        sssNode.sampleCount = sampleCount
        sssNode.hardShadowSamples = hardShadowSamples
        sssNode.fadeOutSamples = fadeOutSamples

        // SSSNode lives inside passNode, not in postProcessing.
        passNode.needsUpdate = true
      }
    }
  )

  useLayoutEffect(() => {
    const pov = new PointOfView(4800, radians(-160), radians(-70))
    pov.decompose(position, camera.position, camera.quaternion, camera.up)
  }, [camera])

  return (
    <>
      <color args={[0xf7f7f7]} attach='background' />
      <ambientLight intensity={0.5} />
      <primitive object={light} />
      <GlobeControls
        enableDamping
        scene={terrainScene} // Raycasting is too heavy for the 3D Tiles below
        overlayScene={overlayScene}
      />
      <primitive object={terrainScene}>
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
            args={{
              receiveShadow: true,
              castShadow: true
            }}
          />
          <TilesPlugin plugin={TilesFadePlugin} />
        </TilesRenderer>
      </primitive>
      {[
        '8e/7f78b4-ea0e-49e4-bab6-54b30d4aa4e8/13101_chiyoda-ku_pref_2023_citygml_2_op_bldg_3dtiles_13101_chiyoda-ku_lod1',
        '88/4d2bdc-741f-49ca-9c1e-ed5e8dbf6dfb/13102_chuo-ku_pref_2023_citygml_2_op_bldg_3dtiles_13102_chuo-ku_lod1',
        '1c/d53c9f-a0ac-402c-ab42-c4cc484e0a73/13103_minato-ku_pref_2023_citygml_2_op_bldg_3dtiles_13103_minato-ku_lod1',
        '4e/7533a5-7c1d-467f-9a44-368266ba80ba/13104_shinjuku-ku_pref_2023_citygml_2_op_bldg_3dtiles_13104_shinjuku-ku_lod1',
        'b0/bfce70-5d10-4a70-a313-4dd6311352a9/13113_shibuya-ku_pref_2023_citygml_2_op_bldg_3dtiles_13113_shibuya-ku_lod1',
        '6f/e8f513-57fe-4510-8d8a-43783f7d482e/13105_bunkyo-ku_pref_2023_citygml_2_op_bldg_3dtiles_13105_bunkyo-ku_lod1',
        '6b/a3ca89-1a1b-472f-b013-edc7758e24f8/13106_taito-ku_city_2024_citygml_1_op_bldg_3dtiles_13106_taito-ku_lod1'
      ].map(path => (
        <TilesRenderer
          key={path}
          url={`https://assets.cms.plateau.reearth.io/assets/${path}/tileset.json`}
        >
          <TilesPlugin
            plugin={GLTFExtensionsPlugin}
            dracoLoader={dracoLoader}
            ktxLoader={ktx2loader}
            rtc
          />
          <TilesPlugin
            plugin={TileMaterialReplacementPlugin}
            args={() => new MeshLambertNodeMaterial({ color: 0xcccccc })}
          />
          <TilesPlugin
            plugin={TileMeshPropsPlugin}
            args={{
              receiveShadow: true,
              castShadow: true
            }}
          />
        </TilesRenderer>
      ))}
    </>
  )
}

interface StoryProps {}

interface StoryArgs {
  enabled: boolean
  thickness: number
  shadowContrast: number
  shadowIntensity: number
  sampleCount: number
  hardShadowSamples: number
  fadeOutSamples: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas shadows>
    <Suspense>
      <Content {...props} />
    </Suspense>
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  enabled: true,
  thickness: 0.02,
  shadowContrast: 4,
  shadowIntensity: 1,
  sampleCount: 60,
  hardShadowSamples: 4,
  fadeOutSamples: 8,
  ...rendererArgs()
}

Story.argTypes = {
  enabled: {
    control: {
      type: 'boolean'
    }
  },
  thickness: {
    control: {
      type: 'range',
      min: 0.001,
      max: 0.02,
      step: 0.0001
    }
  },
  shadowContrast: {
    control: {
      type: 'range',
      min: 1,
      max: 4,
      step: 0.1
    }
  },
  shadowIntensity: {
    control: {
      type: 'range',
      min: 0,
      max: 1,
      step: 0.01
    }
  },
  sampleCount: {
    control: {
      type: 'range',
      min: 1,
      max: 120
    }
  },
  hardShadowSamples: {
    control: {
      type: 'range',
      min: 0,
      max: 8
    }
  },
  fadeOutSamples: {
    control: {
      type: 'range',
      min: 0,
      max: 16
    }
  },
  ...rendererArgTypes()
}

export default Story
