void nonShadowCastingLights() {
  #pragma unroll_loop_start
  for (int i = NUM_DIR_LIGHT_SHADOWS; i < NUM_DIR_LIGHTS; i++) {
    directionalLight = directionalLights[i];
    getDirectionalLightInfo(directionalLight, directLight);

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
