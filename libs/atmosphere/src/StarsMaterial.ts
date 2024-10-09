import {
  PointsMaterial,
  ShaderLib,
  Uniform,
  Vector2,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer
} from 'three'

const vertexShader =
  /* glsl */ `
    attribute float magnitude;
    uniform vec2 magnitudeRange;
  ` +
  ShaderLib.points.vertexShader.replace(
    /* glsl */ `#include <color_vertex>`,
    /* glsl */ `
      #include <color_vertex>
      {
        // Magnitude is stored between 0 to 1 within the given range.
        float m = mix(magnitudeRange.x, magnitudeRange.y, magnitude);
        vec3 v = pow(vec3(10.0), -vec3(magnitudeRange, m) / 2.5);
        vColor *= clamp((v.z - v.y) / (v.x - v.y), 0.0, 1.0);
      }
    `
  )

const fragmentShader = ShaderLib.points.fragmentShader

export class StarsMaterial extends PointsMaterial {
  uniforms: Record<string, Uniform>

  constructor() {
    super()
    this.uniforms = {
      magnitudeRange: new Uniform(new Vector2(-2, 8))
    }
  }

  get magnitudeRange(): Vector2 {
    return this.uniforms.magnitudeScale.value
  }

  set magnitudeRange(value: Vector2) {
    this.uniforms.magnitudeScale.value.set(value)
  }

  override onBeforeCompile(
    parameters: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer
  ): void {
    parameters.vertexShader = vertexShader
    parameters.fragmentShader = fragmentShader
    Object.assign(parameters.uniforms, this.uniforms)
  }
}
