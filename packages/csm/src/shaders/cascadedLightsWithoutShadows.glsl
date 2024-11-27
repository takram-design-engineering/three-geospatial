// Based on the following work:
// https://github.com/StrandedKitty/three-csm/tree/master/src
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

void cascadedLightsWithoutShadows() {
  // No loop here: all cascaded lights are in fact one light only.
  getDirectionalLightInfo(directionalLights[0], directLight);
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
  for (int i = CSM_CASCADE_COUNT; i < NUM_DIR_LIGHTS; i++) {
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
