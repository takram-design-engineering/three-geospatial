import { useTexture } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMotionValueEvent, useSpring } from 'motion/react'
import { useEvent } from 'react-use'
import { SRGBColorSpace, Vector2 } from 'three'
import {
  float,
  rtt,
  screenSize,
  screenUV,
  select,
  texture,
  uniform,
  uv,
  vec2
} from 'three/tsl'
import type { TextureNode } from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'

import { springOptions } from '../helpers/springOptions'
import { useResource } from '../hooks/useResource'

export function useFilterTextureNode(): TextureNode {
  const image = useTexture('public/seaside.webp')
  image.colorSpace = SRGBColorSpace
  image.flipY = false

  const [textureNode, offset] = useResource(() => {
    const imageAspect = float(image.width / image.height)
    const screenAspect = screenSize.x.div(screenSize.y)
    const scale = select(
      imageAspect.greaterThan(screenAspect),
      vec2(screenAspect.div(imageAspect), 1),
      vec2(1, imageAspect.div(screenAspect))
    )

    const offset = uniform(new Vector2())
    const offsetAmount = 0.05

    const textureNode = texture(image)
    textureNode.uvNode = uv()
      .mul(1 - offsetAmount)
      .add(offset.mul(offsetAmount))

    const rttNode = rtt(textureNode, image.width, image.height)
    rttNode.uvNode = screenUV.sub(0.5).mul(scale).add(0.5)

    return [rttNode, offset]
  }, [image])

  const motionOffsetX = useSpring(0, springOptions)
  const motionOffsetY = useSpring(0, springOptions)
  const canvas = useThree(({ gl }) => gl.domElement)
  useEvent(
    'mousemove',
    event => {
      reinterpretType<MouseEvent>(event)
      const x = (event.offsetX - canvas.offsetLeft) / canvas.offsetWidth
      const y = (event.offsetY - canvas.offsetTop) / canvas.offsetHeight
      motionOffsetX.set(x)
      motionOffsetY.set(y)
    },
    canvas
  )

  useMotionValueEvent(motionOffsetX, 'change', value => {
    offset.value.x = value - 0.5
  })
  useMotionValueEvent(motionOffsetY, 'change', value => {
    offset.value.y = value - 0.5
  })

  return textureNode
}
