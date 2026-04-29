// Based on Intel's Outdoor Light Scattering Sample: https://github.com/GameTechDev/OutdoorLightScattering

/**
 * Copyright 2017 Intel Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 * Modified from the original source code.
 */

/* eslint-disable max-nested-callbacks */

import {
  HalfFloatType,
  LinearFilter,
  RenderTarget,
  RGFormat,
  type PerspectiveCamera
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
  screenCoordinate,
  uint,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode,
  type UniformArrayNode,
  type UniformNode
} from 'three/webgpu'

import {
  FnVar,
  Node,
  outputTexture,
  raySpheresIntersections
} from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from '../AtmosphereContext'
import {
  HALF_FLOAT_MAX,
  transformSliceToUnit,
  transformUnitToShadowUV
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

export class EpipolarShadowLengthNode extends Node {
  static override get type(): string {
    return 'EpipolarShadowLengthNode'
  }

  csmShadowNode!: CSMShadowNode
  coordinateNode!: TextureNode
  sliceUVDirectionNode!: TextureNode
  minMaxLevelsNode!: TextureNode
  shadowDepthNodes!: TextureNode[]

  camera!: PerspectiveCamera

  epipolarSliceCount!: UniformNode<number> // float
  maxSliceSampleCount!: UniformNode<number> // float
  firstCascade!: UniformNode<number> // uint
  maxShadowStep!: UniformNode<number> // float
  shadowCascadeArray!: UniformArrayNode // vec2[]
  shadowMatrixArray!: UniformArrayNode // mat4[]

  private readonly textureNode: TextureNode
  private readonly renderTarget: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly mesh = new QuadMesh(this.material)
  private rendererState?: RendererUtils.RendererState

  constructor() {
    super()
    this.updateType = NodeUpdateType.FRAME // After CSM's updateBefore
    this.material.name = 'EpipolarShadowLength'
    this.mesh.name = 'EpipolarShadowLength'

    const renderTarget = new RenderTarget(1, 1, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGFormat
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

  override update({ renderer }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    this.renderTarget.setSize(
      this.maxSliceSampleCount.value,
      this.epipolarSliceCount.value
    )

    this.rendererState = resetRendererState(renderer, this.rendererState)

    renderer.setRenderTarget(this.renderTarget)
    this.mesh.render(renderer)

    restoreRendererState(renderer, this.rendererState)
  }

  private setupFragmentNode(builder: NodeBuilder): Node<'vec2'> {
    const {
      csmShadowNode,
      coordinateNode,
      sliceUVDirectionNode,
      minMaxLevelsNode,
      shadowDepthNodes,
      camera,
      epipolarSliceCount,
      firstCascade,
      maxShadowStep,
      shadowCascadeArray,
      shadowMatrixArray
    } = this

    const { cascades: cascadeCount } = csmShadowNode
    const { cameraPositionUnit, parameters } = getAtmosphereContext(builder)
    const { worldToUnit } = parameters

    const biasedCameraFar = uniform('float').onRenderUpdate(
      () => camera.far * worldToUnit * 0.999999
    )

    const sampleShadow = FnVar(
      (
        shadowUVAndDepthInLightSpace: Node<'vec3'>,
        cascadeIndex: Node<'int'>,
        depthInLightSpace: Node<'float'>
      ): Node<'float'> => {
        const isInLight = float(0).toVar()
        for (let cascade = 0; cascade < cascadeCount; ++cascade) {
          If(cascadeIndex.equal(cascade), () => {
            isInLight.assign(
              shadowDepthNodes[cascade]
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
      ): Node<'vec2'> => {
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
        const rayEnd = cameraPositionUnit
          .add(viewDirection.mul(distanceToRayEnd))
          .toConst()
        const rayStart = cameraPositionUnit
          .add(viewDirection.mul(distanceToRayStart))
          .toConst()

        const rayLength = distanceToRayEnd.sub(distanceToRayStart).toConst()

        const totalShadowLength = float(0).toVar()
        const totalMarchedLength = float(0).toVar()
        const distanceToFirstShadowedSection = float(-1).toVar()

        // WORKAROUND: We cannot use the early-return pattern.
        If(rayLength.lessThanEqual(10 * worldToUnit).not(), () => {
          // We trace the ray in the light projection space, not in the unit
          // space. Compute shadow map UV coordinates of the ray end point and
          // its depth in the light space.
          const shadowMatrix = shadowMatrixArray.element(cascadeIndex)
          const startUVAndDepthInLightSpace = transformUnitToShadowUV(
            rayStart,
            shadowMatrix
          )
          const endUVAndDepthInLightSpace = transformUnitToShadowUV(
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

          // Calculate ray step length in unit space.
          const rayStepLengthUnit = rayLength
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
            const currentDepthInLightSpace =
              currentShadowUVAndDepthInLightSpace.z
                .clamp(1e-7, 1) // Extrapolate blockers
                .toConst()
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
              )
                .saturate() // Extrapolate blockers
                .toConst()

              // Load 1D min/max depths.
              const minMaxTextureYIndex = uint(sliceIndex).add(
                uint(cascadeIndex.sub(firstCascade)).mul(epipolarSliceCount)
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
              if (builder.renderer.reversedDepthBuffer) {
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
                builder.renderer.reversedDepthBuffer
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
            const integrationStep = rayStepLengthUnit
              .mul(stepScale)
              .min(remainingDistance)
              .toConst()

            currentShadowUVAndDepthInLightSpace.addAssign(
              shadowUVAndDepthStep.mul(stepScale)
            )
            currentSamplePosition.addAssign(uint(1).shiftLeft(currentTreeLevel))
            distanceMarchedInCascade.addAssign(rayStepLengthUnit.mul(stepScale))

            // Store the distance where the ray first enters the shadow.
            distanceToFirstShadowedSection.assign(
              distanceToFirstShadowedSection
                .lessThan(0)
                .and(isInLight.not())
                .select(totalMarchedLength, distanceToFirstShadowedSection)
            )

            totalShadowLength.addAssign(
              integrationStep.mul(isInLight.oneMinus())
            )
            totalMarchedLength.addAssign(integrationStep)
          })
        })

        // If the whole ray is lit, set the distance to the first shadowed
        // section to the total marched distance.
        If(distanceToFirstShadowedSection.lessThan(0), () => {
          distanceToFirstShadowedSection.assign(totalMarchedLength)
        })

        return vec2(
          totalShadowLength,
          distanceToFirstShadowedSection.add(distanceToRayStart)
        )
      }
    )

    let fullRayLength: Node<'float'>
    let viewDirection: Node<'vec3'>
    let rayTopIntersection: Node<'vec2'>

    return Fn(() => {
      const { parametersNode } = getAtmosphereContext(builder)
      const { topRadius, bottomRadius } = parametersNode

      const coordinate = coordinateNode.load(screenCoordinate).toConst()
      const sampleLocation = coordinate.xy
      const rayEndCameraZ = coordinate.z.toVar()

      const totalShadowLength = vec2(0).toVar()

      // Skip samples with invalid screen coordinates.
      // WORKAROUND: We cannot use the early-return pattern.
      If(
        sampleLocation
          .abs()
          .greaterThan(1 + 1e-3)
          .any()
          .not(),
        () => {
          // Compute the ray termination point, full ray length and view
          // direction.
          const rayTermination = transformSliceToUnit(
            sampleLocation,
            rayEndCameraZ,
            camera
          ).toConst()
          const fullRay = rayTermination.sub(cameraPositionUnit).toConst()
          fullRayLength = fullRay.length().toVar()
          viewDirection = fullRay.div(fullRayLength).toConst()

          // Intersect the ray with the top of the atmosphere and the Earth:
          const intersections = getRaySphereIntersections(
            cameraPositionUnit,
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
              fullRayLength.assign(HALF_FLOAT_MAX)
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
                end: cascadeCount,
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

                // Keep shadowLength.y from the first cascade that has shadow.
                totalShadowLength.y.assign(
                  totalShadowLength.x
                    .equal(0)
                    .and(shadowLength.x.greaterThan(0))
                    .select(shadowLength.y, totalShadowLength.y)
                )
                totalShadowLength.x.addAssign(shadowLength.x)
              }
            )

            // Set the full ray length to shadowLength.y to prevent
            // interpolated values from being pulled towards 0.
            If(totalShadowLength.x.equal(0), () => {
              totalShadowLength.y.assign(fullRayLength)
            })
          })
        }
      )

      return totalShadowLength
    })()
  }

  override setup(builder: NodeBuilder): unknown {
    const { material } = this
    material.fragmentNode = this.setupFragmentNode(builder)
    material.needsUpdate = true

    return this.textureNode
  }

  override dispose(): void {
    this.renderTarget.dispose()
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}
