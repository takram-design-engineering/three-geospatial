// Based on the following work:
// https://github.com/StrandedKitty/three-csm/tree/master/src
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

void cascadedFadedLights() {
  directionalLight = directionalLights[0];
  getDirectionalLightInfo(directionalLight, directLight);

  float clipDepth = vViewPosition.z / (csmFar - csmNear);
  bool lastCascade;
  vec2 cascade;
  float cascadeCenter;
  float closestEdge;
  float margin;
  float shadow = 1.0;
  float nextShadow = 1.0;

  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    #if UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
    #if UNROLLED_LOOP_INDEX < CSM_CASCADE_COUNT

    lastCascade = UNROLLED_LOOP_INDEX == CSM_CASCADE_COUNT - 1;
    cascade = csmCascades[i];
    cascadeCenter = (cascade.x + cascade.y) * 0.5;
    closestEdge = clipDepth < cascadeCenter ? cascade.x : cascade.y;
    margin = 0.25 * pow(closestEdge, 2.0);
    cascade += margin * vec2(-0.5, 0.5);

    if (clipDepth >= cascade.x && (clipDepth < cascade.y || lastCascade)) {
      directionalLightShadow = directionalLightShadows[i];
      float prevShadow = nextShadow;
      nextShadow =
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

      shadow = mix(
        prevShadow,
        nextShadow,
        saturate(min(clipDepth - cascade.x, cascade.y - clipDepth) / margin)
      );
    }
    #endif // UNROLLED_LOOP_INDEX < CSM_CASCADE_COUNT
    #endif // UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS
  }
  #pragma unroll_loop_end

  // No loop here: all cascaded lights are in fact one light only.
  directLight.color *= shadow;
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
