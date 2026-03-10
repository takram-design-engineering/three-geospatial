import { OrbitControls } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import type { FC } from 'react'
import { AgXToneMapping, TextureLoader } from 'three'
import {
  mix,
  mrt,
  mul,
  output,
  pass,
  texture,
  toneMapping,
  uniform,
  vec3
} from 'three/tsl'
import {
  MeshPhysicalNodeMaterial,
  PostProcessing,
  type MeshPhysicalNodeMaterialParameters,
  type Renderer
} from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid } from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Attribution, Description } from '../components/Description'
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
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const context = useResource(() => new AtmosphereContextNode(), [])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, toneMappingNode] = useResource(
    manage => {
      const passNode = manage(
        pass(scene, camera, { samples: 0 }).setMRT(
          mrt({
            output,
            velocity: highpVelocity
          })
        )
      )
      const colorNode = passNode.getTextureNode('output')
      const depthNode = passNode.getTextureNode('depth')
      const velocityNode = passNode.getTextureNode('velocity')

      const aerialNode = manage(
        aerialPerspective(context, colorNode, depthNode)
      )
      const lensFlareNode = manage(lensFlare(aerialNode))
      const toneMappingNode = manage(
        toneMapping(AgXToneMapping, uniform(0), lensFlareNode)
      )
      const taaNode = manage(
        temporalAntialias(highpVelocity)(
          toneMappingNode,
          depthNode,
          velocityNode,
          camera
        )
      )
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode.add(dithering)

      return [postProcessing, passNode, toneMappingNode]
    },
    [renderer, scene, camera, context]
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

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(date => {
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
  })

  return (
    <>
      <atmosphereLight args={[context]} />
      <OrbitControls minDistance={1.2e7} enablePan={false} />
      <EllipsoidMesh
        args={[Ellipsoid.WGS84.radii, 360, 180]}
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

  const oceanSubClouds = mul(texture(ocean).r, texture(clouds).r.oneMinus())
  return {
    colorNode: mix(texture(color).rgb, vec3(cloudAlbedo), texture(clouds).r),
    emissiveNode: texture(emissive).r.mul(emissiveColor),
    roughnessNode: oceanSubClouds.remap(1, 0, oceanRoughness, 1),
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
    <Content {...props} />
    <Description>
      <p>
        Creating a photorealistic globe is easy with @takram/three-atmosphere.
        This just renders a sphere with the 3 layers of textures from NASA's
        Blue Marble Collection and a few parameter adjustments to the physical
        material. Atmospheric scattering is rendered using{' '}
        <em>AerialPerspectiveNode</em> in the post-processing stage.
      </p>
      <p>
        Note that the atmosphere is thinner than you may expect, but in reality,
        it is just shy of 0.1% of Earth's radius.
      </p>
      <Attribution>Imagery: NASA</Attribution>
      <Attribution>Ocean mask: Solar System Scope</Attribution>
    </Description>
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
