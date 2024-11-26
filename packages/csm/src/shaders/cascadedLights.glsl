// Based on the following work:
// https://github.com/StrandedKitty/three-csm/tree/master/src
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

void cascadedLights() {
  directionalLight = directionalLights[0];
  getDirectionalLightInfo(directionalLight, directLight);

  float clipDepth = vViewPosition.z / (csmFar - csmNear);
  vec2 cascade;

  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    #if UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
    #if UNROLLED_LOOP_INDEX < CSM_CASCADE_COUNT
    cascade = csmCascades[i];
    directionalLightShadow = directionalLightShadows[i];
    if (clipDepth >= cascade.x && clipDepth < cascade.y) {
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
    }
    #endif // UNROLLED_LOOP_INDEX < CSM_CASCADE_COUNT
    #endif // UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
  }
  #pragma unroll_loop_end

  // No loop here: all cascaded lights are in fact one light only.
  RE_Direct(
    directLight,
    geometryPosition,
    geometryNormal,
    geometryViewDir,
    geometryClearcoatNormal,
    material,
    reflectedLight
  );

  // The rest of directional lights.
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    #if UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
    #if UNROLLED_LOOP_INDEX >= CSM_CASCADE_COUNT
    directionalLight = directionalLights[i];
    getDirectionalLightInfo(directionalLight, directLight);

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

    RE_Direct(
      directLight,
      geometryPosition,
      geometryNormal,
      geometryViewDir,
      geometryClearcoatNormal,
      material,
      reflectedLight
    );
    #endif // UNROLLED_LOOP_INDEX >= CSM_CASCADE_COUNT
    #endif // UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
  }
  #pragma unroll_loop_end
}
