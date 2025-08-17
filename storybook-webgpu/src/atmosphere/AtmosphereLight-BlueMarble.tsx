import { OrbitControls } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import type { FC } from 'react'
import { TextureLoader } from 'three'
import { mix, mul, pass, texture, uv, vec3 } from 'three/tsl'
import {
  MeshPhysicalNodeMaterial,
  PostProcessing,
  type MeshPhysicalNodeMaterialParameters,
  type Renderer
} from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid } from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'

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
import type { StoryFC } from '../helpers/createStory'
import { useGuardedFrame } from '../helpers/useGuardedFrame'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const context = useResource(() => new AtmosphereContext(), [])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera)

    const aerialNode = aerialPerspective(
      context,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth')
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, aerialNode]
  }, [renderer, scene, camera, context])

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass controls:
  useOutputPassControls(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.outputColorTransform = outputNode == null
    postProcessing.needsUpdate = true
  })

  // Tone mapping controls:
  useToneMappingControls(() => {
    postProcessing.needsUpdate = true
  })

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(date => {
    getSunDirectionECEF(date, context.sunDirectionECEF)
  })

  return (
    <>
      <atmosphereLight args={[context]} />
      <OrbitControls minDistance={1.2e7} enablePan={false} />
      <EllipsoidMesh
        args={[Ellipsoid.WGS84.radii, 512, 256]}
        material={useResource(
          () => new MeshPhysicalNodeMaterial(blueMarble()),
          []
        )}
      />
    </>
  )
}

const blueMarble = ({
  cloudAlbedo = 0.95,
  oceanRoughness = 0.4,
  oceanIOR = 1.33,
  emissiveColor = vec3(1, 0.6, 0.5).mul(0.002)
} = {}): MeshPhysicalNodeMaterialParameters => {
  const color = new TextureLoader().load('public/blue_marble/color.webp')
  const ocean = new TextureLoader().load('public/blue_marble/ocean.webp')
  const clouds = new TextureLoader().load('public/blue_marble/clouds.webp')
  const emissive = new TextureLoader().load('public/blue_marble/emissive.webp')
  color.anisotropy = 16
  ocean.anisotropy = 16
  clouds.anisotropy = 16
  emissive.anisotropy = 16

  return {
    colorNode: mix(
      texture(color).sample(uv()).rgb,
      vec3(cloudAlbedo),
      texture(clouds).sample(uv()).r
    ),
    emissiveNode: texture(emissive).sample(uv()).r.mul(emissiveColor),
    roughnessNode: mul(
      texture(ocean).sample(uv()).r,
      texture(clouds).sample(uv()).r.oneMinus()
    ).remap(1, 0, oceanRoughness, 1),
    ior: oceanIOR
  }
}

interface StoryProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    renderer={{
      logarithmicDepthBuffer: true,
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{
      fov: 60,
      position: [-2e7, 0, 0],
      up: [0, 0, 1],
      near: 1e4,
      far: 1e9
    }}
  >
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 180,
    timeOfDay: 4
  }),
  ...toneMappingArgs({
    toneMappingExposure: 2
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasNormal: false
  }),
  ...rendererArgTypes()
}

export default Story
