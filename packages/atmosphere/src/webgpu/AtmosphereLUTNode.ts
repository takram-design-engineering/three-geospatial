import {
  AddEquation,
  Box3,
  ClampToEdgeWrapping,
  CustomBlending,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  NoBlending,
  NoColorSpace,
  OneFactor,
  RenderTarget,
  RenderTarget3D,
  RGBAFormat,
  Vector3,
  type Data3DTexture,
  type Texture,
  type Vector2
} from 'three'
import {
  exp,
  int,
  mat3,
  mrt,
  nodeObject,
  screenCoordinate,
  texture,
  texture3D,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  Texture3DNode,
  TextureNode,
  type Node,
  type NodeBuilder,
  type NodeFrame,
  type Renderer,
  type UniformNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  isFloatLinearSupported,
  type AnyFloatType
} from '@takram/three-geospatial'
import type { NodeObject } from '@takram/three-geospatial/webgpu'

import { requestIdleCallback } from '../helpers/requestIdleCallback'
import { AtmosphereParameters } from './AtmosphereParameters'
import { rayleighPhaseFunction } from './common'
import {
  computeDirectIrradianceTexture,
  computeIndirectIrradianceTexture,
  computeMultipleScatteringTexture,
  computeScatteringDensityTexture,
  computeSingleScatteringTexture,
  computeTransmittanceToTopAtmosphereBoundaryTexture
} from './precompute'

