# Cascaded Shadow Maps

This library is based on the following work:

- [StrandedKitty’s three-csm](https://github.com/StrandedKitty/three-csm/tree/master/src)
- [Three.js contributors’ CSM example](https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm)

As of version 4.2.1, three-csm is incompatible with Three.js versions ≥ r157, following the [removal of GeometryContext](https://github.com/mrdoob/three.js/pull/26805). The CSM example in Three.js r169 does not allow the use of materials not extended by the CSM. There are several design issues in the first place, such as constructor with side effects, finicky material shader overrides (which, admittedly, are necessary), and difficulties when used with R3F.

Please consider this library as a refactored version of the work above. If you think it’s worth merging these changes back into the original projects, feel free to help me out.

## Limitations

1. The directional lights for the CSM must be prioritized at the beginning of the scene traversal, in a specific order, before other shadow-casting directional lights. This also means you cannot add directional lights with map texturing unless map texturing is also enabled for the CSM lights, as these are [always sorted first](https://github.com/mrdoob/three.js/blob/r169/src/renderers/webgl/WebGLLights.js#L232).

2. CSM typically renders depths of different cascades to a single texture by dividing it by a power of 2 (commonly by 4). The current implementation binds 4 separate depth textures, which may [introduce some overhead that could be optimized](https://github.com/mrdoob/three.js/issues/18934), but this cannot be addressed with the current API of Three.js.

3. Scene-dependent frustum splitting is not supported, as it was not required for my use case where the scene may cover the entire Earth.
