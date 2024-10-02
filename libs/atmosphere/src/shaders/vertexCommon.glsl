// TODO: Consider ATMOSPHERE_BOTTOM_RADIUS
float getHeightAdjustment(float height, vec3 ellipsoidRadii) {
  float diff = ellipsoidRadii.x - ellipsoidRadii.z;
  float min = ellipsoidRadii.x * 0.25;
  float max = ellipsoidRadii.x;
  float modifier = diff * 0.5;
  float distance = modifier * clamp((height - min) / (max - min), 0.0, 1.0);
  return diff * 0.25 + distance;
}
