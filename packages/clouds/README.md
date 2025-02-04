# @takram/three-clouds

[![Storybook](https://img.shields.io/badge/-Storybook-FF4785?style=flat-square&logo=storybook&logoColor=white)](https://takram-design-engineering.github.io/three-geospatial/?path=/story/clouds-wip-clouds--basic)

This library is under active development and is in pre-release status.

## Synopsis

TBD

# API

TBD

# References

In alphabetical order

- [A Survey of Temporal Antialiasing Techniques](https://research.nvidia.com/labs/rtr/publication/yang2020survey/)
  - Summarizes key concepts and techniques of TAA and TAAU.
- [An Excursion in Temporal Supersampling](https://developer.download.nvidia.com/gameworks/events/GDC2016/msalvi_temporal_supersampling.pdf)
  - Covers variance clipping in detail.
- [Convincing Cloud Rendering – An Implementation of Real-Time Dynamic Volumetric Clouds in Frostbite](https://odr.chalmers.se/items/53d0fe07-df09-4cd1-ae7d-6c05491b52bf)
  - A comprehensive guide to rendering volumetric clouds.
- [Interactive Multiple Anisotropic Scattering in Clouds](https://inria.hal.science/inria-00333007)
  - Not specifically for real-time rendering, but provides the math behind light-cloud interactions.
- [Nubis - Authoring Realtime Volumetric Cloudscapes with the Decima Engine](https://www.guerrilla-games.com/read/nubis-authoring-real-time-volumetric-cloudscapes-with-the-decima-engine)
  - A well-known presentation on volumetric clouds, similar to Guerrilla Games’ slides.
- [Oz: The Great and Volumetric](https://www.researchgate.net/publication/262309690_Oz_the_great_and_volumetric)
  - A short paper on multiple scattering approximation.
- [Physically Based and Scalable Atmospheres in Unreal Engine](https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf)
  - Briefly introduces BSM.
- [Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite](https://www.ea.com/frostbite/news/physically-based-sky-atmosphere-and-cloud-rendering)
  - One of the most influential papers on real-time volumetric rendering. It covers many essential techniques, including the basics of volumetric ray marching, energy-conserving analytical integration of scattered light, transmittance-weighted mean depth of clouds, and more.
- [Real-Time Volumetric Rendering](https://patapom.com/topics/Revision2013/Revision%202013%20-%20Real-time%20Volumetric%20Rendering%20Course%20Notes.pdf)
  - An introductory course on volumetric cloud rendering.
- [Spatiotemporal Blue Noise Masks](https://research.nvidia.com/publication/2022-07_spatiotemporal-blue-noise-masks)
  - The paper and SDK on STBN, which is used extensively for stochastic sampling.
- [Temporal Reprojection Anti-Aliasing in INSIDE](https://gdcvault.com/play/1022970/Temporal-Reprojection-Anti-Aliasing-in)
  - A detailed presentation on TAA.
- [The Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://www.guerrilla-games.com/read/the-real-time-volumetric-cloudscapes-of-horizon-zero-dawn)
  - Another well-known presentation on volumetric clouds, similar to the Nubis slides, introducing the powder term.

**Implementation References**

- [Clouds](https://github.com/lightest/clouds) by lightest
  - Useful for understanding the missing details in BSM and crepuscular rays.
- [Procedural Scene in OpenGL 4](https://github.com/fede-vaccaro/TerrainEngine-OpenGL) by fade-vaccaro
  - Helps in grasping the fundamentals of volumetric cloud ray marching.
- [Skybolt](https://github.com/Prograda/Skybolt) by Prograda
  - Helps in modeling global volumetric clouds and controlling coverage.
- [Structured Volume Sampling](https://github.com/huwb/volsample) by huwb
  - A reference for implementing Structured Volume Sampling.
- [three-csm](https://github.com/StrandedKitty/three-csm/) by StrandedKitty
  - A reference for implementing Cascaded Shadow Maps.
- [Tileable Volume Noise](https://github.com/sebh/TileableVolumeNoise) by sebh
  - A reference for implementing volumetric noise in cloud shape and details.
- [Volumetric Cloud](https://www.shadertoy.com/view/3sffzj) by airo
  - A basic example of volumetric cloud ray marching.

# License

[MIT](LICENSE)
