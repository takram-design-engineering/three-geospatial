// Based on the following work:
// https://github.com/StrandedKitty/three-csm/tree/master/src
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

/**
 * MIT License
 *
 * Copyright (c) 2019 vtHawk
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import {
  Box3,
  Box3Helper,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Camera,
  type ColorRepresentation,
  type DirectionalLight,
  type Material
} from 'three'

import type { CascadedShadow } from './CascadedShadow'

class LightFrustumHelper extends LineSegments<BufferGeometry, Material> {
  box: Box3

  constructor(box: Box3, color: ColorRepresentation = 0xffff00) {
    const indices = new Uint16Array([
      0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7, 0,
      2, 1, 3, 8, 9
    ])
    const positions = [
      1, 1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1, -1, -1, 1, -1, -1, -1, -1,
      1, -1, -1, 0, 0, 1, 0, 0, -1
    ]
    const geometry = new BufferGeometry()
    geometry.setIndex(new BufferAttribute(indices, 1))
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))

    super(geometry, new LineBasicMaterial({ color, toneMapped: false }))

    this.box = box
    this.geometry.computeBoundingSphere()
  }

  updateMatrixWorld(force = false): void {
    const box = this.box
    if (box.isEmpty()) {
      return
    }
    box.getCenter(this.position)
    box.getSize(this.scale)
    this.scale.multiplyScalar(0.5)
    super.updateMatrixWorld(force)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}

function createFrustumLines(
  color: ColorRepresentation
): LineSegments<BufferGeometry, Material> {
  const indices = new Uint16Array([
    0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7
  ])
  const positions = new Float32Array(24)
  const geometry = new BufferGeometry()
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.setAttribute('position', new BufferAttribute(positions, 3, false))
  return new LineSegments(geometry, new LineBasicMaterial({ color }))
}

export class CascadedShadowHelper extends Group {
  cascadedShadow: CascadedShadow

  private readonly cameraFrustumColor: ColorRepresentation
  private readonly lightFrustumColor: ColorRepresentation
  private readonly cascadePlaneMaterial: Material

  private readonly cameraFrustumLines: LineSegments<BufferGeometry, Material>
  private readonly cascadePlanes: Array<{
    mesh: Mesh<BufferGeometry, Material>
    helper: Box3Helper
  }> = []
  private readonly lightFrusta: Array<{
    group: Group
    helper: LightFrustumHelper
  }> = []

  constructor(
    cascadedShadow: CascadedShadow,
    frustumColor: ColorRepresentation = 0xffffff,
    lightFrustumColor: ColorRepresentation = 0xffff00
  ) {
    super()
    this.cascadedShadow = cascadedShadow
    this.cameraFrustumColor = frustumColor
    this.lightFrustumColor = lightFrustumColor
    this.cascadePlaneMaterial = new MeshBasicMaterial({
      color: frustumColor,
      transparent: true,
      opacity: 0.1,
      side: DoubleSide
    })
    this.cameraFrustumLines = createFrustumLines(frustumColor)
    this.add(this.cameraFrustumLines)
  }

  update(camera: Camera, lights: readonly DirectionalLight[]): void {
    this.position.copy(camera.position)
    this.quaternion.copy(camera.quaternion)
    this.scale.copy(camera.scale)
    this.updateMatrixWorld(true)

    this.updateCameraFrustum()
    this.updateCascadePlanes()
    this.updateLightFrusta(lights)
  }

  private updateCameraFrustum(): void {
    const { near, far } = this.cascadedShadow.cameraFrustum
    const positions = this.cameraFrustumLines.geometry.getAttribute('position')
    positions.setXYZ(0, far[0].x, far[0].y, far[0].z)
    positions.setXYZ(1, far[3].x, far[3].y, far[3].z)
    positions.setXYZ(2, far[2].x, far[2].y, far[2].z)
    positions.setXYZ(3, far[1].x, far[1].y, far[1].z)
    positions.setXYZ(4, near[0].x, near[0].y, near[0].z)
    positions.setXYZ(5, near[3].x, near[3].y, near[3].z)
    positions.setXYZ(6, near[2].x, near[2].y, near[2].z)
    positions.setXYZ(7, near[1].x, near[1].y, near[1].z)
    positions.needsUpdate = true
  }

  private updateCascadePlanes(): void {
    const { cascadeCount, frusta } = this.cascadedShadow
    const planes = this.cascadePlanes
    while (planes.length > cascadeCount) {
      const plane = planes.pop()
      plane?.mesh.removeFromParent()
      plane?.helper.removeFromParent()
    }
    while (planes.length < cascadeCount) {
      const mesh = new Mesh(new PlaneGeometry(), this.cascadePlaneMaterial)
      const helper = new Box3Helper(new Box3(), this.cameraFrustumColor)
      this.add(mesh)
      this.add(helper)
      planes.push({ mesh, helper })
    }
    for (let i = 0; i < cascadeCount; ++i) {
      const { far } = frusta[i]
      const { mesh, helper } = planes[i]
      mesh.position.addVectors(far[0], far[2]).multiplyScalar(0.5)
      mesh.scale.subVectors(far[0], far[2])
      mesh.scale.z = 0
      helper.box.min.copy(far[2])
      helper.box.max.copy(far[0])
    }
  }

  private updateLightFrusta(lights: readonly DirectionalLight[]): void {
    const { cascadeCount } = this.cascadedShadow
    const frusta = this.lightFrusta
    while (frusta.length > cascadeCount) {
      frusta.pop()?.group.removeFromParent()
    }
    while (frusta.length < cascadeCount) {
      const helper = new LightFrustumHelper(new Box3(), this.lightFrustumColor)
      const group = new Group().add(helper)
      this.add(group)
      frusta.push({ group, helper })
    }
    for (let i = 0; i < cascadeCount; ++i) {
      const camera = lights[i].shadow.camera
      const { group, helper } = frusta[i]

      this.remove(group)
      group.position.copy(camera.position)
      group.quaternion.copy(camera.quaternion)
      group.scale.copy(camera.scale)
      group.updateMatrixWorld(true)
      this.attach(group)

      helper.box.min.set(camera.bottom, camera.left, -camera.far)
      helper.box.max.set(camera.top, camera.right, -camera.near)
    }
  }

  dispose(): void {
    this.cameraFrustumLines.geometry.dispose()
    this.cameraFrustumLines.material.dispose()
    this.cascadePlanes.forEach(({ mesh, helper }) => {
      mesh.geometry.dispose()
      mesh.material.dispose()
      helper.dispose()
    })
    this.lightFrusta.forEach(({ helper }) => {
      helper.dispose()
    })
    this.cascadePlaneMaterial.dispose()
  }
}
