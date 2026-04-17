/* eslint-disable max-nested-callbacks */

import {
  FloatType,
  LinearFilter,
  Matrix4,
  PerspectiveCamera,
  RedFormat,
  RenderTarget,
  Vector2,
  type Camera
} from 'three'
import type { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import {
  and,
  Break,
  float,
  Fn,
  If,
  int,
  ivec2,
  Loop,
  max,
  min,
  OnObjectUpdate,
  renderGroup,
  screenCoordinate,
  texture,
  uint,
  uniform,
  uniformArray,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import {
  cameraPositionWorld,
  FnVar,
  outputTexture,
  raySpheresIntersections,
  type Node
} from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from '../AtmosphereContext'
import {
  FLOAT_MAX,
  transformSliceToWorld,
  transformWorldToShadowUV
} from './common'

const { resetRendererState, restoreRendererState } = RendererUtils

const getRaySphereIntersections = /*#__PURE__*/ FnVar(
  (
    rayOrigin: Node<'vec3'>,
    rayDirection: Node<'vec3'>,
    sphereCenter: Node<'vec3'>,
    sphereRadius: Node<'vec2'>
  ): Node<'vec4'> => {
    const intersections = raySpheresIntersections(
      rayOrigin,
      rayDirection,
      sphereCenter,
      sphereRadius
    ).toConst()
    return vec4(
      intersections.get('near').x,
      intersections.get('far').x,
      intersections.get('near').y,
      intersections.get('far').y
    )
  }
)

export class EpipolarShadowLengthNode extends TempNode {
  csmShadowNode!: CSMShadowNode
  coordinateNode!: TextureNode
  sliceUVDirectionNode!: TextureNode
  minMaxLevelsNode!: TextureNode

  camera!: Camera

  firstCascade = uniform(0, 'uint')
  maxShadowStep = uniform(2048 / 4, 'float')

  numEpipolarSlices = 512 * 2
  maxSamplesInSlice = 256 * 2

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  private prevLightCount = 0

  constructor() {
    super(null)
    this.updateBeforeType = NodeUpdateType.FRAME

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: FloatType,
      format: RedFormat
    })
    const texture = renderTarget.texture
    texture.name = 'EpipolarShadowLength'
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.generateMipmaps = false
    this.renderTarget = renderTarget

    this.textureNode = outputTexture(this, renderTarget.texture)
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  override updateBefore({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { csmShadowNode } = this

    const { lights } = csmShadowNode
    if (lights.length !== this.prevLightCount) {
      this.prevLightCount = lights.length
      const { material } = this
      material.fragmentNode = this.setupOutputNode()
      material.needsUpdate = true
    }

    this.renderTarget.setSize(this.maxSamplesInSlice, this.numEpipolarSlices)

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupOutputNode(): Node<'float'> {
    const {
      csmShadowNode,
      coordinateNode,
      sliceUVDirectionNode,
      minMaxLevelsNode,
      camera,
      firstCascade,
      maxShadowStep
    } = this

    invariant(camera instanceof PerspectiveCamera)

    const numEpipolarSlices = float(this.numEpipolarSlices)

    const shadowCascadeArray = uniformArray(
      Array.from({ length: csmShadowNode.cascades }, () => new Vector2())
    ).setGroup(renderGroup)

    const shadowMatrixArray = uniformArray(
      Array.from({ length: csmShadowNode.cascades }, () => new Matrix4())
    ).setGroup(renderGroup)

    const { lights, cascades } = csmShadowNode
    invariant(lights.length > 0)
    invariant(lights.length === cascades)

    const textureNodes = lights.map(light => {
      invariant(light.shadow?.map?.depthTexture != null)
      return texture(light.shadow.map.depthTexture)
    })

    const biasedCameraFar = uniform('float').onRenderUpdate(
      // This bias might be required to test if the ray directs towards sky.
      () => camera.far * 0.999999
    )

    const sampleShadow = FnVar(
      (
        shadowUVAndDepthInLightSpace: Node<'vec3'>,
        cascadeIndex: Node<'int'>,
        depthInLightSpace: Node<'float'>
      ): Node<'float'> => {
        const isInLight = float(0).toVar()
        for (let cascade = 0; cascade < cascades; ++cascade) {
          If(cascadeIndex.equal(cascade), () => {
            isInLight.assign(
              textureNodes[cascade]
                .sample(shadowUVAndDepthInLightSpace.xy)
                .compare(depthInLightSpace)
            )
          })
        }
        return isInLight
      }
    )

    const processCascade = FnVar(
      (
        cascadeIndex: Node<'int'>,
        rayEndCameraZ: Node<'float'>,
        cascadeStartCameraZ: Node<'float'>,
        cascadeEndCameraZ: Node<'float'>
      ): Node<'float'> => {
        const totalLitLength = float(0).toVar()
        const totalMarchedLength = float(0).toVar()

        const sliceIndex = uint(screenCoordinate.y)
        const minMaxShadowMapSize = int(minMaxLevelsNode.size().x).toConst()

        // Truncate the ray against the far and near planes of the current
        // cascade:
        const rayEndRatio = min(rayEndCameraZ, cascadeEndCameraZ)
          .div(rayEndCameraZ)
          .toConst()
        const rayStartRatio = cascadeStartCameraZ.div(rayEndCameraZ).toConst()
        const distanceToRayStart = fullRayLength.mul(rayStartRatio).toVar()
        const distanceToRayEnd = fullRayLength.mul(rayEndRatio).toVar()

        // If the camera is outside the atmosphere and the ray intersects the
        // top of it, we must start integration from the first intersection
        // point.
        // If the camera is in the atmosphere, first intersection point is
        // always behind the camera and thus is negative
        distanceToRayStart.assign(max(distanceToRayStart, rayTopIntersection.x))
        distanceToRayEnd.assign(max(distanceToRayEnd, rayTopIntersection.x))

        // To properly compute scattering from the space, we must set up ray end
        // position before exiting the loop.
        const rayEnd = cameraPosition
          .add(viewDirection.mul(distanceToRayEnd))
          .toConst()
        const rayStart = cameraPosition
          .add(viewDirection.mul(distanceToRayStart))
          .toConst()

        const rayLength = distanceToRayEnd.sub(distanceToRayStart).toConst()

        // WORKAROUND: We cannot use the early-return pattern.
        If(rayLength.lessThanEqual(10).not(), () => {
          // We trace the ray in the light projection space, not in the world
          // space. Compute shadow map UV coordinates of the ray end point and
          // its depth in the light space.
          const shadowMatrix = shadowMatrixArray.element(cascadeIndex)
          const startUVAndDepthInLightSpace = transformWorldToShadowUV(
            rayStart,
            shadowMatrix
          )
          const endUVAndDepthInLightSpace = transformWorldToShadowUV(
            rayEnd,
            shadowMatrix
          )

          // Calculate normalized trace direction in the light projection space
          // and its length.
          const shadowTraceDirection = endUVAndDepthInLightSpace
            .sub(startUVAndDepthInLightSpace)
            .toVar()
          // If the ray is directed exactly at the light source, trace length
          // will be zero.
          // Clamp to a very small positive value to avoid division by zero.
          const traceLengthInShadowUVSpace = max(
            shadowTraceDirection.xy.length(),
            1e-7
          ).toConst()
          // Note that shadowTraceDirection.xy can be exactly zero.
          shadowTraceDirection.divAssign(traceLengthInShadowUVSpace)

          // Get UV direction for this slice.
          const relativeCascadeIndex = cascadeIndex.sub(firstCascade).toConst()
          const sliceUVDirectionAndOrigin = sliceUVDirectionNode
            .load(ivec2(sliceIndex, relativeCascadeIndex))
            .toConst()
          const sliceDirectionUV = sliceUVDirectionAndOrigin.xy.toConst()
          // Scale with the shadow map texel size.
          const shadowUVStepLength = sliceDirectionUV.length().toConst()
          const sliceOriginUV = sliceUVDirectionAndOrigin.zw.toConst()

          // Calculate ray step length in world space.
          const rayStepLengthWorld = rayLength
            .mul(shadowUVStepLength.div(traceLengthInShadowUVSpace))
            .toConst()

          // March the ray.
          const distanceMarchedInCascade = float(0).toVar()
          const currentShadowUVAndDepthInLightSpace =
            startUVAndDepthInLightSpace.toVar()

          const minLevel = 0
          // It is essential to round initial sample pos to the closest integer.
          const currentSamplePosition = uint(
            startUVAndDepthInLightSpace.xy
              .sub(sliceOriginUV)
              .length()
              .div(shadowUVStepLength)
              .add(0.5)
          ).toVar()
          const currentTreeLevel = uint(0).toVar()
          // Note that min/max shadow map does not contain finest resolution
          // level. The first level it contains corresponds to step == 2.
          const levelDataOffset = minMaxShadowMapSize.negate().toVar()
          const stepScale = float(1).toVar()
          const maxStepScale = maxShadowStep

          // Scale trace direction in light projection space to calculate the
          // step in shadow map.
          const shadowUVAndDepthStep = shadowTraceDirection
            .mul(shadowUVStepLength)
            .toConst()

          Loop(distanceMarchedInCascade.lessThan(rayLength), () => {
            // Clamp depth to a very small positive value to avoid z-fighting
            // at camera location.
            const currentDepthInLightSpace = max(
              currentShadowUVAndDepthInLightSpace.z,
              1e-7
            ).toConst()
            const isInLight = float(0).toVar()

            // If the step scale can be doubled without exceeding the maximum
            // allowed scale and the sample is located at the appropriate
            // position, advance to the next coarser level.
            If(
              and(
                stepScale.mul(2).lessThan(maxStepScale),
                currentSamplePosition
                  .bitAnd(uint(2).shiftLeft(currentTreeLevel).sub(1))
                  .equal(0)
              ),
              () => {
                levelDataOffset.addAssign(
                  minMaxShadowMapSize.shiftRight(currentTreeLevel)
                )
                currentTreeLevel.addAssign(1)
                stepScale.mulAssign(2)
              }
            )

            Loop(currentTreeLevel.greaterThan(minLevel), () => {
              // Compute light space depths at the ends of the current ray
              // section.

              // What we need here is actually depth which is divided by the
              // camera view space z.
              // Thus depth can be correctly interpolated in screen space:
              // http://www.comp.nus.edu.sg/~lowkl/publications/lowk_persp_interp_techrep.pdf
              // A subtle moment here is that we need to be sure that we can
              // skip stepScale samples starting from 0 up to stepScale - 1.
              // We do not need to do any checks against the sample stepScale
              // away:
              //
              //     --------------->
              //
              //          *
              //               *         *
              //     *              *
              //     0    1    2    3
              //
              //     |------------------>|
              //         stepScale = 4
              //
              const nextLightSpaceDepth =
                currentShadowUVAndDepthInLightSpace.z.add(
                  shadowUVAndDepthStep.z.mul(stepScale.sub(1))
                )
              const startEndDepthOnRaySection = vec2(
                currentShadowUVAndDepthInLightSpace.z,
                nextLightSpaceDepth
              ).toConst()

              // Load 1D min/max depths.
              const minMaxTextureYIndex = uint(sliceIndex).add(
                uint(cascadeIndex.sub(firstCascade)).mul(numEpipolarSlices)
              )
              const minMaxTextureCoord = ivec2(
                int(currentSamplePosition.shiftRight(currentTreeLevel)).add(
                  levelDataOffset
                ),
                minMaxTextureYIndex
              )
              const currentMinMaxDepth = minMaxLevelsNode
                .load(minMaxTextureCoord)
                .xy.toConst()

              // Determine if the ray section is fully lit or fully shadowed.
              if (reversedDepthBuffer) {
                // With reversed depth buffer, the relations are reversed.
                // maxDepth = closest to light
                isInLight.assign(
                  startEndDepthOnRaySection
                    .greaterThanEqual(currentMinMaxDepth.yy)
                    .all()
                )
              } else {
                // minDepth = closest to light
                isInLight.assign(
                  startEndDepthOnRaySection
                    .lessThanEqual(currentMinMaxDepth.xx)
                    .all()
                )
              }
              const isInShadow = (
                reversedDepthBuffer
                  ? startEndDepthOnRaySection
                      .lessThan(currentMinMaxDepth.xx)
                      .all()
                  : startEndDepthOnRaySection
                      .greaterThan(currentMinMaxDepth.yy)
                      .all()
              ).toConst()

              If(isInLight.or(isInShadow), () => {
                // If the ray section is fully lit or shadowed, we can break
                // the loop.
                Break()
              })
              // If the ray section is neither fully lit, nor shadowed, we have
              // to go to the finer level.
              currentTreeLevel.subAssign(1)
              levelDataOffset.subAssign(
                minMaxShadowMapSize.shiftRight(currentTreeLevel)
              )
              stepScale.divAssign(2)
            })

            // If we are at the finest level, sample the shadow map with PCF.
            If(currentTreeLevel.lessThanEqual(minLevel), () => {
              isInLight.assign(
                sampleShadow(
                  currentShadowUVAndDepthInLightSpace,
                  cascadeIndex,
                  currentDepthInLightSpace
                )
              )
            })

            const remainingDistance = rayLength
              .sub(distanceMarchedInCascade)
              .max(0)
              .toConst()
            const integrationStep = rayStepLengthWorld
              .mul(stepScale)
              .min(remainingDistance)
              .toConst()

            currentShadowUVAndDepthInLightSpace.addAssign(
              shadowUVAndDepthStep.mul(stepScale)
            )
            currentSamplePosition.addAssign(uint(1).shiftLeft(currentTreeLevel))
            distanceMarchedInCascade.addAssign(
              rayStepLengthWorld.mul(stepScale)
            )

            totalLitLength.addAssign(integrationStep.mul(isInLight))
            totalMarchedLength.addAssign(integrationStep)
          })
        })

        return totalMarchedLength.sub(totalLitLength)
      }
    )

    let reversedDepthBuffer: boolean
    let cameraPosition: Node<'vec3'>
    let fullRayLength: Node<'float'>
    let viewDirection: Node<'vec3'>
    let rayTopIntersection: Node<'vec2'>

    return Fn(builder => {
      reversedDepthBuffer = builder.renderer.reversedDepthBuffer

      // uniformArray doesn't appear to support onRenderUpdate.
      // OnObjectUpdate must be called inside a Fn() callback where
      // currentStack is set, so that the EventNode is properly registered.
      OnObjectUpdate(() => {
        const array = shadowCascadeArray.array as Vector2[]
        const far = Math.min(camera.far, csmShadowNode.maxFar)
        const cascades = csmShadowNode._cascades
        for (let i = 0; i < cascades.length; ++i) {
          const cascade = cascades[i]
          array[i].set(cascade.x * far, cascade.y * far)
        }
      })

      OnObjectUpdate(() => {
        const array = shadowMatrixArray.array as Matrix4[]
        const lights = csmShadowNode.lights
        for (let i = 0; i < lights.length; ++i) {
          const matrix = lights[i].shadow?.matrix
          if (matrix != null) {
            array[i].copy(matrix)
          }
        }
      })

      const { parameters } = getAtmosphereContext(builder)
      const { topRadius, bottomRadius } = parameters

      const coordinate = coordinateNode.load(screenCoordinate).toConst()
      const sampleLocation = coordinate.xy
      const rayEndCameraZ = coordinate.z.toVar()

      const totalShadowLength = float(0).toVar()

      // Skip samples with invalid screen coordinates.
      // WORKAROUND: We cannot use the early-return pattern.
      If(
        sampleLocation
          .abs()
          .greaterThan(1 + 1e-3)
          .any()
          .not(),
        () => {
          cameraPosition = cameraPositionWorld(camera).toConst()

          // Compute the ray termination point, full ray length and view
          // direction.
          const rayTermination = transformSliceToWorld(
            sampleLocation,
            rayEndCameraZ,
            camera
          ).toConst()
          const fullRay = rayTermination.sub(cameraPosition).toConst()
          fullRayLength = fullRay.length().toVar()
          viewDirection = fullRay.div(fullRayLength).toConst()

          // Intersect the ray with the top of the atmosphere and the Earth:
          const intersections = getRaySphereIntersections(
            cameraPosition,
            viewDirection,
            vec3(0),
            vec2(topRadius, bottomRadius)
          ).toConst()
          rayTopIntersection = intersections.xy
          const rayBottomIntersection = intersections.zw

          // The camera is outside the atmosphere and the ray either does not
          // intersect the top of it or the intersection point is behind the
          // camera. In either case there is no inscattering.
          If(rayTopIntersection.y.greaterThan(0), () => {
            // Limit the ray length by the distance to the top of the
            // atmosphere if the ray does not hit terrain.
            const originalRayLength = fullRayLength.toConst()
            If(rayEndCameraZ.greaterThanEqual(biasedCameraFar), () => {
              fullRayLength.assign(FLOAT_MAX)
            })
            // Limit the ray length by the distance to the point where the ray
            // exits the atmosphere.
            fullRayLength.assign(min(fullRayLength, rayTopIntersection.y))
            // If there is an intersection with the Earth surface, limit the
            // tracing distance to the intersection.
            If(rayBottomIntersection.x.greaterThan(0), () => {
              fullRayLength.assign(min(fullRayLength, rayBottomIntersection.x))
            })

            rayEndCameraZ.mulAssign(fullRayLength.div(originalRayLength))

            Loop(
              {
                start: firstCascade,
                end: cascades,
                condition: '<'
              },
              ({ i: cascadeIndex }) => {
                const shadowCascade = shadowCascadeArray.element(cascadeIndex)
                const cascadeStartCameraZ = shadowCascade.x
                const cascadeEndCameraZ = shadowCascade.y

                // Check if the ray terminates before it enters current cascade.
                If(rayEndCameraZ.lessThan(cascadeStartCameraZ), () => {
                  Break()
                })

                const shadowLength = processCascade(
                  cascadeIndex,
                  rayEndCameraZ,
                  cascadeStartCameraZ,
                  cascadeEndCameraZ
                ).toConst()

                totalShadowLength.addAssign(shadowLength)
              }
            )
          })
        }
      )

      return totalShadowLength
    })()
  }

  override setup(builder: NodeBuilder): unknown {
    return this.textureNode
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