function createRenderTarget(name: string): RenderTarget {
  const renderTarget = new RenderTarget(1, 1, {
    depthBuffer: false,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

function createRenderTarget3D(name: string): RenderTarget3D {
  const renderTarget = new RenderTarget3D(1, 1, 1, {
    depthBuffer: false,
    format: RGBAFormat
  })
  const texture = renderTarget.texture
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.wrapR = ClampToEdgeWrapping
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.name = name
  return renderTarget
}

function setupRenderTarget(
  renderTarget: RenderTarget,
  textureType: AnyFloatType,
  size: Vector2
): void {
  renderTarget.texture.type = textureType
  renderTarget.setSize(size.x, size.y)
}

function setupRenderTarget3D(
  renderTarget: RenderTarget3D,
  textureType: AnyFloatType,
  size: Vector3
): void {
  renderTarget.texture.type = textureType
  renderTarget.setSize(size.x, size.y, size.z)
  // As of r178, calling setSize() to a RenderTarget3D marks the texture as an
  // array texture, and subsequent calls to the texture in the GPU cannot find
  // overloaded functions.
  renderTarget.texture.isArrayTexture = false
}

function clearRenderTarget(
  renderer: Renderer,
  renderTarget?: RenderTarget
): void {
  if (renderTarget != null) {
    if (renderTarget instanceof RenderTarget3D) {
      for (let i = 0; i < renderTarget.depth; ++i) {
        renderer.setRenderTarget(renderTarget, i)
        void renderer.clearColor()
      }
    } else {
      renderer.setRenderTarget(renderTarget)
      void renderer.clearColor()
    }
  }
}

async function timeSlice<T>(iterable: Iterable<T>): Promise<T> {
  const iterator = iterable[Symbol.iterator]()
  return await new Promise<T>((resolve, reject) => {
    const callback = (): void => {
      try {
        const { value, done } = iterator.next()
        if (done === true) {
          resolve(value)
        } else {
          requestIdleCallback(callback)
        }
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error())
      }
    }
    requestIdleCallback(callback)
  })
}

let rendererState: RendererUtils.RendererState

function run(renderer: Renderer, task: () => void): boolean {
  rendererState = RendererUtils.resetRendererState(renderer, rendererState)
  renderer.setClearColor(0, 0)
  renderer.autoClear = false
  task()
  RendererUtils.restoreRendererState(renderer, rendererState)
  return true
}

class Context {
  lambdas = vec3(680, 550, 440)
  luminanceFromRadiance = mat3(new Matrix3().identity())

  opticalDepthRT = createRenderTarget('opticalDepth')
  deltaIrradianceRT = createRenderTarget('deltaIrradiance')
  deltaRayleighScatteringRT = createRenderTarget3D('deltaRayleighScattering')
  deltaMieScatteringRT = createRenderTarget3D('deltaMieScattering')
  deltaScatteringDensityRT = createRenderTarget3D('deltaScatteringDensity')

  // deltaMultipleScattering is only needed to compute scattering order 3 or
  // more, while deltaRayleighScattering and deltaMieScattering are only needed
  // to compute double scattering. Therefore, to save memory, we can store
  // deltaRayleighScattering and deltaMultipleScattering in the same GPU
  // texture.
  deltaMultipleScatteringRT = this.deltaRayleighScatteringRT

  constructor(textureType: AnyFloatType, parameters: AtmosphereParameters) {
    if (parameters.transmittancePrecisionLog) {
      setupRenderTarget(
        this.opticalDepthRT,
        textureType,
        parameters.transmittanceTextureSize
      )
    }
    setupRenderTarget(
      this.deltaIrradianceRT,
      textureType,
      parameters.irradianceTextureSize
    )
    setupRenderTarget3D(
      this.deltaRayleighScatteringRT,
      textureType,
      parameters.scatteringTextureSize
    )
    setupRenderTarget3D(
      this.deltaMieScatteringRT,
      textureType,
      parameters.scatteringTextureSize
    )
    setupRenderTarget3D(
      this.deltaScatteringDensityRT,
      textureType,
      parameters.scatteringTextureSize
    )
  }

  dispose(): void {
    this.opticalDepthRT.dispose()
    this.deltaIrradianceRT.dispose()
    this.deltaRayleighScatteringRT.dispose()
    this.deltaMieScatteringRT.dispose()
    this.deltaScatteringDensityRT.dispose()
  }
}

class AdditiveNodeMaterial extends NodeMaterial {
  override blendEquation = AddEquation
  override blendEquationAlpha = AddEquation
  override blendSrc = OneFactor
  override blendDst = OneFactor
  override blendSrcAlpha = OneFactor
  override blendDstAlpha = OneFactor

  // eslint-disable-next-line accessor-pairs
  set additive(value: boolean) {
    this.transparent = value
    this.blending = value ? CustomBlending : NoBlending
  }
}

const textureNames = ['transmittance', 'irradiance'] as const
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const texture3DNames = [
  'scattering',
  'singleMieScattering',
  'higherOrderScattering'
] as const

export type AtmosphereLUTTextureName = (typeof textureNames)[number]
export type AtmosphereLUTTexture3DName = (typeof texture3DNames)[number]

class LUTTextureNode extends TextureNode {
  static override get type(): string {
    return 'LUTTextureNode'
  }

  private readonly lutNode: AtmosphereLUTNode

  constructor(lutNode: AtmosphereLUTNode, texture: Texture) {
    super(texture)
    this.lutNode = lutNode
  }

  override setup(builder: NodeBuilder): unknown {
    this.lutNode.build(builder)
    return super.setup(builder)
  }

  // @ts-expect-error Wrong use of "this" in the library type.
  override clone(): LUTTextureNode {
    return new LUTTextureNode(this.lutNode, this.value)
  }
}

class LUTTexture3DNode extends Texture3DNode {
  static override get type(): string {
    return 'LUTTexture3DNode'
  }

  private readonly lutNode: AtmosphereLUTNode

  constructor(lutNode: AtmosphereLUTNode, texture: Texture) {
    super(texture)
    this.lutNode = lutNode
  }

  override setup(builder: NodeBuilder): unknown {
    this.lutNode.build(builder)
    return super.setup(builder)
  }

  // @ts-expect-error Wrong use of "this" in the library type.
  override clone(): LUTTexture3DNode {
    return new LUTTexture3DNode(this.lutNode, this.value)
  }
}

export class AtmosphereLUTNode extends TempNode {
  static override get type(): string {
    return 'AtmosphereLUTNode'
  }

  parameters: AtmosphereParameters
  textureType?: AnyFloatType // TODO

  private readonly material = new AdditiveNodeMaterial()
  private readonly mesh = new QuadMesh(this.material)

  private readonly transmittanceRT: RenderTarget
  private readonly irradianceRT: RenderTarget
  private readonly scatteringRT: RenderTarget3D
  private readonly singleMieScatteringRT: RenderTarget3D
  private readonly higherOrderScatteringRT: RenderTarget3D

  // WORKAROUND: The leading underscore avoids infinite recursion.
  // https://github.com/mrdoob/three.js/issues/31522
  private readonly _textureNodes: Partial<
    Record<
      AtmosphereLUTTextureName | AtmosphereLUTTexture3DName,
      NodeObject<LUTTextureNode | LUTTexture3DNode>
    >
  > = {}

  private currentVersion?: number
  private updating = false
  private disposeQueue: (() => void) | undefined

  constructor(parameters = new AtmosphereParameters()) {
    super(null)

    this.parameters = parameters
    this.transmittanceRT = createRenderTarget('transmittance')
    this.irradianceRT = createRenderTarget('irradiance')
    this.scatteringRT = createRenderTarget3D('scattering')
    this.singleMieScatteringRT = createRenderTarget3D('singleMieScattering')
    this.higherOrderScatteringRT = createRenderTarget3D('higherOrderScattering')

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  getTexture(name: AtmosphereLUTTextureName): Texture
  getTexture(name: AtmosphereLUTTexture3DName): Data3DTexture
  getTexture(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): Texture | Data3DTexture {
    return this[`${name}RT`].texture
  }

  getTextureNode(name: AtmosphereLUTTextureName): NodeObject<LUTTextureNode>
  getTextureNode(name: AtmosphereLUTTexture3DName): NodeObject<LUTTexture3DNode>
  getTextureNode(
    name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName
  ): NodeObject<LUTTextureNode | LUTTexture3DNode> {
    return (this._textureNodes[name] ??= nodeObject(
      textureNames.includes(name as AtmosphereLUTTextureName)
        ? new LUTTextureNode(
            this,
            this.getTexture(name as AtmosphereLUTTextureName)
          )
        : new LUTTexture3DNode(
            this,
            this.getTexture(name as AtmosphereLUTTexture3DName)
          )
    ))
  }

  private renderToRenderTarget(
    renderer: Renderer,
    renderTarget: RenderTarget,
    textures?: ReadonlyArray<Texture | undefined>
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures.filter(value => value != null))
    }
    renderer.setRenderTarget(renderTarget)
    this.mesh.render(renderer)
    renderTarget.textures.length = 1
  }

  private renderToRenderTarget3D(
    renderer: Renderer,
    renderTarget: RenderTarget3D,
    layer: UniformNode<number>,
    textures?: ReadonlyArray<Data3DTexture | undefined>
  ): void {
    if (textures != null) {
      renderTarget.textures.push(...textures.filter(value => value != null))
    }
    for (let i = 0; i < renderTarget.depth; ++i) {
      layer.value = i
      renderer.setRenderTarget(renderTarget, i)
      this.mesh.render(renderer)
    }
    renderTarget.textures.length = 1
  }

  private computeTransmittance(
    renderer: Renderer,
    { opticalDepthRT }: Context
  ): void {
    const transmittance = computeTransmittanceToTopAtmosphereBoundaryTexture(
      screenCoordinate
    ).context({ atmosphere: { parameters: this.parameters } })

    if (this.parameters.transmittancePrecisionLog) {
      // Compute the optical depth, and store it in opticalDepth. Avoid having
      // tiny transmittance values underflow to 0 due to half-float precision.
      this.material.fragmentNode = mrt({
        transmittance: exp(transmittance.negate()),
        opticalDepth: transmittance
      })
    } else {
      this.material.fragmentNode = transmittance
    }
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget(renderer, this.transmittanceRT, [
      this.parameters.transmittancePrecisionLog
        ? opticalDepthRT.texture
        : undefined
    ])
  }

  private computeDirectIrradiance(
    renderer: Renderer,
    { deltaIrradianceRT, opticalDepthRT }: Context
  ): void {
    const irradiance = computeDirectIrradianceTexture(
      texture(
        this.parameters.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      screenCoordinate
    ).context({ atmosphere: { parameters: this.parameters } })

    this.material.fragmentNode = mrt({
      deltaIrradiance: vec4(irradiance, 1),
      irradiance: vec4(vec3(0), 1)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  private computeSingleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      opticalDepthRT
    }: Context
  ): void {
    const layer = uniform(0)

    const singleScattering = computeSingleScatteringTexture(
      texture(
        this.parameters.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      vec3(screenCoordinate, layer.add(0.5))
    ).context({ atmosphere: { parameters: this.parameters } })

    const rayleigh = singleScattering.get('rayleigh')
    const mie = singleScattering.get('mie')

    this.material.fragmentNode = mrt({
      scattering: vec4(
        rayleigh.mul(luminanceFromRadiance),
        mie.mul(luminanceFromRadiance).r
      ),
      deltaRayleighScattering: vec4(rayleigh, 1),
      deltaMieScattering: vec4(mie.mul(luminanceFromRadiance), 1)
    })

    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaRayleighScattering and deltaMieScattering.
    clearRenderTarget(renderer, deltaRayleighScatteringRT)
    clearRenderTarget(renderer, deltaMieScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, layer, [
      deltaRayleighScatteringRT.texture,
      deltaMieScatteringRT.texture
    ])

    if (!this.parameters.combinedScatteringTextures) {
      renderer.copyTextureToTexture(
        deltaMieScatteringRT.texture,
        this.singleMieScatteringRT.texture,
        new Box3(new Vector3(), this.parameters.scatteringTextureSize)
      )
    }
  }

  private computeScatteringDensity(
    renderer: Renderer,
    {
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    }: Context,
    scatteringOrder: number
  ): void {
    const layer = uniform(0)
    const radiance = computeScatteringDensityTexture(
      texture(
        this.parameters.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      texture3D(deltaRayleighScatteringRT.texture),
      texture3D(deltaMieScatteringRT.texture),
      texture3D(deltaMultipleScatteringRT.texture),
      texture(deltaIrradianceRT.texture),
      vec3(screenCoordinate, layer.add(0.5)),
      int(scatteringOrder)
    ).context({ atmosphere: { parameters: this.parameters } })

    this.material.fragmentNode = vec4(radiance, 1)
    this.material.additive = false
    this.material.needsUpdate = true

    this.renderToRenderTarget3D(renderer, deltaScatteringDensityRT, layer)
  }

  private computeIndirectIrradiance(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaIrradianceRT,
      deltaRayleighScatteringRT,
      deltaMieScatteringRT,
      deltaMultipleScatteringRT
    }: Context,
    scatteringOrder: number
  ): void {
    const irradiance = computeIndirectIrradianceTexture(
      texture3D(deltaRayleighScatteringRT.texture),
      texture3D(deltaMieScatteringRT.texture),
      texture3D(deltaMultipleScatteringRT.texture),
      screenCoordinate,
      int(scatteringOrder - 1)
    ).context({ atmosphere: { parameters: this.parameters } })

    this.material.fragmentNode = mrt({
      deltaIrradiance: irradiance,
      irradiance: irradiance.mul(luminanceFromRadiance)
    })
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaIrradiance.
    clearRenderTarget(renderer, deltaIrradianceRT)

    this.renderToRenderTarget(renderer, this.irradianceRT, [
      deltaIrradianceRT.texture
    ])
  }

  private computeMultipleScattering(
    renderer: Renderer,
    {
      luminanceFromRadiance,
      deltaScatteringDensityRT,
      deltaMultipleScatteringRT,
      opticalDepthRT
    }: Context
  ): void {
    const layer = uniform(0)
    const multipleScattering = computeMultipleScatteringTexture(
      texture(
        this.parameters.transmittancePrecisionLog
          ? opticalDepthRT.texture
          : this.transmittanceRT.texture
      ),
      texture3D(deltaScatteringDensityRT.texture),
      vec3(screenCoordinate, layer.add(0.5))
    ).context({ atmosphere: { parameters: this.parameters } })

    const radiance = multipleScattering.get('radiance')
    const cosViewSun = multipleScattering.get('cosViewSun')
    const luminance = radiance
      .mul(luminanceFromRadiance)
      .div(rayleighPhaseFunction(cosViewSun))

    const mrtLayout: Record<string, Node> = {
      scattering: vec4(luminance, 0),
      // deltaMultipleScattering is shared with deltaRayleighScattering.
      deltaRayleighScattering: vec4(radiance, 1)
    }
    if (this.parameters.higherOrderScatteringTexture) {
      mrtLayout.higherOrderScattering = vec4(luminance, 1)
    }
    this.material.fragmentNode = mrt(mrtLayout)
    this.material.additive = true
    this.material.needsUpdate = true

    // Turn off blending on the deltaMultipleScattering.
    clearRenderTarget(renderer, deltaMultipleScatteringRT)

    this.renderToRenderTarget3D(renderer, this.scatteringRT, layer, [
      deltaMultipleScatteringRT.texture,
      this.parameters.higherOrderScatteringTexture
        ? this.higherOrderScatteringRT.texture
        : undefined
    ])
  }

  private *compute(renderer: Renderer, context: Context): Iterable<boolean> {
    // MRT doesn't work unless clearing the render target first. Perhaps it's a
    // limitation of WebGPU. I saw a similar comment in Three.js source code but
    // can't recall where.
    yield run(renderer, () => {
      clearRenderTarget(renderer, this.transmittanceRT)
      clearRenderTarget(renderer, this.irradianceRT)
      clearRenderTarget(renderer, this.scatteringRT)
      clearRenderTarget(renderer, this.singleMieScatteringRT)
      clearRenderTarget(renderer, this.higherOrderScatteringRT)
      clearRenderTarget(renderer, context.opticalDepthRT)
      clearRenderTarget(renderer, context.deltaRayleighScatteringRT)
      clearRenderTarget(renderer, context.deltaMieScatteringRT)
      clearRenderTarget(renderer, context.deltaScatteringDensityRT)
      clearRenderTarget(renderer, context.deltaMultipleScatteringRT)
    })

    // Compute the transmittance, and store it in transmittanceTexture.
    yield run(renderer, () => {
      this.computeTransmittance(renderer, context)
    })

    // Compute the direct irradiance, store it in deltaIrradiance and,
    // depending on "additive", either initialize irradianceTexture with zeros
    // or leave it unchanged (we don't want the direct irradiance in
    // irradianceTexture, but only the irradiance from the sky).
    yield run(renderer, () => {
      this.computeDirectIrradiance(renderer, context)
    })

    // Compute the rayleigh and mie single scattering, store them in
    // deltaRayleighScattering and deltaMieScattering, and either store them or
    // accumulate them in scatteringTexture and optional
    // mieScatteringTexture.
    yield run(renderer, () => {
      this.computeSingleScattering(renderer, context)
    })

    // Compute the 2nd, 3rd and 4th order of scattering, in sequence.
    for (let scatteringOrder = 2; scatteringOrder <= 4; ++scatteringOrder) {
      // Compute the scattering density, and store it in deltaScatteringDensity.
      yield run(renderer, () => {
        this.computeScatteringDensity(renderer, context, scatteringOrder)
      })
      // Compute the indirect irradiance, store it in deltaIrradiance and
      // accumulate it in irradianceTexture.
      yield run(renderer, () => {
        this.computeIndirectIrradiance(renderer, context, scatteringOrder)
      })
      // Compute the multiple scattering, store it in deltaMultipleScattering,
      // and accumulate it in scatteringTexture.
      yield run(renderer, () => {
        this.computeMultipleScattering(renderer, context)
      })
    }

    this.material.fragmentNode = null
  }

  async updateTextures(renderer: Renderer): Promise<void> {
    invariant(this.textureType != null)
    const context = new Context(this.textureType, this.parameters)
    this.updating = true
    try {
      await timeSlice(this.compute(renderer, context))
    } finally {
      this.updating = false
      context.dispose()
      this.disposeQueue?.()
    }
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null || this.version === this.currentVersion) {
      return
    }
    this.currentVersion = this.version

    // TODO: Race condition
    this.updateTextures(renderer).catch((error: unknown) => {
      throw error instanceof Error ? error : new Error()
    })
  }

  override setup(builder: NodeBuilder): unknown {
    this.textureType = isFloatLinearSupported(builder.renderer)
      ? (this.textureType ?? FloatType)
      : HalfFloatType

    setupRenderTarget(
      this.transmittanceRT,
      this.textureType,
      this.parameters.transmittanceTextureSize
    )
    setupRenderTarget(
      this.irradianceRT,
      this.textureType,
      this.parameters.irradianceTextureSize
    )
    setupRenderTarget3D(
      this.scatteringRT,
      this.textureType,
      this.parameters.scatteringTextureSize
    )
    if (!this.parameters.combinedScatteringTextures) {
      setupRenderTarget3D(
        this.singleMieScatteringRT,
        this.textureType,
        this.parameters.scatteringTextureSize
      )
    }
    if (this.parameters.higherOrderScatteringTexture) {
      setupRenderTarget3D(
        this.higherOrderScatteringRT,
        this.textureType,
        this.parameters.scatteringTextureSize
      )
    }
    return super.setup(builder)
  }

  override dispose(): void {
    if (this.updating) {
      this.disposeQueue = () => {
        this.dispose()
        this.disposeQueue = undefined
      }
      return
    }

    this.transmittanceRT.dispose()
    this.irradianceRT.dispose()
    this.scatteringRT.dispose()
    this.singleMieScatteringRT.dispose()
    this.higherOrderScatteringRT.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    this.parameters.dispose() // TODO: Conditionally depending on the owner.

    const nodes = this._textureNodes
    for (const key in nodes) {
      if (Object.hasOwn(nodes, key)) {
        const uniform = nodes[key as keyof typeof nodes]
        uniform?.dispose()
      }
    }
  }
}

export const atmosphereLUT = (
  ...args: ConstructorParameters<typeof AtmosphereLUTNode>
): NodeObject<AtmosphereLUTNode> => nodeObject(new AtmosphereLUTNode(...args))
