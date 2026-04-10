import { OrbitControls } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { useLayoutEffect, useMemo, type FC } from 'react'
import { AgXToneMapping, Vector3 } from 'three'
import {
  context,
  Fn,
  luminance,
  mix,
  mrt,
  mx_noise_float,
  output,
  pass,
  screenCoordinate,
  smoothstep,
  time,
  toneMapping,
  uniform,
  vec3
} from 'three/tsl'
import {
  MeshPhysicalNodeMaterial,
  PostProcessing,
  type Node,
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
  type SkyNode
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, radians, remap } from '@takram/three-geospatial'
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
import { useSpringControl } from '../hooks/useSpringControl'
import { blueMarble } from './Space-Story'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

// Film grain based on: https://github.com/mattdesl/glsl-film-grain/
const filmGrain = Fn(() => {
  const coord = screenCoordinate.mul(0.5).toConst()
  const offset = mx_noise_float(vec3(coord.div(2.5), time))
  const n1 = mx_noise_float(vec3(coord, offset))
  return n1.mul(0.5).add(0.5)
})

const blendSoftLight = Fn(([base, blend]: [Node, Node]) =>
  base.mul(base).mul(blend.mul(2).oneMinus()).add(base.mul(blend).mul(2))
)

const blendFilmGrain = Fn(([base, grain]: [Node, Node]) => {
  const luma = luminance(base.rgb)
  const blended = blendSoftLight(base.rgb, grain)
  const response = smoothstep(0.05, 0.5, luma)
  return mix(blended, luma, response.pow2())
})

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const atmosphereContext = useResource(() => {
    const parameters = new AtmosphereParameters()
    // Need more precise scattering at larger sun zenith angles.
    parameters.minCosLight = Math.cos(radians(120))
    return new AtmosphereContext(parameters)
  }, [])
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
  aerialNode.moonScattering = true
  const skyNode = aerialNode.skyNode! as SkyNode
  skyNode.starsNode.intensity.value = 0.001 // TODO: Find physically-correct value

  const lensFlareNode = useResource(() => lensFlare(aerialNode), [aerialNode])
  // Apply bloom on everything:
  lensFlareNode.thresholdNode.thresholdLevel.value = 0
  lensFlareNode.thresholdNode.thresholdRange.value = 0
  lensFlareNode.bloomIntensity.value = 0.3

  const toneMappingNode = useResource(
    () => toneMapping(AgXToneMapping, uniform(0), lensFlareNode),
    [lensFlareNode]
  )

  const taaNode = useResource(
    () => temporalAntialias(toneMappingNode, depthNode, velocityNode, camera),
    [camera, depthNode, velocityNode, toneMappingNode]
  )

  const filmGrainAlpha = useMemo(() => uniform(1), [])
  useSpringControl(
    ({ toneMappingExposure: exposure }: StoryArgs) => exposure,
    exposure => {
      filmGrainAlpha.value = remap(
        Math.log(exposure),
        Math.log(2),
        Math.log(1e5)
      )
    }
  )

  const postProcessing = useResource(
    () =>
      new PostProcessing(
        renderer,
        blendFilmGrain(
          taaNode.add(dithering),
          mix(0.5, filmGrain(), filmGrainAlpha)
        )
      ),
    [renderer, taaNode, filmGrainAlpha]
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
  useLocalDateControls(0, date => {
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
        blueMarble({
          sunDirection: atmosphereContext.sunDirectionECEF,
          emissiveColor: vec3(1, 0.6, 0.5).mul(0.000005)
        })
      ),
    [atmosphereContext.sunDirectionECEF]
  )

  return (
    <>
      <atmosphereLight castShadow />
      <atmosphereLight body='moon' />
      <OrbitControls enablePan={false} />
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
      reversedDepthBuffer: true,
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{
      fov: 57.2,
      position: new Vector3(1, -0.295, -0.03)
        .normalize()
        .multiplyScalar(1.63e7)
        .toArray(),
      up: new Vector3(0, 0.71, -1).normalize().toArray(),
      near: 1e4,
      far: 1e9
    }}
  >
    <Content {...props} />
    <Description>
      <p>
        This scene replicates a{' '}
        <a
          href='https://images.nasa.gov/details/art002e000192'
          target='_blank'
          rel='noreferrer'
        >
          photo (art002e000192)
        </a>
        , taken by a NASA astronaut during the Artemis II mission on April 3,
        2026 at 00:27:39 UTC. It was just past the full moon, resulting in a
        particularly clear image. This scene accounts for the direct light and
        atmospheric scattering of moonlight.
      </p>
      <p>
        Simulating ionospheric phenomena and the scattering of ground light
        within the atmosphere in real time is very difficult, so they are not
        included in this scene. Still, considering only moonlight produces a
        somewhat plausible result.
      </p>
      <Attribution>Imagery: NASA</Attribution>
      <Attribution>Ocean mask: Solar System Scope</Attribution>
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    year: 2026,
    dayOfYear: 93,
    timeOfDay: 0.46
  }),
  ...toneMappingArgs({
    toneMappingExposure: 1e5
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...toneMappingArgTypes({
    min: 2,
    max: 1e5
  }),
  ...outputPassArgTypes({
    hasNormal: false
  }),
  ...rendererArgTypes()
}
