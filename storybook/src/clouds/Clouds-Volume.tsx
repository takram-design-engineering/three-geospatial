import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { type StoryFn } from '@storybook/react'
import { type FC } from 'react'
import {
  BoxGeometry,
  Color,
  GLSL3,
  ShaderMaterial,
  Uniform,
  Vector3
} from 'three'

import { Texture3DLoader } from '@takram/three-geospatial'

import { useControls } from '../helpers/useControls'

// Modified version of https://threejs.org/examples/?q=cloud#webgl_volume_cloud

const vertexShader = /* glsl */ `
  out vec3 vOrigin;
  out vec3 vDirection;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;

  in vec3 vOrigin;
  in vec3 vDirection;

  out vec4 outputColor;

  uniform sampler3D map;
  uniform vec3 base;
  uniform float threshold;
  uniform float range;
  uniform float opacity;
  uniform float steps;
  uniform float frame;
  uniform float scale;

  uint hash(uint seed) {
    seed = seed ^ 61u ^ (seed >> 16u);
    seed *= 9u;
    seed = seed ^ (seed >> 4u);
    seed *= 0x27d4eb2du;
    seed = seed ^ (seed >> 15u);
    return seed;
  }

  float random(inout uint seed) {
    return float(hash(seed)) / 4294967296.0;
  }

  vec2 hitBox(vec3 origin, vec3 direction) {
    const vec3 minBox = vec3(-0.5);
    const vec3 maxBox = vec3(0.5);
    vec3 a = (minBox - origin) / direction;
    vec3 b = (maxBox - origin) / direction;
    vec3 minT = min(a, b);
    vec3 maxT = max(a, b);
    float t0 = max(minT.x, max(minT.y, minT.z));
    float t1 = min(maxT.x, min(maxT.y, maxT.z));
    return vec2(t0, t1);
  }

  float sampleTexture(vec3 uvw) {
    return texture(map, uvw * scale).r;
  }

  float shading(vec3 coord) {
    const float step = 0.005;
    return sampleTexture(coord + vec3(-step)) - sampleTexture(coord + vec3(step));
  }

  void main() {
    vec3 rayDirection = normalize(vDirection);
    vec2 bounds = hitBox(vOrigin, rayDirection);
    if (bounds.x > bounds.y) {
      discard;
    }

    bounds.x = max(bounds.x, 0.0);

    vec3 point = vOrigin + bounds.x * rayDirection;
    vec3 increment = 1.0 / abs(rayDirection);
    float delta = min(increment.x, min(increment.y, increment.z));
    delta /= steps;

    // Nice little seed from
    // https://blog.demofox.org/2020/05/25/casual-shadertoy-path-tracing-1-basic-camera-diffuse-emissive/
    uint seed =
      uint(gl_FragCoord.x) * uint(1973) +
      uint(gl_FragCoord.y) * uint(9277) +
      uint(frame) * uint(26699);
    vec3 size = vec3(textureSize(map, 0));
    float rand = random(seed) * 2.0 - 1.0;
    point += rayDirection * rand * (1.0 / size);

    vec4 color = vec4(base, 0.0);
    for (float t = bounds.x; t < bounds.y; t += delta) {
      float d = sampleTexture(point + 0.5);
      d = smoothstep(threshold - range, threshold + range, d) * opacity;

      float col = shading(point + 0.5) * 3.0 + (point.x + point.y) * 0.25 + 0.2;
      color.rgb += (1.0 - color.a) * d * col;
      color.a += (1.0 - color.a) * d;
      if (color.a > 0.99) {
        break;
      }
      point += rayDirection * delta;
    }

    outputColor = linearToOutputTexel(color);
  }
`

const Scene: FC = () => {
  const texture = useLoader(Texture3DLoader, '/clouds/cloud_shape.png')

  const geometry = new BoxGeometry(1, 1, 1)
  const material = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader,
    uniforms: {
      cameraPosition: new Uniform(new Vector3()),
      map: new Uniform(texture),
      base: new Uniform(new Color(0x808080)),
      threshold: new Uniform(0),
      opacity: new Uniform(0),
      range: new Uniform(0),
      steps: new Uniform(0),
      frame: new Uniform(0),
      scale: new Uniform(0)
    }
  })

  const parameters = useControls({
    threshold: { value: 0.5, min: 0, max: 1, step: 0.01 },
    opacity: { value: 0.25, min: 0, max: 1, step: 0.01 },
    range: { value: 0.25, min: 0, max: 1, step: 0.01 },
    steps: { value: 100, min: 0, max: 200, step: 1 },
    scale: { value: 1, min: 0.1, max: 5 }
  })

  const { camera } = useThree()
  useFrame(() => {
    material.uniforms.cameraPosition.value.copy(camera.position)
    material.uniforms.threshold.value = parameters.threshold
    material.uniforms.opacity.value = parameters.opacity
    material.uniforms.range.value = parameters.range
    material.uniforms.steps.value = parameters.steps
    material.uniforms.scale.value = parameters.scale
    ++material.uniforms.frame.value
  })

  return (
    <>
      <OrbitControls />
      <mesh geometry={geometry} material={material} />
    </>
  )
}

const Story: StoryFn = () => (
  <Canvas camera={{ position: [-1, 1, -1] }}>
    <Scene />
  </Canvas>
)

export default Story
