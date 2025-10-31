import { useMemo, type ComponentProps, type FC } from 'react'
import { Matrix3, Vector3, type Matrix4 } from 'three'

import { lerp } from '@takram/three-geospatial'

import { useGLTF } from '../hooks/useGLTF'
import { useGuardedFrame } from '../hooks/useGuardedFrame'

const vector = new Vector3()
const rotation = new Matrix3()

export interface ISSProps extends ComponentProps<'group'> {
  matrixWorldToECEF: Matrix4
  sunDirectionECEF: Vector3
}

export const ISS: FC<ISSProps> = ({
  matrixWorldToECEF,
  sunDirectionECEF,
  ...props
}) => {
  const gltf = useGLTF('public/iss.glb')

  const userData: {
    initialized?: boolean
  } = gltf.userData

  if (userData.initialized !== true) {
    userData.initialized = true
    Object.values(gltf.meshes).forEach(mesh => {
      mesh.receiveShadow = true
      mesh.castShadow = true
    })
  }

  const { trusses, panels, radiators } = useMemo(() => {
    const scene = gltf.scene
    return {
      trusses: [
        scene.getObjectByName('23_S4_Truss'),
        scene.getObjectByName('20_P4_Truss')
      ].filter(value => value != null),
      panels: [
        scene.getObjectByName('23_S4_Truss_01'),
        scene.getObjectByName('23_S4_Truss_02'),
        scene.getObjectByName('32_S6_Truss_01'),
        scene.getObjectByName('32_S6_Truss_02'),
        scene.getObjectByName('20_P4_Truss_01'),
        scene.getObjectByName('20_P4_Truss_02'),
        scene.getObjectByName('08_P6_Truss_01'),
        scene.getObjectByName('08_P6_Truss_02')
      ].filter(value => value != null),
      radiators: [
        scene.getObjectByName('16_S1_Truss_02'),
        scene.getObjectByName('17_P1_Truss_02')
      ].filter(value => value != null)
    }
  }, [gltf.scene])

  useGuardedFrame(() => {
    const sunDirectionLocal = vector
      .copy(sunDirectionECEF)
      .applyMatrix3(rotation.setFromMatrix4(matrixWorldToECEF).transpose())
      .normalize()
      .applyMatrix3(rotation.setFromMatrix4(gltf.scene.matrixWorld).transpose())
      .normalize()

    const { x, y, z } = sunDirectionLocal
    const trussAngle = Math.atan2(z, y)
    const cosTruss = Math.cos(trussAngle)
    const sinTruss = Math.sin(trussAngle)
    const panelAngle = -Math.atan2(x, y * cosTruss + z * sinTruss)
    const sunDirectionXY = vector.set(x, y, 0).normalize()
    const radiatorAngle = -Math.atan2(sunDirectionXY.x, sunDirectionXY.y)

    const alpha = 0.05
    const trussAngleLerp = lerp(trusses[0].rotation.x, trussAngle, alpha)
    const panelAngleLerp = lerp(panels[0].rotation.z, panelAngle, alpha)
    const radiatorAngleLerp = lerp(
      radiators[0].rotation.z,
      radiatorAngle,
      alpha
    )
    for (const truss of trusses) {
      truss.rotation.x = trussAngleLerp
    }
    for (const panel of panels) {
      panel.rotation.z = panelAngleLerp
    }
    for (const radiator of radiators) {
      radiator.rotation.z = radiatorAngleLerp
    }
  })

  return (
    <group {...props}>
      <primitive
        object={gltf.scene}
        rotation-x={Math.PI / 2}
        rotation-y={Math.PI / 2}
        rotation-z={-Math.PI / 2}
      />
    </group>
  )
}
