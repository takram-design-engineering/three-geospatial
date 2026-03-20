import { OrbitControls } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { useLayoutEffect, type FC } from 'react'
import { AgXToneMapping, TextureLoader } from 'three'
import {
  context,
  mix,
  mrt,
  normalWorld,
  output,
  pass,
  texture,
  toneMapping,
  uniform,
  uv,
  vec2,
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
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid } from '@takram/three-geospatial'
import { EllipsoidMesh } from '@takram/three-geospatial/r3f'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias,
  type Node
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

interface BlueMarbleParams {
  sunDirection: Node<'float'>
  cloudAlbedo?: number
  cloudShadowOffset?: number // In UV
  oceanRoughness?: number
  oceanIOR?: number
  emissiveColor?: Node<'vec3'>
}

const blueMarble = ({
  sunDirection,
  cloudAlbedo = 0.95,
  cloudShadowOffset = 0.00075,
  oceanRoughness = 0.4,
  oceanIOR = 1.33,
  emissiveColor = vec3(1, 0.6, 0.5).mul(0.002)
}: BlueMarbleParams): MeshPhysicalNodeMaterialParameters => {
  const colorTexture = new TextureLoader().load('public/blue_marble/color.webp')
  const oceanTexture = new TextureLoader().load('public/blue_marble/ocean.webp')
  const cloudsTexture = new TextureLoader().load(
    'public/blue_marble/clouds.webp'
  )
  const emissiveTexture = new TextureLoader().load(
    'public/blue_marble/emissive.webp'
  )
  colorTexture.anisotropy = 16
  oceanTexture.anisotropy = 16
  cloudsTexture.anisotropy = 16
  emissiveTexture.anisotropy = 16

  // Project the sunlight onto the sphere (normal tangent).
  const east = vec3(0, 0, 1).cross(normalWorld).normalize().toConst()
  const north = normalWorld.cross(east).normalize()
  const uvOffset = vec2(
    sunDirection.dot(east).mul(cloudShadowOffset),
    sunDirection.dot(north).mul(cloudShadowOffset)
  )

  const clouds = texture(cloudsTexture).r
  const shadow = texture(cloudsTexture, uv().add(uvOffset)).r
  const color = texture(colorTexture).rgb
  const ocean = texture(oceanTexture).r
  return {
    colorNode: mix(color, vec3(cloudAlbedo), clouds),
    emissiveNode: texture(emissiveTexture).r.mul(emissiveColor),
    roughnessNode: ocean.remap(1, 0, oceanRoughness, 1),
    ior: oceanIOR,
    receivedShadowNode: () => shadow.sub(clouds).saturate().oneMinus()
  }
}

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
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

  const passNode = useResource(
    () =>
      pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output,
          velocity: highpVelocity
        })
      ),
    [scene, camera]
  )

  const colorNode = passNode.getTextureNode('output')
  const depthNode = passNode.getTextureNode('depth')
  const velocityNode = passNode.getTextureNode('velocity')

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
    () =>
      temporalAntialias(highpVelocity)(
        toneMappingNode,
        depthNode,
        velocityNode,
        camera
      ),
    [camera, depthNode, velocityNode, toneMappingNode]
  )

  const postProcessing = useResource(
    () => new PostProcessing(renderer, taaNode.add(dithering)),
    [renderer, taaNode]
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

  const material = useResource(
    () =>
      new MeshPhysicalNodeMaterial(
        blueMarble({ sunDirection: atmosphereContext.sunDirectionECEF })
      ),
    [atmosphereContext.sunDirectionECEF]
  )

  return (
    <>
      <atmosphereLight castShadow />
      <OrbitControls minDistance={1.2e7} enablePan={false} />
      <EllipsoidMesh
        args={[Ellipsoid.WGS84.radii, 360, 180]}
        material={material}
        receiveShadow
      />
    </>
  )
}

interface StoryProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    shadows
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
