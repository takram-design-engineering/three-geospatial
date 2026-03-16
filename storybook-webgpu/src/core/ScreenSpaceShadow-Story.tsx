import { OrbitControls, Plane } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, type FC } from 'react'
import { DirectionalLight, Mesh } from 'three'
import { sss } from 'three/addons/tsl/display/SSSNode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { builtinShadowContext, mrt, pass, screenUV, velocity } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import {
  screenSpaceShadow,
  ScreenSpaceShadowNode
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import { useControl } from '../hooks/useControl'
import { useGLTF } from '../hooks/useGLTF'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'

const Model: FC = () => {
  const gltf = useGLTF('public/nemetona.glb')

  useLayoutEffect(() => {
    const model = gltf.scene
    model.rotation.y = Math.PI
    model.scale.setScalar(10)
    model.position.y = 0.45
    model.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = true
        object.receiveShadow = true
        object.material.aoMap = null // Remove AO to better see the effect of shadows
      }
    })
  }, [gltf])

  return <primitive object={gltf.scene} />
}

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const light = useMemo(() => {
    const light = new DirectionalLight(0xffffff, 3)
    light.position.set(-3, 10, -10)
    light.castShadow = true
    light.shadow.camera.top = 4
    light.shadow.camera.bottom = -4
    light.shadow.camera.left = -4
    light.shadow.camera.right = 4
    light.shadow.camera.near = 0.1
    light.shadow.camera.far = 40
    light.shadow.bias = -0.001
    light.shadow.mapSize.width = 1024
    light.shadow.mapSize.height = 1024
    return light
  }, [])

  useEffect(() => {
    return () => {
      light.dispose()
    }
  }, [light])

  const { enabled, useAddon } = useControl(
    ({ enabled, useAddon }: StoryArgs) => ({ enabled, useAddon })
  )

  const [postProcessing, passNode, sssNode] = useResource(
    manage => {
      const prePassNode = manage(
        pass(scene, camera, { samples: 0 }).setMRT(
          mrt({
            output: velocity
          })
        )
      )
      const depthNode = prePassNode.getTextureNode('depth')
      const velocityNode = prePassNode.getTextureNode('output')

      const sssNode = useAddon
        ? sss(depthNode, camera, light)
        : screenSpaceShadow(depthNode, camera, light)
      const sssSample = sssNode.getTextureNode().sample(screenUV).r
      const sssContext = builtinShadowContext(sssSample, light)

      const passNode = pass(scene, camera, { samples: 0 })
      if (enabled) {
        passNode.contextNode = sssContext
      }

      const taaNode = manage(traa(passNode, depthNode, velocityNode, camera))

      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode

      return [postProcessing, passNode, sssNode]
    },
    [renderer, scene, camera, light, enabled, useAddon]
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

  return (
    <>
      <hemisphereLight args={[0xffffff, 0x8d8d8d, 2]} position={[0, 20, 0]} />
      <OrbitControls
        minDistance={1}
        maxDistance={20}
        target={[0, 2, 0]}
        enableDamping
      />
      <color args={[0xa0a0a0]} attach='background' />
      <fog args={[0xa0a0a0, 10, 50]} attach='fog' />
      <primitive object={light} />
      <Plane args={[100, 100]} rotation-x={-Math.PI / 2} receiveShadow>
        <meshPhongMaterial color={0xcbcbcb} />
      </Plane>
      <Suspense>
        <Model />
      </Suspense>
    </>
  )
}

interface StoryProps {}

interface StoryArgs {
  enabled: boolean
  useAddon: boolean
  thickness: number
  shadowContrast: number
  shadowIntensity: number
  sampleCount: number
  hardShadowSamples: number
  fadeOutSamples: number
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas shadows camera={{ fov: 45, position: [1, 2.5, -3.5] }}>
    <Suspense>
      <Content {...props} />
    </Suspense>
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  enabled: true,
  useAddon: false,
  thickness: 0.005,
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
  useAddon: {
    control: {
      type: 'boolean'
    }
  },
  thickness: {
    control: {
      type: 'range',
      min: 0.001,
      max: 0.01,
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
