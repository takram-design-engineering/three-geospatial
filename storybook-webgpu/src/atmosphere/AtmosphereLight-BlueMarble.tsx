import { OrbitControls } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { useMemo, type FC } from 'react'
import { TextureLoader, Vector3 } from 'three'
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
  AtmosphereLight,
  AtmosphereLightNode,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid } from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'

import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControl,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  outputPassArgs,
  outputPassArgTypes,
  useOutputPassControl,
  type OutputPassArgs
} from '../controls/outputPassControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControl,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
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

  const sunDirectionECEF = useMemo(() => new Vector3(), [])

  // Post-processing:

  const [postProcessing, passNode, lutNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera)

    const lutNode = atmosphereLUT()

    const aerialNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      null,
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, lutNode, aerialNode]
  }, [renderer, scene, camera])

  aerialNode.light = false
  aerialNode.sunDirectionECEF = sunDirectionECEF

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass control:
  useOutputPassControl(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.needsUpdate = true
  })

  // Tone mapping control:
  useToneMappingControl(() => {
    postProcessing.needsUpdate = true
  })

  // Local date control (depends on the longitude of the location):
  useLocalDateControl(0, date => {
    getSunDirectionECEF(date, sunDirectionECEF)
  })

  return (
    <>
      <atmosphereLight
        ref={light => {
          if (light != null) {
            // Share the references to sync updates with the light.
            light.sunDirectionECEF = sunDirectionECEF
          }
        }}
        lutNode={lutNode}
      />
      <OrbitControls minDistance={1.2e7} enablePan={false} />
      <EllipsoidMesh
        args={[Ellipsoid.WGS84.radii, 512, 256]}
        material={useMemo(() => new MeshPhysicalNodeMaterial(blueMarble()), [])}
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
  ...outputPassArgs,
  ...toneMappingArgs,
  ...localDateArgs,
  toneMappingExposure: 4,
  dayOfYear: 180,
  timeOfDay: 4
}

Story.argTypes = {
  ...outputPassArgTypes,
  ...toneMappingArgTypes,
  ...localDateArgTypes
}

export default Story
