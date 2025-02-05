// TODO: Maybe switch to Vogel disk with IGN:
// https://www.gamedev.net/tutorials/programming/graphics/contact-hardening-soft-shadows-made-fast-r4906/
// Taken from: https://developer.download.nvidia.com/whitepapers/2008/PCSS_Integration.pdf
const vec2 poissonDisk[16] = vec2[16](
  vec2(-0.94201624, -0.39906216),
  vec2(0.94558609, -0.76890725),
  vec2(-0.094184101, -0.9293887),
  vec2(0.34495938, 0.2938776),
  vec2(-0.91588581, 0.45771432),
  vec2(-0.81544232, -0.87912464),
  vec2(-0.38277543, 0.27676845),
  vec2(0.97484398, 0.75648379),
  vec2(0.44323325, -0.97511554),
  vec2(0.53742981, -0.4737342),
  vec2(-0.26496911, -0.41893023),
  vec2(0.79197514, 0.19090188),
  vec2(-0.2418884, 0.99706507),
  vec2(-0.81409955, 0.9143759),
  vec2(0.19984126, 0.78641367),
  vec2(0.14383161, -0.1410079)
);

#define POISSON_DISK_COUNT (16)
