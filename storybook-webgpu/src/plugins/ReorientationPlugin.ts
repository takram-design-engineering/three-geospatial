import { ReorientationPlugin as ReorientationPluginBase } from '3d-tiles-renderer/plugins'

declare module '3d-tiles-renderer/plugins' {
  interface ReorientationPlugin {
    lat?: number
    lon?: number
    height?: number
  }
}

export class ReorientationPlugin extends ReorientationPluginBase {
  invalidate(): void {
    const { lat, lon, height } = this
    if (lat != null && lon != null) {
      this.transformLatLonHeightToOrigin(lat, lon, height)
    }
  }
}
