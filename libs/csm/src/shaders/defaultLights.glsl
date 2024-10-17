// Default shader.
// See: https://github.com/mrdoob/three.js/blob/r169/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js#L136

void defaultLights() {
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    directionalLight = directionalLights[i];
    getDirectionalLightInfo(directionalLight, directLight);

    #if defined(USE_SHADOWMAP) && UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
    directionalLightShadow = directionalLightShadows[i];
    directLight.color *=
      directLight.visible && receiveShadow
        ? getShadow(
          directionalShadowMap[i],
          directionalLightShadow.shadowMapSize,
          directionalLightShadow.shadowIntensity,
          directionalLightShadow.shadowBias,
          directionalLightShadow.shadowRadius,
          vDirectionalShadowCoord[i]
        )
        : 1.0;
    #endif

    RE_Direct(
      directLight,
      geometryPosition,
      geometryNormal,
      geometryViewDir,
      geometryClearcoatNormal,
      material,
      reflectedLight
    );
  }
  #pragma unroll_loop_end
}
