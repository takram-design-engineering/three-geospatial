import { OrbitControls, Plane, Sphere } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { Suspense, useMemo, useRef, type FC } from 'react'
import { BackSide, Matrix3, NeutralToneMapping, Vector3 } from 'three'
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js'
import {
  cameraViewMatrix,
  color,
  mix,
  mrt,
  output,
  pass,
  toneMapping,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  RectAreaLightNode,
  type Renderer
} from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { remapClamped } from '@takram/three-geospatial'
import {
  dithering,
  highpVelocity,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Attribution, Description } from '../components/Description'
import {
  LittlestTokyo,
  type LittlestTokyoApi
} from '../components/LittlestTokyo'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControls,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  locationArgs,
  locationArgTypes,
  useLocationControls,
  type LocationArgs
} from '../controls/locationControls'
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
    meshLambertNodeMaterial: ThreeElement<typeof MeshLambertNodeMaterial>
  }
}

extend({ AtmosphereLight, MeshLambertNodeMaterial })

RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())

const vector = new Vector3()
const rotation = new Matrix3()
const up = new Vector3(0, 1, 0)

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

      const toneMappingNode = manage(
        toneMapping(NeutralToneMapping, uniform(0), colorNode)
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
    [renderer, scene, camera]
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

  // Location controls:
  useLocationControls(context.matrixWorldToECEF.value)

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

  const alphaNode = useMemo(() => uniform(0), [])
  const colorNode = useMemo(
    () => mix(color('#bfe3dd'), color('#ffffff'), alphaNode),
    [alphaNode]
  )

  // Toggles the lights in the model:
  const modelRef = useRef<LittlestTokyoApi>(null)
  useGuardedFrame(() => {
    const { matrixWorldToECEF, sunDirectionECEF } = context
    const sunDirectionWorld = vector
      .copy(sunDirectionECEF.value)
      .applyMatrix3(
        rotation.setFromMatrix4(matrixWorldToECEF.value).transpose()
      )
    const cosSun = sunDirectionWorld.dot(up)
    modelRef.current?.setLightIntensity(cosSun < 0.1 ? 1 : 0)
    alphaNode.value = remapClamped(cosSun, 0.1, 0)
  })

  return (
    <>
      <atmosphereLight
        args={[context, 5]}
        castShadow
        shadow-normalBias={0.1}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach='shadow-camera'
          top={4}
          bottom={-4}
          left={-4}
          right={4}
          near={0}
          far={600}
        />
      </atmosphereLight>
      <OrbitControls
        target={[0, 1.5, 0]}
        minDistance={5}
        maxPolarAngle={Math.PI / 2}
      />
      <Plane args={[500, 500]} rotation-x={-Math.PI / 2} receiveShadow>
        <meshLambertNodeMaterial colorNode={colorNode} />
      </Plane>
      <Sphere args={[500]}>
        <meshLambertNodeMaterial
          colorNode={colorNode}
          normalNode={cameraViewMatrix.mul(vec4(vec3(0, 1, 0), 0)).xyz}
          side={BackSide}
        />
      </Sphere>
      <Suspense>
        <LittlestTokyo ref={modelRef} scale={0.01} />
      </Suspense>
    </>
  )
}

interface StoryProps {}

interface StoryArgs
  extends OutputPassArgs,
    ToneMappingArgs,
    LocationArgs,
    LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    renderer={{
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{ fov: 50, position: [5, 3, 9] }}
    shadows
  >
    <Content {...props} />
    <Description color='black'>
      <Attribution>Model: Littlest Tokyo / Glen Fox</Attribution>
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 10
  }),
  ...locationArgs({
    longitude: 0,
    latitude: 35,
    height: 0
  }),
  ...toneMappingArgs({
    toneMappingExposure: 10,
    toneMapping: NeutralToneMapping
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasNormal: false
  }),
  ...rendererArgTypes()
}

export default Story
