/// <reference types="vite-plugin-glsl/ext" />

import { BackSide } from 'three'

import {
  AtmosphereMaterial,
  type AtmosphereMaterialParameters
} from './AtmosphereMaterial'

import vertexShader from './shaders/skyBox.vert'

export interface SkyBoxMaterialParameters
  extends AtmosphereMaterialParameters {}

export class SkyBoxMaterial extends AtmosphereMaterial {
  constructor(params: SkyBoxMaterialParameters = {}) {
    super({
      ...params,
      vertexShader,
      side: BackSide
    })
  }
}
